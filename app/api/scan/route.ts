import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient, parseSignal } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';
import { indicators } from '@/lib/indicators';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { config, count = 5 } = body;

  const exchange = config.EXCHANGE || 'BYBIT';
  const params = config.INDICATOR_PARAMS || { RSI: 14, EMA_FAST: 9, EMA_SLOW: 21, ATR: 14, MACD_FAST: 12, MACD_SLOW: 26, BB_PERIOD: 20 };

  try {
    let candidates = [];
    let client: any;

    if (exchange === 'BYBIT') {
      client = getBybitClient(config);
      const posResp = await client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' });
      const openPositions = posResp.retCode === 0 ? posResp.result.list.filter((p: any) => parseFloat(p.size) !== 0).map((p: any) => p.symbol) : [];
      const tickerResp = await client.getTickers({ category: 'linear' });
      const exclude = ['BUSDT', 'USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'USDPUSDT', 'DAIUSDT', 'WBTCUSDT', 'WETHUSDT', ...openPositions];
      candidates = tickerResp.result.list
        .filter((t: any) => t.symbol.endsWith('USDT') && !exclude.some(e => t.symbol === e) && parseFloat(t.turnover24h) > 20000000)
        .map((t: any) => ({ symbol: t.symbol, price: parseFloat(t.lastPrice), change: parseFloat(t.price24hPcnt) * 100, volume: parseFloat(t.turnover24h) }))
        .sort((a: any, b: any) => b.volume - a.volume).slice(0, 15).sort(() => Math.random() - 0.5).slice(0, count);
    } else {
      client = getBinanceClient(config);
      const posInfo = await client.getPositions();
      const openPositions = posInfo.filter((p: any) => parseFloat(p.positionAmt) !== 0).map((p: any) => p.symbol);
      const tickerResp = await client.get24hrChangeStat();
      const exclude = ['BUSDT', 'USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'USDPUSDT', 'DAIUSDT', 'WBTCUSDT', 'WETHUSDT', ...openPositions];
      candidates = tickerResp
        .filter((t: any) => t.symbol.endsWith('USDT') && !exclude.some(e => t.symbol === e) && parseFloat(t.quoteVolume) > 20000000)
        .map((t: any) => ({ symbol: t.symbol, price: parseFloat(t.lastPrice), change: parseFloat(t.priceChangePercent), volume: parseFloat(t.quoteVolume) }))
        .sort((a: any, b: any) => b.volume - a.volume).slice(0, 15).sort(() => Math.random() - 0.5).slice(0, count);
    }

    const analysisPromises = candidates.map(async (c) => {
      try {
        let k4h, k1h;
        if (exchange === 'BYBIT') {
          const [r4h, r1h] = await Promise.all([
            client.getKline({ category: 'linear', symbol: c.symbol, interval: '240', limit: 100 }),
            client.getKline({ category: 'linear', symbol: c.symbol, interval: '60', limit: 100 })
          ]);
          k4h = r4h.result.list; k1h = r1h.result.list;
        } else {
          k4h = await client.getKlines({ symbol: c.symbol, interval: '4h', limit: 100 });
          k1h = await client.getKlines({ symbol: c.symbol, interval: '1h', limit: 100 });
        }

        const closes4h = k4h.map((k: any) => parseFloat(k[4]));
        
        const data = {
          ...c,
          indicators4h: { 
            rsi: indicators.rsi(closes4h, params.RSI), 
            emaFast: indicators.ema(closes4h, params.EMA_FAST), 
            emaSlow: indicators.ema(closes4h, params.EMA_SLOW), 
            atr: indicators.atr(k4h, params.ATR),
            macd: indicators.macd(closes4h, params.MACD_FAST, params.MACD_SLOW),
            bb: indicators.bollinger(closes4h, params.BB_PERIOD)
          }
        };

        const aiOpinion = await getAIAnalysis(data, config, config.ACTIVE_INDICATORS || ['RSI', 'EMA'], params);
        
        let maxLev = 20;
        if (exchange === 'BYBIT') {
          const riskResp = await client.getRiskLimit({ category: 'linear', symbol: c.symbol });
          maxLev = riskResp.retCode === 0 && riskResp.result.list?.[0] ? parseInt(riskResp.result.list[0].maxLeverage) : 20;
        }
        return { ...c, opinion: aiOpinion, signal: parseSignal(aiOpinion), maxLeverage: maxLev };
      } catch (e: any) { 
        return { ...c, opinion: `Analysis Error: ${e.message}`, signal: { side: 'WAIT' }, maxLeverage: 20 };
      }
    });

    const results = (await Promise.all(analysisPromises)).filter(r => r !== null);
    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getAIAnalysis(data: any, config: any, active: string[], params: any) {
  const provider = config.AI_PROVIDER || 'OPENROUTER';
  const apiKey = provider === 'OPENROUTER' ? config.OPENROUTER_API_KEY : config.GROQ_API_KEY;
  
  let model = config.AI_MODEL;
  if (!model || model === 'llama3-70b-8192') {
    model = provider === 'OPENROUTER' ? 'openrouter/owl-alpha' : 'llama-3.3-70b-versatile';
  }

  let techData = "";
  if (active.includes('RSI')) techData += `- RSI (${params.RSI}): ${data.indicators4h.rsi.toFixed(2)}\n`;
  if (active.includes('EMA')) techData += `- EMA (${params.EMA_FAST}/${params.EMA_SLOW}): Fast ${data.indicators4h.emaFast.toFixed(2)}, Slow ${data.indicators4h.emaSlow.toFixed(2)}\n`;
  if (active.includes('MACD')) techData += `- MACD: Line ${data.indicators4h.macd.macdLine.toFixed(4)}\n`;
  if (active.includes('BB')) techData += `- Bollinger: Upper ${data.indicators4h.bb.upper.toFixed(2)}, Lower ${data.indicators4h.bb.lower.toFixed(2)}\n`;
  if (active.includes('ATR')) techData += `- ATR (${params.ATR}): ${data.indicators4h.atr.toFixed(4)}\n`;

  const prompt = `As a Senior Crypto Futures Trader, provide a deep technical analysis for ${data.symbol}:
Price: $${data.price} | 24h Change: ${data.change.toFixed(2)}% | 24h Vol: $${(data.volume/1e6).toFixed(2)}M

4H Technical Indicators:
${techData}

Task:
1. Provide a detailed technical opinion based on the metrics above (use emojis).
2. Justify why the market is currently a LONG, SHORT, or WAIT.
3. If signal is LONG/SHORT, provide EXACT levels based on current price.
4. Assign a CONFIDENCE percentage (0-100%) for this setup.
5. Identify the RECOMMENDED_TP (1, 2, or 3) based on how optimistic you are about the momentum.

The response MUST start with your technical reasoning and analysis, and END with this EXACT block format:
SIGNAL: [LONG/SHORT/WAIT]
CONFIDENCE: [Number]%
RECOMMENDED_TP: [1/2/3]
ENTRY: [Number]
TP1: [Number] ([Percentage]%)
TP2: [Number] ([Percentage]%)
TP3: [Number] ([Percentage]%)
SL: [Number]`;

  const url = provider === 'OPENROUTER' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });

    const json = await resp.json();
    
    if (json.error) {
      return `AI API Error: ${json.error.message || JSON.stringify(json.error)}`;
    }

    return json.choices?.[0]?.message?.content || "AI Response Format Error.";
  } catch (err: any) {
    return `Network Error: ${err.message}`;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient, parseSignal } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';
import { indicators } from '@/lib/indicators';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { config, count = 5 } = body;

  const exchange = config.EXCHANGE || 'BYBIT';
  const aiProvider = config.AI_PROVIDER || 'OPENROUTER';

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
        .sort((a: any, b: any) => b.volume - a.volume)
        .slice(0, 15)
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
    } else {
      client = getBinanceClient(config);
      const posInfo = await client.getPositions();
      const openPositions = posInfo.filter((p: any) => parseFloat(p.positionAmt) !== 0).map((p: any) => p.symbol);

      const tickerResp = await client.get24hrChangeStat();
      const exclude = ['BUSDT', 'USDCUSDT', 'FDUSDUSDT', 'TUSDUSDT', 'USDPUSDT', 'DAIUSDT', 'WBTCUSDT', 'WETHUSDT', ...openPositions];

      candidates = tickerResp
        .filter((t: any) => t.symbol.endsWith('USDT') && !exclude.some(e => t.symbol === e) && parseFloat(t.quoteVolume) > 20000000)
        .map((t: any) => ({ symbol: t.symbol, price: parseFloat(t.lastPrice), change: parseFloat(t.priceChangePercent), volume: parseFloat(t.quoteVolume) }))
        .sort((a: any, b: any) => b.volume - a.volume)
        .slice(0, 15)
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
    }

    const analysisPromises = candidates.map(async (c) => {
      try {
        let k4h, k1h;
        if (exchange === 'BYBIT') {
          const [r4h, r1h] = await Promise.all([
            client.getKline({ category: 'linear', symbol: c.symbol, interval: '240', limit: 50 }),
            client.getKline({ category: 'linear', symbol: c.symbol, interval: '60', limit: 50 })
          ]);
          k4h = r4h.result.list;
          k1h = r1h.result.list;
        } else {
          k4h = await client.getKlines({ symbol: c.symbol, interval: '4h', limit: 50 });
          k1h = await client.getKlines({ symbol: c.symbol, interval: '1h', limit: 50 });
        }

        const closes4h = k4h.map((k: any) => parseFloat(exchange === 'BYBIT' ? k[4] : k[4]));
        const closes1h = k1h.map((k: any) => parseFloat(exchange === 'BYBIT' ? k[4] : k[4]));

        const data = {
          ...c,
          indicators4h: { rsi: indicators.rsi(closes4h), ema9: indicators.ema(closes4h, 9), ema21: indicators.ema(closes4h, 21), atr: indicators.atr(k4h, exchange === 'BINANCE') },
          indicators1h: { rsi: indicators.rsi(closes1h), ema9: indicators.ema(closes1h, 9), ema21: indicators.ema(closes1h, 21) }
        };

        const aiOpinion = await getAIAnalysis(data, config, activeIndicators(config));
        
        let maxLev = 20;
        if (exchange === 'BYBIT') {
          const riskResp = await client.getRiskLimit({ category: 'linear', symbol: c.symbol });
          maxLev = riskResp.retCode === 0 && riskResp.result.list?.[0] ? parseInt(riskResp.result.list[0].maxLeverage) : 20;
        }

        return { ...c, opinion: aiOpinion, signal: parseSignal(aiOpinion), maxLeverage: maxLev };
      } catch (e) { return null; }
    });

    const results = (await Promise.all(analysisPromises)).filter(r => r !== null);
    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function activeIndicators(config: any) {
  return config.ACTIVE_INDICATORS || ['RSI', 'EMA', 'ATR'];
}

async function getAIAnalysis(data: any, config: any, activeIndicators: string[]) {
  const provider = config.AI_PROVIDER || 'OPENROUTER';
  const apiKey = provider === 'OPENROUTER' ? config.OPENROUTER_API_KEY : config.GROQ_API_KEY;

  let indicatorText4h = "";
  let indicatorText1h = "";

  if (activeIndicators.includes('RSI')) {
    indicatorText4h += `- RSI: ${data.indicators4h.rsi.toFixed(2)}\n`;
    indicatorText1h += `- RSI: ${data.indicators1h.rsi.toFixed(2)}\n`;
  }
  if (activeIndicators.includes('EMA')) {
    indicatorText4h += `- EMA9: ${data.indicators4h.ema9.toFixed(4)}\n- EMA21: ${data.indicators4h.ema21.toFixed(4)}\n- Trend: ${data.indicators4h.ema9 > data.indicators4h.ema21 ? 'BULLISH' : 'BEARISH'}\n`;
    indicatorText1h += `- EMA9: ${data.indicators1h.ema9.toFixed(4)}\n- EMA21: ${data.indicators1h.ema21.toFixed(4)}\n`;
  }
  if (activeIndicators.includes('ATR')) {
    indicatorText4h += `- ATR: ${data.indicators4h.atr.toFixed(4)}\n`;
  }

  const prompt = `As a Senior Crypto Futures Trader, analyze this data for ${data.symbol}:
Current Price: $${data.price}
24h Change: ${data.change.toFixed(2)}%
24h Vol: $${(data.volume / 1e6).toFixed(2)}M

4H Indicators:
${indicatorText4h}
1H Indicators:
${indicatorText1h}

Task:
1. Provide a clear signal (LONG, SHORT, or WAIT), prefer MARKET signal than LIMIT.
2. Provide 3 strong technical reasons based on the indicators above.
3. Target a high win-rate setup.
4. If signal is LONG/SHORT, provide EXACT: Entry, TP1, TP2, TP3, and SL based on CURRENT PRICE.

Response MUST include emojis, technical analysis and end with this EXACT format:
SIGNAL: [LONG/SHORT/WAIT]
ENTRY: [Number]
TP1: [Number] ([Percentage]%)
TP2: [Number] ([Percentage]%)
TP3: [Number] ([Percentage]%)
SL: [Number]`;

  const url = provider === 'OPENROUTER' 
    ? 'https://openrouter.ai/api/v1/chat/completions' 
    : 'https://api.groq.com/openai/v1/chat/completions';

  const model = provider === 'OPENROUTER' ? 'openrouter/owl-alpha' : 'llama3-70b-8192';

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
  });

  const json = await resp.json();
  return json.choices?.[0]?.message?.content || "AI Analysis Failed.";
}

import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient, sendTelegramMessage } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, signal, tpPrice, config } = body;

  const exchange = config.EXCHANGE || 'BYBIT';
  const key = exchange === 'BYBIT' ? config.BYBIT_API_KEY : config.BINANCE_API_KEY;
  const secret = exchange === 'BYBIT' ? config.BYBIT_API_SECRET : config.BINANCE_API_SECRET;

  if (!key || !secret) return NextResponse.json({ error: 'Missing API credentials' }, { status: 401 });

  try {
    if (exchange === 'BYBIT') {
      const client = getBybitClient(config);
      // 1. Get Max Leverage
      const riskResp = await client.getRiskLimit({ category: 'linear', symbol });
      const maxLev = riskResp.retCode === 0 && riskResp.result.list?.[0] ? parseInt(riskResp.result.list[0].maxLeverage) : 20;

      // 2. Set Leverage
      await client.setLeverage({ category: 'linear', symbol, buyLeverage: maxLev.toString(), sellLeverage: maxLev.toString() }).catch(() => {});

      // 3. Detect Position Mode
      const posInfo = await client.getPositionInfo({ category: 'linear', symbol });
      let positionIdx = 0;
      if (posInfo.retCode === 0 && posInfo.result.list.length > 0) {
        const hasHedge = posInfo.result.list.length > 1 || posInfo.result.list[0].positionIdx !== 0;
        if (hasHedge) positionIdx = signal.side === 'LONG' ? 1 : 2;
      }

      const tickerResp = await client.getTickers({ category: 'linear', symbol });
      const ticker = tickerResp.result.list[0];
      const currentPrice = parseFloat(ticker.lastPrice);
      const entryPrice = signal.entry || currentPrice;

      const instrInfo = await client.getInstrumentsInfo({ category: 'linear', symbol });
      const symInfo = instrInfo.result.list[0];
      const pricePrecision = Math.max(0, symInfo.priceFilter.tickSize.indexOf('1') - symInfo.priceFilter.tickSize.indexOf('.'));
      const qtyPrecision = Math.max(0, symInfo.lotSizeFilter.qtyStep.indexOf('1') - symInfo.lotSizeFilter.qtyStep.indexOf('.'));

      let totalQuantity = (config.FIXED_MARGIN_USDT * maxLev) / entryPrice;
      totalQuantity = parseFloat(totalQuantity.toFixed(qtyPrecision));

      let slPriceNum = signal.sl;
      let tpPriceNum = tpPrice;

      const orderParams: any = {
        category: 'linear',
        symbol,
        side: signal.side === 'LONG' ? 'Buy' : 'Sell',
        orderType: 'Market',
        qty: totalQuantity.toString(),
        positionIdx: positionIdx,
        takeProfit: tpPriceNum.toFixed(pricePrecision),
        stopLoss: slPriceNum.toFixed(pricePrecision),
        tpslMode: 'Full',
        tpOrderType: 'Market',
        slOrderType: 'Market'
      };

      const order = await client.submitOrder(orderParams);
      if (order.retCode === 0) {
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const tgMsg = `🚀 *FORGE STRATEGY DEPLOYED*\n\n` +
                        `*Pair:* ${symbol}\n` +
                        `*Side:* ${orderParams.side}\n` +
                        `*Entry:* $${currentPrice}\n` +
                        `*TP:* $${orderParams.takeProfit}\n` +
                        `*SL:* $${orderParams.stopLoss}`;
          await sendTelegramMessage(tgMsg, config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID);
        }
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({ error: order.retMsg }, { status: 400 });
      }
    } else {
      const client = getBinanceClient(config);
      // 1. Get Leverage & Instrument
      const exchangeInfo = await client.getExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
      const ticker = await client.getSymbolOrderBookTicker({ symbol });
      const currentPrice = parseFloat(ticker.askPrice); // Ask for Buy, Bid for Sell

      // 2. Set Leverage
      await client.setLeverage({ symbol, leverage: 20 }).catch(() => {});

      let totalQuantity = (config.FIXED_MARGIN_USDT * 20) / currentPrice;
      const qtyStep = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').stepSize;
      const qtyPrecision = Math.max(0, qtyStep.indexOf('1') - qtyStep.indexOf('.'));
      totalQuantity = parseFloat(totalQuantity.toFixed(qtyPrecision));

      // 3. Submit Market Order
      const order = await client.submitNewOrder({
        symbol,
        side: signal.side === 'LONG' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: totalQuantity
      });

      // 4. Submit TP/SL
      if (tpPrice) {
        await client.submitNewOrder({
          symbol,
          side: signal.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: parseFloat(tpPrice),
          closePosition: 'true'
        }).catch(() => {});
      }
      if (signal.sl) {
        await client.submitNewOrder({
          symbol,
          side: signal.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'STOP_MARKET',
          stopPrice: parseFloat(signal.sl),
          closePosition: 'true'
        }).catch(() => {});
      }

      return NextResponse.json({ success: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

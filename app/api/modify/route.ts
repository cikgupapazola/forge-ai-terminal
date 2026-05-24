import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, takeProfit, stopLoss, config } = body;

  const exchange = config.EXCHANGE || 'BYBIT';
  const key = exchange === 'BYBIT' ? config.BYBIT_API_KEY : config.BINANCE_API_KEY;
  const secret = exchange === 'BYBIT' ? config.BYBIT_API_SECRET : config.BINANCE_API_SECRET;

  if (!key || !secret) return NextResponse.json({ error: 'Missing API credentials' }, { status: 401 });

  try {
    if (exchange === 'BYBIT') {
      const client = getBybitClient(config);
      const resp = await client.setTradingStop({
        category: 'linear',
        symbol,
        takeProfit: takeProfit?.toString(),
        stopLoss: stopLoss?.toString(),
        tpslMode: 'Full'
      });

      if (resp.retCode === 0) return NextResponse.json({ success: true });
      return NextResponse.json({ error: resp.retMsg }, { status: 400 });
    } else {
      const client = getBinanceClient(config);
      // Binance handles TP/SL via separate orders usually or via setTradingStop if supported
      // For USDM, we use newOrder with type TAKE_PROFIT_MARKET and STOP_MARKET
      if (takeProfit) {
        await client.submitNewOrder({
          symbol,
          side: 'SELL', // Simplification, need to check current side
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: parseFloat(takeProfit),
          closePosition: 'true'
        });
      }
      if (stopLoss) {
        await client.submitNewOrder({
          symbol,
          side: 'SELL', // Simplification
          type: 'STOP_MARKET',
          stopPrice: parseFloat(stopLoss),
          closePosition: 'true'
        });
      }
      return NextResponse.json({ success: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

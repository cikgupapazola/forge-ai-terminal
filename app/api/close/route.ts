import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, side, qty, positionIdx, config } = body;

  const exchange = config.EXCHANGE || 'BYBIT';
  const key = exchange === 'BYBIT' ? config.BYBIT_API_KEY : config.BINANCE_API_KEY;
  const secret = exchange === 'BYBIT' ? config.BYBIT_API_SECRET : config.BINANCE_API_SECRET;

  if (!key || !secret) return NextResponse.json({ error: 'Missing API credentials' }, { status: 401 });

  try {
    if (exchange === 'BYBIT') {
      const client = getBybitClient(config);
      const order = await client.submitOrder({
        category: 'linear',
        symbol,
        side: side === 'Buy' ? 'Sell' : 'Buy',
        orderType: 'Market',
        qty,
        positionIdx: positionIdx ? parseInt(positionIdx.toString()) : 0,
        reduceOnly: true
      });

      if (order.retCode === 0) return NextResponse.json({ success: true, orderId: order.result.orderId });
      return NextResponse.json({ error: order.retMsg }, { status: 400 });
    } else {
      const client = getBinanceClient(config);
      const order: any = await client.submitNewOrder({
        symbol,
        side: side === 'Buy' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: parseFloat(qty),
        reduceOnly: 'true'
      });
      return NextResponse.json({ success: true, orderId: order.orderId });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

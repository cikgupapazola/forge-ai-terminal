import { NextRequest, NextResponse } from 'next/server';
import { getBybitClient } from '@/lib/bybit';
import { getBinanceClient } from '@/lib/binance';

export async function GET(req: NextRequest) {
  const exchange = req.headers.get('x-exchange') || 'BYBIT';
  const key = req.headers.get('x-api-key');
  const secret = req.headers.get('x-api-secret');

  if (!key || !secret) {
    return NextResponse.json({ error: 'Missing API credentials' }, { status: 401 });
  }

  try {
    if (exchange === 'BYBIT') {
      const client = getBybitClient({ BYBIT_API_KEY: key, BYBIT_API_SECRET: secret });
      const resp = await client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' });
      if (resp.retCode !== 0) return NextResponse.json({ error: resp.retMsg }, { status: 400 });
      return NextResponse.json(resp.result.list.filter((p: any) => parseFloat(p.size) !== 0));
    } else {
      const client = getBinanceClient({ BINANCE_API_KEY: key, BINANCE_API_SECRET: secret });
      const positions = await client.getPositions();
      return NextResponse.json(positions.filter((p: any) => parseFloat(p.positionAmt) !== 0).map((p: any) => ({
        symbol: p.symbol,
        side: parseFloat(p.positionAmt) > 0 ? 'Buy' : 'Sell',
        size: Math.abs(parseFloat(p.positionAmt)).toString(),
        avgPrice: p.entryPrice,
        markPrice: p.markPrice,
        unrealisedPnl: p.unRealizedProfit,
        leverage: p.leverage,
        takeProfit: p.takeProfitPrice || '0',
        stopLoss: p.stopLossPrice || '0',
        positionIdx: p.positionSide === 'LONG' ? 1 : (p.positionSide === 'SHORT' ? 2 : 0)
      })));
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

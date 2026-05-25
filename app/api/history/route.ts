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
      // Bybit V5 returns orderId in getClosedPnL
      const resp = await client.getClosedPnL({ category: 'linear', limit: 50 });
      
      if (resp.retCode !== 0) return NextResponse.json({ error: resp.retMsg }, { status: 400 });

      return NextResponse.json(resp.result.list.map((h: any) => ({
        symbol: h.symbol,
        side: h.side,
        qty: h.qty,
        entry: h.avgEntryPrice,
        exit: h.avgExitPrice,
        pnl: h.closedPnl,
        time: parseInt(h.updatedTime),
        orderId: h.orderId // Used for matching with local tracking
      })));
    } else {
      const client = getBinanceClient({ BINANCE_API_KEY: key, BINANCE_API_SECRET: secret });
      // Binance Income doesn't show OrderId, but getAccountTradeList does.
      // However, trade list requires a symbol. For a general dashboard, we stick to income
      // or implement a multi-symbol fetch (more complex).
      const income = await client.getIncome({ incomeType: 'CLOSED_PNL', limit: 50 });
      
      return NextResponse.json(income.map((h: any) => ({
        symbol: h.symbol,
        side: 'N/A',
        qty: 'N/A',
        entry: '0',
        exit: '0',
        pnl: h.income,
        time: h.time,
        orderId: h.tranId // Closest thing to a unique ID in income
      })));
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

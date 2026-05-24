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
      let balanceResult;
      try {
        balanceResult = await client.getWalletBalance({ accountType: 'UNIFIED', coin: 'USDT' });
      } catch (e) {
        balanceResult = await client.getWalletBalance({ accountType: 'CONTRACT', coin: 'USDT' });
      }

      if (balanceResult.retCode !== 0) return NextResponse.json({ error: balanceResult.retMsg }, { status: 400 });

      const account = balanceResult.result.list[0];
      const usdt = account.coin.find((x: any) => x.coin === 'USDT');
      
      return NextResponse.json({
        walletBalance: parseFloat(usdt?.walletBalance || usdt?.availableToWithdraw || '0'),
        totalEquity: parseFloat(account.totalEquity || '0')
      });
    } else {
      const client = getBinanceClient({ BINANCE_API_KEY: key, BINANCE_API_SECRET: secret });
      const accountInfo = await client.getAccountInformation();
      const usdt = accountInfo.assets.find((a: any) => a.asset === 'USDT');
      
      return NextResponse.json({
        walletBalance: parseFloat(usdt?.availableBalance || '0'),
        totalEquity: parseFloat(accountInfo.totalMarginBalance || '0')
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

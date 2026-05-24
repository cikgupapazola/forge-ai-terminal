export const indicators = {
  ema: (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  },
  rsi: (closes: number[], period = 14) => {
    let gains = 0,
      losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[closes.length - i] - closes[closes.length - i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = gains / period / (losses / period || 1);
    return 100 - 100 / (1 + rs);
  },
  atr: (klines: any[][], isBinance = false) => {
    const period = 14;
    let trs = [];
    for (let i = 1; i < klines.length; i++) {
      // Bybit [timestamp, open, high, low, close]
      // Binance [timestamp, open, high, low, close, volume, ...]
      // For both, high is index 2, low is index 3, close is index 4
      const h = parseFloat(klines[i][2]);
      const l = parseFloat(klines[i][3]);
      const pc = parseFloat(klines[i - 1][4]);
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  },
};

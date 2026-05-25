export const indicators = {
  ema: (data: number[], period: number) => {
    if (data.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  },
  rsi: (closes: number[], period = 14) => {
    if (closes.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[closes.length - i] - closes[closes.length - i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = (gains / period) / (losses / period || 1);
    return 100 - (100 / (1 + rs));
  },
  atr: (klines: any[][], period = 14) => {
    if (klines.length <= period) return 0;
    let trs = [];
    for (let i = 1; i < klines.length; i++) {
      const h = parseFloat(klines[i][2]);
      const l = parseFloat(klines[i][3]);
      const pc = parseFloat(klines[i - 1][4]);
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  },
  macd: (closes: number[], fast = 12, slow = 26, signal = 9) => {
    const emaFast = indicators.ema(closes, fast);
    const emaSlow = indicators.ema(closes, slow);
    const macdLine = emaFast - emaSlow;
    // Simplification for signal: in real-time we'd need a history of MACD lines
    return { macdLine, emaFast, emaSlow };
  },
  bollinger: (closes: number[], period = 20, stdDev = 2) => {
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);
    return { middle: sma, upper: sma + (stdDev * sd), lower: sma - (stdDev * sd) };
  }
};

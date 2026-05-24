export interface TradingSignal {
  side: 'LONG' | 'SHORT' | 'WAIT';
  entry?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  sl?: number;
  probs?: string[];
}

export interface MarketCandidate {
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

export interface AIAnalysisResult {
  symbol: string;
  price: number;
  change: number;
  opinion: string;
  signal: TradingSignal;
  maxLeverage: number;
}

export interface ZenithConfig {
  EXCHANGE: 'BYBIT' | 'BINANCE';
  BYBIT_API_KEY: string;
  BYBIT_API_SECRET: string;
  BINANCE_API_KEY: string;
  BINANCE_API_SECRET: string;
  AI_PROVIDER: 'OPENROUTER' | 'GROQ';
  OPENROUTER_API_KEY: string;
  GROQ_API_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  FIXED_MARGIN_USDT: number;
  ACTIVE_INDICATORS: string[];
}

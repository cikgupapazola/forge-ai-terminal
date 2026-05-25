export interface TradingSignal {
  side: 'LONG' | 'SHORT' | 'WAIT';
  entry?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  sl?: number;
  probs?: string[];
  confidence?: number;
  recommendedTp?: number;
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
  AI_MODEL: string;
  OPENROUTER_API_KEY: string;
  GROQ_API_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  FIXED_MARGIN_USDT: number;
  ACTIVE_INDICATORS: string[];
  INDICATOR_PARAMS: {
    RSI: number;
    EMA_FAST: number;
    EMA_SLOW: number;
    ATR: number;
    MACD_FAST: number;
    MACD_SLOW: number;
    BB_PERIOD: number;
  };
  AUTO_SCAN_ENABLED: boolean;
  AUTO_SCAN_INTERVAL: number;
  MIN_CONFIDENCE: number;
  MAX_OPEN_TRADES: number;
  FULL_AUTO_EXECUTE: boolean;
  DAILY_LOSS_LIMIT: number;
  MAX_PORTFOLIO_EXPOSURE: number;
}

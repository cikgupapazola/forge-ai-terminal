import { USDMClient } from 'binance';
import { ZenithConfig } from './types';

export function getBinanceClient(config: Partial<ZenithConfig>) {
  return new USDMClient({
    api_key: config.BINANCE_API_KEY,
    api_secret: config.BINANCE_API_SECRET,
  });
}

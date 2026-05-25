import { RestClientV5 } from 'bybit-api';
import { TradingSignal, ZenithConfig } from './types';

export function getBybitClient(config: Partial<ZenithConfig>) {
  return new RestClientV5({
    key: config.BYBIT_API_KEY,
    secret: config.BYBIT_API_SECRET,
  });
}

export function parseSignal(text: string): TradingSignal {
  const signal = (text.match(/SIGNAL:\s*(LONG|SHORT|WAIT)/i) || [])[1];
  const entry = (text.match(/ENTRY:\s*([\d.]+)/i) || [])[1];
  const tp1 = (text.match(/TP1:\s*([\d.]+)/i) || [])[1];
  const tp2 = (text.match(/TP2:\s*([\d.]+)/i) || [])[1];
  const tp3 = (text.match(/TP3:\s*([\d.]+)/i) || [])[1];
  const sl = (text.match(/SL:\s*([\d.]+)/i) || [])[1];
  const confidence = (text.match(/CONFIDENCE:\s*(\d+)%/i) || [])[1];
  const recommendedTp = (text.match(/RECOMMENDED_TP:\s*(\d+)/i) || [])[1];
  
  const probs: string[] = [];
  const lines = text.split('\n');
  ['TP1', 'TP2', 'TP3'].forEach(key => {
    const line = lines.find(l => l.includes(key));
    const probMatch = line ? line.match(/\((\d+)%\)/) : null;
    probs.push(probMatch ? probMatch[1] : '?');
  });

  if (!signal || signal.toUpperCase() === 'WAIT') return { side: 'WAIT' };

  return {
    side: signal.toUpperCase() as 'LONG' | 'SHORT',
    entry: parseFloat(entry),
    tp1: parseFloat(tp1),
    tp2: parseFloat(tp2),
    tp3: parseFloat(tp3),
    sl: parseFloat(sl),
    probs: probs,
    confidence: confidence ? parseInt(confidence) : 0,
    recommendedTp: recommendedTp ? parseInt(recommendedTp) : 1
  };
}

export function calculateEstimatedPNL(side: 'LONG' | 'SHORT', entry: number, target: number, margin: number, leverage: number) {
  if (!entry || !target || isNaN(entry) || isNaN(target)) return 0;
  const pnl = ((target - entry) / entry) * margin * leverage;
  return side === 'LONG' ? pnl : -pnl;
}

export async function sendTelegramMessage(text: string, token: string, chatId: string) {
  if (!token || !chatId) return { ok: false, description: "Token atau Chat ID belum diset." };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
    });
    return await resp.json();
  } catch (e: any) {
    return { ok: false, description: e.message };
  }
}

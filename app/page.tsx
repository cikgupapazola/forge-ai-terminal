'use client';

import { useState, useEffect, useRef } from 'react';
import { ZenithConfig, AIAnalysisResult } from '@/lib/types';
import NeoLoader from '@/components/NeoLoader';
import { calculateEstimatedPNL } from '@/lib/bybit';

const PRESETS = {
  SCALP: {
    ACTIVE_INDICATORS: ['RSI', 'EMA', 'ATR'],
    INDICATOR_PARAMS: { RSI: 7, EMA_FAST: 5, EMA_SLOW: 13, ATR: 14, MACD_FAST: 12, MACD_SLOW: 26, BB_PERIOD: 20 }
  },
  SWING: {
    ACTIVE_INDICATORS: ['RSI', 'EMA', 'MACD', 'BB'],
    INDICATOR_PARAMS: { RSI: 14, EMA_FAST: 50, EMA_SLOW: 200, ATR: 14, MACD_FAST: 12, MACD_SLOW: 26, BB_PERIOD: 20 }
  }
};

const AI_MODELS = {
  OPENROUTER: [
    { label: 'Owl Alpha (Default)', value: 'openrouter/owl-alpha' },
    { label: 'DeepSeek R1', value: 'deepseek/deepseek-r1' },
    { label: 'Llama 3.3 70B', value: 'meta-llama/llama-3.3-70b-instruct' },
    { label: 'Gemini 2.0 Flash', value: 'google/gemini-2.0-flash-001' }
  ],
  GROQ: [
    { label: 'Llama 3.3 70B (Versatile)', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B (Instant)', value: 'llama-3.1-8b-instant' },
    { label: 'DeepSeek R1 70B', value: 'deepseek-r1-distill-llama-70b' }
  ]
};

export default function Dashboard() {
  const [config, setConfig] = useState<ZenithConfig>({
    EXCHANGE: 'BYBIT',
    BYBIT_API_KEY: '',
    BYBIT_API_SECRET: '',
    BINANCE_API_KEY: '',
    BINANCE_API_SECRET: '',
    AI_PROVIDER: 'OPENROUTER',
    AI_MODEL: 'openrouter/owl-alpha',
    OPENROUTER_API_KEY: '',
    GROQ_API_KEY: '',
    FIXED_MARGIN_USDT: 0.2,
    ACTIVE_INDICATORS: ['RSI', 'EMA', 'ATR'],
    INDICATOR_PARAMS: { RSI: 14, EMA_FAST: 9, EMA_SLOW: 21, ATR: 14, MACD_FAST: 12, MACD_SLOW: 26, BB_PERIOD: 20 },
    AUTO_SCAN_ENABLED: false,
    AUTO_SCAN_INTERVAL: 15,
    MIN_CONFIDENCE: 80,
    MAX_OPEN_TRADES: 3,
    FULL_AUTO_EXECUTE: false,
    DAILY_LOSS_LIMIT: 50,
    MAX_PORTFOLIO_EXPOSURE: 50
  });

  const [wallet, setWallet] = useState<{ walletBalance: number, totalEquity: number } | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [trackedOrders, setTrackedOrders] = useState<string[]>([]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [currentScanIdx, setCurrentScanIdx] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const [autoScanCountdown, setAutoScanInterval] = useState<number | null>(null);
  const [lastAutoScan, setLastAutoScan] = useState<Date | null>(null);
  const [autoForgeAlert, setAutoForgeAlert] = useState<any | null>(null);

  const [dynamicModels, setDynamicModels] = useState<{ label: string, value: string }[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'EXCHANGE' | 'PROVIDER' | 'MODEL' | 'INTERVAL' | null>(null);

  const [confirmData, setConfirmData] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string, type: 'info' | 'error' } | null>(null);

  const [editingPos, setEditingPos] = useState<any>(null);
  const [newTP, setNewTP] = useState('');
  const [newSL, setNewSL] = useState('');
  const [tpPercent, setTpPercent] = useState('');
  const [tpAmount, setTpAmount] = useState('');
  const [slPercent, setSlPercent] = useState('');
  const [slAmount, setSlAmount] = useState('');

  const carouselRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const playBeep = (type: 'alert' | 'success' | 'warning' = 'alert') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.type = 'sine';
      if (type === 'success') { oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.2); } 
      else if (type === 'warning') { oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); oscillator.frequency.setValueAtTime(220, audioCtx.currentTime + 0.2); } 
      else { oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); }
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) {}
  };

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('zenith_config');
    const orders = localStorage.getItem('forge_tracked_orders');
    if (saved) {
      const parsed = JSON.parse(saved);
      setConfig(prev => ({ ...prev, ...parsed, INDICATOR_PARAMS: { ...prev.INDICATOR_PARAMS, ...(parsed.INDICATOR_PARAMS || {}) } }));
    } else { setShowWelcome(true); }
    if (orders) setTrackedOrders(JSON.parse(orders));
    setLoading(false);

    // Listen for Extension signals via LocalStorage
    const handleStorage = (e: StorageEvent) => {
        if (e.key === 'forge_remote_signal' && e.newValue) {
            const signal = JSON.parse(e.newValue);
            setAutoForgeAlert(signal);
            playBeep('alert');
        }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => { if (isMounted && !loading) localStorage.setItem('zenith_config', JSON.stringify(config)); }, [config, loading, isMounted]);
  useEffect(() => { if (isMounted && !loading) localStorage.setItem('forge_tracked_orders', JSON.stringify(trackedOrders)); }, [trackedOrders, loading, isMounted]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setActiveDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDynamicModels = async (provider: string, apiKey: string) => {
    if (!apiKey) return;
    setIsFetchingModels(true);
    try {
      const r = await fetch('/api/models', { headers: { 'x-provider': provider, 'x-api-key': apiKey } }).then(r => r.json());
      if (!r.error) setDynamicModels(r);
    } catch (e) {} finally { setIsFetchingModels(false); }
  };

  useEffect(() => {
    if (showSettings) {
      const apiKey = config.AI_PROVIDER === 'OPENROUTER' ? config.OPENROUTER_API_KEY : config.GROQ_API_KEY;
      fetchDynamicModels(config.AI_PROVIDER, apiKey);
    }
  }, [showSettings, config.AI_PROVIDER]);

  const fetchData = async () => {
    const key = config.EXCHANGE === 'BYBIT' ? config.BYBIT_API_KEY : config.BINANCE_API_KEY;
    const secret = config.EXCHANGE === 'BYBIT' ? config.BYBIT_API_SECRET : config.BINANCE_API_SECRET;
    if (!key || !secret) return;
    const headers = { 'x-exchange': config.EXCHANGE, 'x-api-key': key, 'x-api-secret': secret };
    try {
      const [w, p, h] = await Promise.all([
        fetch('/api/wallet', { headers }).then(r => r.json()),
        fetch('/api/positions', { headers }).then(r => r.json()),
        fetch('/api/history', { headers }).then(r => r.json())
      ]);
      if (!w.error) setWallet(w); if (!p.error) setPositions(p); if (!h.error) setHistory(h);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, [config.EXCHANGE, config.BYBIT_API_KEY, config.BYBIT_API_SECRET, config.BINANCE_API_KEY, config.BINANCE_API_SECRET]);

  const dailyPNL = (() => {
    const today = new Date().setHours(0,0,0,0);
    return history.filter(h => new Date(h.time).getTime() >= today).reduce((sum, h) => sum + parseFloat(h.pnl), 0);
  })();

  const riskMetrics = (() => {
    if (!wallet || wallet.totalEquity === 0) return { exposure: 0, longs: 0, shorts: 0 };
    let totalMargin = 0, longs = 0, shorts = 0;
    positions.forEach(p => {
        totalMargin += (parseFloat(p.avgPrice) * parseFloat(p.size)) / parseFloat(p.leverage);
        if (p.side === 'Buy') longs++; else shorts++;
    });
    return { exposure: (totalMargin / wallet.totalEquity) * 100, longs, shorts };
  })();

  useEffect(() => {
    if (!config.AUTO_SCAN_ENABLED) { setAutoScanInterval(null); return; }
    const runAutoScan = async () => {
        const dailyLoss = dailyPNL < 0 ? Math.abs(dailyPNL) : 0;
        if (dailyLoss >= config.DAILY_LOSS_LIMIT) {
            playBeep('warning'); setConfig(prev => ({ ...prev, AUTO_SCAN_ENABLED: false, FULL_AUTO_EXECUTE: false }));
            setNotification({ title: '🛡️ RISK SHIELD: HARD STOP', message: `Daily loss limit hit. Auto-Forge deactivated.`, type: 'error' });
            return;
        }
        if (positions.length >= config.MAX_OPEN_TRADES || riskMetrics.exposure >= config.MAX_PORTFOLIO_EXPOSURE) { setLastAutoScan(new Date()); return; }
        setIsScanning(true);
        try {
            const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, count: 6 }) }).then(r => r.json());
            if (!r.error && r.length > 0) {
                const best = r.filter((s: any) => s.signal.side !== 'WAIT' && (s.signal.confidence || 0) >= config.MIN_CONFIDENCE).sort((a: any, b: any) => b.signal.confidence - a.signal.confidence)[0];
                if (best) {
                    if (config.FULL_AUTO_EXECUTE) {
                        const targetIdx = best.signal.recommendedTp || 1;
                        const tpPrice = best.signal[`tp${targetIdx}`] || best.signal.tp1;
                        const execResp = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: best.symbol, signal: best.signal, tpPrice, config }) }).then(r => r.json());
                        if (execResp.success) { playBeep('success'); setNotification({ title: 'AUTO-DEPLOY SUCCESS', message: `Executed ${best.symbol}`, type: 'info' }); fetchData(); }
                    } else { setAutoForgeAlert(best); playBeep('alert'); }
                }
            }
        } catch(e) {} finally { setIsScanning(false); setLastAutoScan(new Date()); }
    };
    const intervalId = setInterval(() => {
        const now = new Date(), last = lastAutoScan || new Date(0);
        const diff = (now.getTime() - last.getTime()) / (1000 * 60);
        if (diff >= config.AUTO_SCAN_INTERVAL) runAutoScan();
        else setAutoScanInterval(Math.ceil(config.AUTO_SCAN_INTERVAL - diff));
    }, 30000);
    return () => clearInterval(intervalId);
  }, [config.AUTO_SCAN_ENABLED, config.AUTO_SCAN_INTERVAL, config.MIN_CONFIDENCE, config.MAX_OPEN_TRADES, config.FULL_AUTO_EXECUTE, config.DAILY_LOSS_LIMIT, config.MAX_PORTFOLIO_EXPOSURE, dailyPNL, riskMetrics.exposure, lastAutoScan, positions.length]);

  const performExitCalc = (pos: any, type: 'TP' | 'SL', field: 'percent' | 'amount' | 'price', val: string) => {
    if (!pos) return;
    const entry = parseFloat(pos.avgPrice), qty = parseFloat(pos.size), lev = parseFloat(pos.leverage), side = pos.side;
    const margin = (entry * qty) / lev;
    if (isNaN(entry) || isNaN(qty) || isNaN(lev) || margin === 0) return;

    if (type === 'TP') {
        if (field === 'price') {
            setNewTP(val); const p = parseFloat(val); 
            if (isNaN(p) || p === 0) { setTpAmount(''); setTpPercent(''); return; }
            const profit = side === 'Buy' ? (p - entry) * qty : (entry - p) * qty;
            setTpAmount(profit.toFixed(2)); setTpPercent(((profit / margin) * 100).toFixed(1));
        } else if (field === 'percent') {
            setTpPercent(val); const p = parseFloat(val);
            if (isNaN(p)) { setTpAmount(''); setNewTP(''); return; }
            const profit = (p / 100) * margin; const target = side === 'Buy' ? entry + (profit / qty) : entry - (profit / qty);
            setTpAmount(profit.toFixed(2)); setNewTP(target.toFixed(4));
        } else if (field === 'amount') {
            setTpAmount(val); const a = parseFloat(val);
            if (isNaN(a)) { setTpPercent(''); setNewTP(''); return; }
            const target = side === 'Buy' ? entry + (a / qty) : entry - (a / qty);
            setTpPercent(((a / margin) * 100).toFixed(1)); setNewTP(target.toFixed(4));
        }
    } else {
        if (field === 'price') {
            setNewSL(val); const s = parseFloat(val);
            if (isNaN(s) || s === 0) { setSlAmount(''); setSlPercent(''); return; }
            const loss = side === 'Buy' ? (entry - s) * qty : (s - entry) * qty;
            setSlAmount(loss.toFixed(2)); setSlPercent(((loss / margin) * 100).toFixed(1));
        } else if (field === 'percent') {
            setSlPercent(val); const p = parseFloat(val);
            if (isNaN(p)) { setSlAmount(''); setNewSL(''); return; }
            const loss = (p / 100) * margin; const target = side === 'Buy' ? entry - (loss / qty) : entry + (loss / qty);
            setSlAmount(loss.toFixed(2)); setNewSL(target.toFixed(4));
        } else if (field === 'amount') {
            setSlAmount(val); const a = parseFloat(val);
            if (isNaN(a)) { setSlPercent(''); setNewSL(''); return; }
            const target = side === 'Buy' ? entry - (a / qty) : entry + (a / qty);
            setSlPercent(((a / margin) * 100).toFixed(1)); setNewSL(target.toFixed(4));
        }
    }
  };

  const runScan = async () => {
    setIsScanning(true); setScanResults([]); setCurrentScanIdx(0);
    try {
      const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, count: 6 }) }).then(r => r.json());
      if (!r.error) setScanResults(r); else setNotification({ title: 'Scan Error', message: r.error, type: 'error' });
    } catch (e: any) { setNotification({ title: 'Network Error', message: e.message, type: 'error' }); } finally { setIsScanning(false); }
  };

  const closePosition = async (p: any) => {
    setConfirmData({ title: 'Confirm Market Close', message: `Close ${p.symbol} position?`, onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: p.symbol, side: p.side, qty: p.size, positionIdx: p.positionIdx, config }) }).then(r => r.json());
          if (r.success) { if (r.orderId) setTrackedOrders(prev => [...prev, r.orderId].slice(-100)); fetchData(); } else setNotification({ title: 'Close Failed', message: r.error, type: 'error' });
        } catch (e) {}
    }});
  };

  const closeBulkPositions = async (type: 'all' | 'profit' | 'loss') => {
    const toClose = positions.filter(p => { const pnl = parseFloat(p.unrealisedPnl); if (type === 'all') return true; if (type === 'profit') return pnl > 0; return pnl < 0; });
    if (toClose.length === 0) return;
    setConfirmData({ title: `Bulk Close: ${type.toUpperCase()}`, message: `Close ${toClose.length} positions?`, onConfirm: async () => {
        setConfirmData(null); const newIds: string[] = [];
        for (const p of toClose) { const r = await fetch('/api/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: p.symbol, side: p.side, qty: p.size, positionIdx: p.positionIdx, config }) }).then(r => r.json()); if (r.orderId) newIds.push(r.orderId); }
        setTrackedOrders(prev => [...prev, ...newIds].slice(-100)); fetchData();
    }});
  };

  const updateTPSL = async () => {
    if (!editingPos) return;
    setConfirmData({ title: 'Update Strategy', message: `Modify TP/SL for ${editingPos.symbol}?`, onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/modify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: editingPos.symbol, takeProfit: newTP, stopLoss: newSL, config }) }).then(r => r.json());
          if (r.success) { fetchData(); setEditingPos(null); } else setNotification({ title: 'Update Failed', message: r.error, type: 'error' });
        } catch (e) {}
    }});
  };

  const executeTrade = async (symbol: string, result: any, tpPrice: number) => {
    setConfirmData({ title: 'Deploy Strategy', message: `Open ${result.signal.side} for ${symbol}?`, onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, signal: result.signal, tpPrice, config }) }).then(r => r.json());
          if (r.success) { fetchData(); if (currentScanIdx < scanResults.length - 1) setCurrentScanIdx(prev => prev + 1); else setScanResults([]); setAutoForgeAlert(null); } else setNotification({ title: 'Deployment Failed', message: r.error, type: 'error' });
        } catch (e) {}
    }});
  };

  const applyPreset = (type: 'SCALP' | 'SWING' | 'DEFAULT') => {
    if (type === 'DEFAULT') { setConfig(prev => ({ ...prev, ACTIVE_INDICATORS: ['RSI', 'EMA', 'ATR'], INDICATOR_PARAMS: { RSI: 14, EMA_FAST: 9, EMA_SLOW: 21, ATR: 14, MACD_FAST: 12, MACD_SLOW: 26, BB_PERIOD: 20 } })); return; }
    setConfig(prev => ({ ...prev, ACTIVE_INDICATORS: PRESETS[type as keyof typeof PRESETS].ACTIVE_INDICATORS, INDICATOR_PARAMS: { ...prev.INDICATOR_PARAMS, ...PRESETS[type as keyof typeof PRESETS].INDICATOR_PARAMS } }));
  };

  const scrollCarousel = (dir: 'left' | 'right') => { if (carouselRef.current) carouselRef.current.scrollBy({ left: dir === 'left' ? -540 : 540, behavior: 'smooth' }); };
  const { totalTP, totalSL, currentProfit, currentLoss } = (() => {
    let tTP = 0, tSL = 0, cP = 0, cL = 0;
    positions.forEach(p => { const entry = parseFloat(p.avgPrice), qty = parseFloat(p.size), isLong = p.side === 'Buy', uPnl = parseFloat(p.unrealisedPnl); if (uPnl >= 0) cP += uPnl; else cL += uPnl; if (p.takeProfit && parseFloat(p.takeProfit) > 0) { const tp = parseFloat(p.takeProfit); tTP += isLong ? (tp - entry) * qty : (entry - tp) * qty; } if (p.stopLoss && parseFloat(p.stopLoss) > 0) { const sl = parseFloat(p.stopLoss); tSL += isLong ? (sl - entry) * qty : (entry - sl) * qty; } });
    return { totalTP: tTP, totalSL: tSL, currentProfit: cP, currentLoss: cL };
  })();

  const analytics = (() => {
    const forgeTrades = history.filter(h => trackedOrders.includes(h.orderId)); const trades = forgeTrades.length > 0 ? forgeTrades : history;
    if (trades.length === 0) return { winrate: 0, count: 0, isForge: false }; const wins = trades.filter(h => parseFloat(h.pnl) > 0);
    return { winrate: (wins.length / trades.length) * 100, count: trades.length, isForge: forgeTrades.length > 0 };
  })();

  const filteredModels = dynamicModels.filter(m => m.label.toLowerCase().includes(modelSearch.toLowerCase()) || m.value.toLowerCase().includes(modelSearch.toLowerCase()));

  if (!isMounted || loading) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#f0f0f0' }}><NeoLoader message="FORGE INITIALIZING..." /></div>;

  return (
    <div className="app-wrapper">
      <main className="layout-grid">
        <aside className="sidebar-content">
          <div className="neo-card" data-label="Forge Risk Shield" style={{ transform: 'none', margin: 0, padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span className="metric-label">Daily PNL</span><span style={{ fontWeight: 900, color: dailyPNL >= 0 ? 'var(--success)' : 'var(--danger)' }}>{dailyPNL >= 0 ? '+' : ''}{dailyPNL.toFixed(2)} USDT</span></div>
            <div style={{ background: '#eee', height: '10px', border: 'var(--border-thin)', position: 'relative', marginBottom: '5px' }}><div style={{ background: riskMetrics.exposure > config.MAX_PORTFOLIO_EXPOSURE ? 'var(--danger)' : 'var(--accent)', width: `${Math.min(riskMetrics.exposure, 100)}%`, height: '100%', transition: 'width 0.5s' }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', fontWeight: 900, marginBottom: '10px' }}><span>EXPOSURE: {riskMetrics.exposure.toFixed(1)}%</span><span>LIMIT: {config.MAX_PORTFOLIO_EXPOSURE}%</span></div>
            <div style={{ display: 'flex', gap: '5px' }}><div style={{ flex: 1, background: '#000', color: 'var(--success)', padding: '4px', textAlign: 'center', fontSize: '0.6rem', fontWeight: 900, border: 'var(--border-thin)' }}>LONGS: {riskMetrics.longs}</div><div style={{ flex: 1, background: '#000', color: 'var(--danger)', padding: '4px', textAlign: 'center', fontSize: '0.6rem', fontWeight: 900, border: 'var(--border-thin)' }}>SHORTS: {riskMetrics.shorts}</div></div>
          </div>

          <div className="neo-card" data-label="Intelligence Scanner" style={{ transform: 'none', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}><span className="metric-label">Market Scan</span>{config.AUTO_SCAN_ENABLED && (<span style={{ fontSize: '0.55rem', fontWeight: 900, color: config.FULL_AUTO_EXECUTE ? 'var(--danger)' : 'var(--success)' }}>{config.FULL_AUTO_EXECUTE ? 'FULL-AUTO' : 'AUTO'}: {autoScanCountdown || config.AUTO_SCAN_INTERVAL}m</span>)}</div>
              <div className="btn-wrapper" onClick={runScan}><button className={`btn-dexter ${isScanning ? 'loading' : ''}`} disabled={isScanning}><svg className="btn-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path></svg><div className="txt-wrapper">{"ANALYZE".split('').map((l, i) => (<span key={i} className="btn-letter" style={{ animationDelay: `${i * 0.08}s` }}>{l}</span>))}</div></button></div>
            </div>
            {isScanning && <div style={{ padding: '20px', display: 'grid', placeItems: 'center' }}><NeoLoader message="SCANNING..." /></div>}
            {!isScanning && scanResults[currentScanIdx] && (
              <div key={currentScanIdx} className="neo-card" data-label={`${currentScanIdx + 1}/${scanResults.length} : ${scanResults[currentScanIdx].symbol}`} style={{ margin: 0, padding: '15px', display: 'flex', flexDirection: 'column', transform: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ fontWeight: '900', fontSize: '0.8rem' }}>PRICE: ${scanResults[currentScanIdx].price}</span><span className="mono" style={{ color: scanResults[currentScanIdx].change >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '900', fontSize: '0.8rem' }}>{scanResults[currentScanIdx].change >= 0 ? '▲' : '▼'} {Math.abs(scanResults[currentScanIdx].change).toFixed(2)}%</span></div>
                <div className="opinion-block">{scanResults[currentScanIdx].opinion}</div>
                {scanResults[currentScanIdx].signal.side !== 'WAIT' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ background: scanResults[currentScanIdx].signal.side === 'LONG' ? 'var(--success)' : 'var(--danger)', color: '#fff', textAlign: 'center', padding: '6px', fontWeight: '900', border: '2px solid #000', fontSize: '0.75rem', flex: 1 }}>{scanResults[currentScanIdx].signal.side} @ {scanResults[currentScanIdx].signal.entry || scanResults[currentScanIdx].price}</div>{scanResults[currentScanIdx].signal.confidence && <div style={{ background: '#000', color: 'var(--accent)', padding: '6px', fontSize: '0.75rem', fontWeight: 900, border: '2px solid #000' }}>{scanResults[currentScanIdx].signal.confidence}%</div>}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>{[1, 2, 3].map(idx => { const tpVal = scanResults[currentScanIdx].signal[`tp${idx}`]; if (!tpVal) return null; const pnl = calculateEstimatedPNL(scanResults[currentScanIdx].signal.side, scanResults[currentScanIdx].signal.entry || scanResults[currentScanIdx].price, tpVal, config.FIXED_MARGIN_USDT, scanResults[currentScanIdx].maxLeverage); return (<button key={idx} className={`neo-btn ${scanResults[currentScanIdx].signal.recommendedTp === idx ? 'neo-btn-primary' : ''}`} style={{ padding: '4px 8px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column' }} onClick={() => executeTrade(scanResults[currentScanIdx].symbol, scanResults[currentScanIdx], tpPrice)}><span>TP{idx}: ${tpVal}</span><span style={{ fontSize: '0.55rem' }}>+${pnl.toFixed(2)}</span></button>); })}<button className="neo-btn" style={{ fontSize: '0.7rem' }} onClick={() => { setCurrentScanIdx(currentScanIdx < scanResults.length - 1 ? currentScanIdx + 1 : 0); }}>NEXT ⏭</button></div>
                    <button className="neo-btn neo-btn-danger" style={{ width: '100%', height: '32px', fontSize: '0.7rem' }} onClick={() => setScanResults([])}>STOP SCAN 🔙</button>
                  </div>
                ) : (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}><div style={{ textAlign: 'center', fontWeight: '800', color: 'var(--text-dim)', fontSize: '0.75rem' }}>NO SIGNAL</div><button className="neo-btn" style={{ width: '100%' }} onClick={() => { setCurrentScanIdx(currentScanIdx < scanResults.length - 1 ? currentScanIdx + 1 : 0); }}>SKIP NEXT ⏭</button></div>
                )}
              </div>
            )}
            {!isScanning && scanResults.length === 0 && (
              <div className="history-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><span className="metric-label">{analytics.isForge ? 'Forge Winrate' : 'Global Winrate'}</span><div style={{ background: '#000', color: 'var(--accent)', padding: '2px 8px', fontWeight: '900', fontSize: '0.65rem', border: 'var(--border-thin)' }}>{analytics.winrate.toFixed(1)}% ({analytics.count} T)</div></div>
                <div className="history-scroll-area">
                  {history.map((h, i) => {
                    const pnlNum = parseFloat(h.pnl), isWin = pnlNum > 0, isForgeTrade = trackedOrders.includes(h.orderId);
                    return (
                      <div key={i} className="history-item-card" style={{ borderLeft: isForgeTrade ? '8px solid var(--accent)' : 'var(--border-thin)' }}>
                        <div className={`history-badge ${isWin ? 'badge-win' : 'badge-loss'}`}>{isWin ? 'PROFIT' : 'LOSS'}</div>
                        <div className="history-header"><span className="history-symbol">{h.symbol} {isForgeTrade && '⚒️'}</span><span className="history-pnl" style={{ color: isWin ? 'var(--success)' : 'var(--danger)' }}>{isWin ? '+' : ''}{pnlNum.toFixed(2)}</span></div>
                        <div className="history-details-grid"><div className="history-metric"><span className="history-metric-label">Side / Size</span><span className="history-metric-value">{h.side} ({h.qty})</span></div><div className="history-metric" style={{ textAlign: 'right' }}><span className="history-metric-label">Date</span><span className="history-metric-value" style={{ fontSize: '0.6rem' }}>{new Date(h.time).toLocaleDateString()}</span></div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="dashboard-content">
          <div className="dashboard-header-row">
            <div className="stats-container">
              <div className="metric-box"><span className="metric-label">Equity</span><span className="metric-value">${wallet?.totalEquity?.toFixed(2) || '0.00'}</span></div>
              <div className="metric-box metric-box-white"><span className="metric-label">Orders</span><span className="metric-value">{positions.length}</span></div>
              <div className="metric-box metric-box-white"><span className="metric-label">Balance</span><span className="metric-value">${wallet?.walletBalance?.toFixed(2) || '0.00'}</span></div>
              <div className="control-block"><button className="neo-btn neo-btn-primary" style={{ height: '35px' }} onClick={() => setShowSettings(true)}>SETTINGS</button><div className="batch-close-grid"><button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px' }} onClick={() => closeBulkPositions('all')}>ALL</button><button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px', color: 'var(--success)' }} onClick={() => closeBulkPositions('profit')}>WIN</button><button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px', color: 'var(--danger)' }} onClick={() => closeBulkPositions('loss')}>LOSS</button></div></div>
            </div>
            <div className="brand-text-wrapper">
              <div className="brand-text"><div className="brand-main"><span className="brand-zenith">FORGE</span><div className="brand-engine">{"TRADER ENGINE".split('').map((char, i) => <span key={i}>{char === ' ' ? '\u00A0' : char}</span>)}</div></div><div className="brand-ai">AI</div></div>
              <div className="carousel-nav"><button className="neo-btn" onClick={() => scrollCarousel('left')}>◀</button><button className="neo-btn" onClick={() => scrollCarousel('right')}>▶</button></div>
            </div>
          </div>
          <div className="carousel-container">
            {autoForgeAlert && (
                <div className="neo-card" data-label="Forge Auto-Alert" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, background: 'var(--accent)', animation: 'neo-bounce 1s infinite alternate' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><h3 style={{ fontWeight: 900 }}>🚀 HIGH CONFIDENCE: {autoForgeAlert.symbol} ({autoForgeAlert.signal.confidence}%)</h3><p style={{ fontSize: '0.75rem', fontWeight: 600 }}>AI detected a {autoForgeAlert.signal.side} setup. Ready to deploy?</p></div>
                        <div style={{ display: 'flex', gap: '8px' }}><button className="neo-btn" style={{ background: '#000', color: '#fff' }} onClick={() => { setScanResults([autoForgeAlert]); setAutoForgeAlert(null); }}>REVIEW</button><button className="neo-btn neo-btn-danger" onClick={() => setAutoForgeAlert(null)}>DISMISS</button></div>
                    </div>
                </div>
            )}
            {!wallet && positions.length === 0 && <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><NeoLoader message="SYNCING..." /></div>}
            <div className="pos-carousel" ref={carouselRef}>{positions.map((p, i) => (<div key={i} className="neo-card neo-card-carousel" data-label={p.symbol}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}><div><h4 style={{ fontSize: '1.2rem', fontWeight: '900' }}>{p.symbol}</h4><span style={{ background: p.side === 'Buy' ? 'var(--success)' : 'var(--danger)', color: '#fff', padding: '2px 8px', fontWeight: '900', fontSize: '0.7rem', border: '2px solid #000', display: 'inline-block', marginTop: '2px' }}>{p.side === 'Buy' ? 'LONG' : 'SHORT'} {p.leverage}X</span></div><div style={{ textAlign: 'right' }}><span className="metric-label" style={{ fontSize: '0.55rem' }}>Unrealized PNL</span><div className="mono" style={{ fontSize: '1.6rem', fontWeight: '900', color: parseFloat(p.unrealisedPnl) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{parseFloat(p.unrealisedPnl) >= 0 ? '+' : ''}{parseFloat(p.unrealisedPnl).toFixed(2)}</div></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 0', borderTop: '2px solid #000', borderBottom: '2px solid #000', marginBottom: '10px' }}><div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Entry / Mark</span><div className="mono" style={{ fontWeight: '800', fontSize: '0.8rem' }}>{parseFloat(p.avgPrice).toFixed(4)} / {parseFloat(p.markPrice).toFixed(4)}</div></div><div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Size</span><div className="mono" style={{ fontWeight: '800', fontSize: '0.8rem' }}>{p.size}</div></div><div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Take Profit</span><div className="mono" style={{ fontWeight: '800', color: 'var(--success)', fontSize: '0.8rem' }}>${parseFloat(p.takeProfit || 0).toFixed(4)}</div></div><div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Stop Loss</span><div className="mono" style={{ fontWeight: '800', color: 'var(--danger)', fontSize: '0.8rem' }}>${parseFloat(p.stopLoss || 0).toFixed(4)}</div></div></div><div style={{ display: 'flex', gap: '10px' }}><button className="neo-btn neo-btn-primary" style={{ flex: 1.5, padding: '8px' }} onClick={() => { setEditingPos(p); const tp = p.takeProfit || ''; const sl = p.stopLoss || ''; setNewTP(tp); setNewSL(sl); performExitCalc(p, 'TP', 'price', tp); performExitCalc(p, 'SL', 'price', sl); }}>Update Exit</button><button className="neo-btn neo-btn-danger" style={{ flex: 1, padding: '8px' }} onClick={() => closePosition(p)}>Close</button></div></div>))}{positions.length === 0 && wallet && <div style={{ flex: 1, display: 'grid', placeItems: 'center', opacity: 0.5, border: '4px dashed #000', borderRadius: '12px', minWidth: '500px' }}><h3 style={{ fontWeight: 900 }}>NO ACTIVE TRADES</h3></div>}</div>
            {positions.length > 0 && (<div className="global-projection-bar"><div className="projection-segment tp-hit-seg"><span className="projection-label">POTENTIAL PROFIT</span><div className="projection-value tp">+${totalTP.toFixed(2)}</div></div><div className="projection-segment curr-profit-seg"><span className="projection-label">CURRENT PROFIT</span><div className="projection-value curr">+${currentProfit.toFixed(2)}</div></div><div className="projection-segment curr-loss-seg"><span className="projection-label">CURRENT LOSS</span><div className="projection-value curr">-${Math.abs(currentLoss).toFixed(2)}</div></div><div className="projection-segment sl-hit-seg"><span className="projection-label">POTENTIAL LOSS</span><div className="projection-value sl">-${Math.abs(totalSL).toFixed(2)}</div></div></div>)}
          </div>
        </section>
      </main>

      <footer className="neo-footer" style={{ gap: '20px' }}><span>CREATED BY CRYPTSMILE | FORGE TRADER AI ENGINE V6.3</span><span style={{ opacity: 0.7, fontSize: '0.55rem' }}>NOT FINANCIAL ADVICE | TRADE AT YOUR OWN RISK</span></footer>

      {showWelcome && (<div className="modal-overlay modal-overlay-high"><div className="modal-content"><h2 className="modal-title">Welcome to Forge AI</h2><div className="opinion-block" style={{ maxHeight: 'none', background: 'var(--accent-light)' }}><strong>🔒 PRIVACY & SUPPORT INFO</strong><p style={{ marginTop: '10px' }}><strong>FORGE AI NEVER stores your credentials on any server.</strong> All API keys are stored strictly in your browser&apos;s local storage.</p><p style={{ marginTop: '10px' }}><strong>🛡️ SECURE EXECUTION:</strong> Our system operates via <strong>official API channels</strong> from Bybit and Binance, ensuring transaction security and data accuracy.</p><hr style={{ margin: '15px 0', border: 'none', borderTop: '2px solid #000' }} /><p style={{ fontSize: '0.75rem' }}><strong>⚠️ FINANCIAL DISCLAIMER:</strong><br/>Crypto futures trading carries substantial risk. Forge AI is an analysis tool and <strong>DOES NOT</strong> provide financial advice. We are not responsible for any financial losses incurred. Trade responsibly.</p></div><button className="neo-btn neo-btn-primary" style={{ width: '100%', height: '54px', marginTop: '20px' }} onClick={() => setShowWelcome(false)}>I UNDERSTAND & CONTINUE</button></div></div>)}
      {confirmData && (<div className="modal-overlay modal-overlay-high"><div className="modal-content"><h2 className="modal-title">{confirmData.title}</h2><p style={{ marginBottom: '32px', fontWeight: '600' }}>{confirmData.message}</p><div style={{ display: 'flex', gap: '12px' }}><button className="neo-btn neo-btn-primary" style={{ flex: 1.5, height: '48px' }} onClick={confirmData.onConfirm}>PROCEED ✓</button><button className="neo-btn" style={{ flex: 1, height: '48px' }} onClick={() => setConfirmData(null)}>CANCEL ✕</button></div></div></div>)}
      {notification && (<div className="modal-overlay modal-overlay-high"><div className="modal-content"><button className="modal-close" onClick={() => setNotification(null)}>×</button><h2 className="modal-title" style={{ color: notification.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>{notification.title}</h2><p style={{ marginBottom: '32px', fontWeight: '600' }}>{notification.message}</p><button className="neo-btn neo-btn-primary" style={{ width: '100%', height: '48px' }} onClick={() => setNotification(null)}>OK, GOT IT</button></div></div>)}

      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content" ref={dropdownRef} style={{ maxWidth: '520px' }}><button className="modal-close" onClick={() => setShowSettings(false)}>×</button><h2 style={{ marginBottom: '24px', fontSize: '1.5rem', fontWeight: '900' }}>SYSTEM CONFIG</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="neo-card" data-label="Auto-Forge & Risk Shield" style={{ margin: 0, padding: '15px', transform: 'none' }}><div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><input type="checkbox" style={{ width: '32px', height: '32px' }} checked={config.AUTO_SCAN_ENABLED} onChange={e => setConfig({...config, AUTO_SCAN_ENABLED: e.target.checked})} /><span style={{ fontWeight: 900 }}>ENABLE AUTO-SCANNER</span></div>{config.AUTO_SCAN_ENABLED && (<div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '44px' }}><input type="checkbox" style={{ width: '28px', height: '28px' }} checked={config.FULL_AUTO_EXECUTE} onChange={e => setConfig({...config, FULL_AUTO_EXECUTE: e.target.checked})} /><span style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--danger)' }}>FULL-AUTO (INSTANT TRADES)</span></div>)}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}><div><label className="metric-label">Scan Interval</label><div className="searchable-select-container"><div className="searchable-select-display" style={{ padding: '10px' }} onClick={() => setActiveDropdown(activeDropdown === 'INTERVAL' ? null : 'INTERVAL')}><span>{config.AUTO_SCAN_INTERVAL} MINS</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4"><polyline points="6 9 12 15 18 9"></polyline></svg></div>{activeDropdown === 'INTERVAL' && (<div className="searchable-select-panel">{[15, 30, 60, 120].map(m => (<div key={m} className={`searchable-select-option ${config.AUTO_SCAN_INTERVAL === m ? 'active' : ''}`} onClick={() => { setConfig({...config, AUTO_SCAN_INTERVAL: m}); setActiveDropdown(null); }}>{m} MINS</div>))}</div>)}</div></div><div><label className="metric-label">Daily Loss Limit ($)</label><input type="number" value={config.DAILY_LOSS_LIMIT} onChange={e => setConfig({...config, DAILY_LOSS_LIMIT: parseFloat(e.target.value)})} /></div><div><label className="metric-label">Max Exposure (%)</label><input type="number" value={config.MAX_PORTFOLIO_EXPOSURE} onChange={e => setConfig({...config, MAX_PORTFOLIO_EXPOSURE: parseFloat(e.target.value)})} /></div><div><label className="metric-label">Max Open Trades</label><input type="number" value={config.MAX_OPEN_TRADES} onChange={e => setConfig({...config, MAX_OPEN_TRADES: parseInt(e.target.value)})} /></div></div></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}><div><label className="metric-label">Exchange</label><div className="searchable-select-container"><div className="searchable-select-display" onClick={() => setActiveDropdown(activeDropdown === 'EXCHANGE' ? null : 'EXCHANGE')}><span>{config.EXCHANGE}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4"><polyline points="6 9 12 15 18 9"></polyline></svg></div>{activeDropdown === 'EXCHANGE' && <div className="searchable-select-panel">{['BYBIT', 'BINANCE'].map(ex => (<div key={ex} className={`searchable-select-option ${config.EXCHANGE === ex ? 'active' : ''}`} onClick={() => { setConfig({...config, EXCHANGE: ex as any}); setActiveDropdown(null); }}>{ex}</div>))}</div>}</div></div><div><label className="metric-label">AI Provider</label><div className="searchable-select-container"><div className="searchable-select-display" onClick={() => setActiveDropdown(activeDropdown === 'PROVIDER' ? null : 'PROVIDER')}><span>{config.AI_PROVIDER}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4"><polyline points="6 9 12 15 18 9"></polyline></svg></div>{activeDropdown === 'PROVIDER' && <div className="searchable-select-panel">{['OPENROUTER', 'GROQ'].map(p => (<div key={p} className={`searchable-select-option ${config.AI_PROVIDER === p ? 'active' : ''}`} onClick={() => { setConfig({...config, AI_PROVIDER: p as any, AI_MODEL: p === 'GROQ' ? 'llama-3.3-70b-versatile' : 'openrouter/owl-alpha'}); setActiveDropdown(null); }}>{p}</div>))}</div>}</div></div></div>
              <div><label className="metric-label">AI Model Intelligence</label><div className="searchable-select-container"><div className="searchable-select-display" onClick={() => setActiveDropdown(activeDropdown === 'MODEL' ? null : 'MODEL')}><span>{config.AI_MODEL.split('/').pop()?.toUpperCase() || 'SELECT MODEL'}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4"><polyline points="6 9 12 15 18 9"></polyline></svg></div>{activeDropdown === 'MODEL' && <div className="searchable-select-panel"><input className="searchable-select-input" placeholder="Search models..." value={modelSearch} onChange={e => setModelSearch(e.target.value)} autoFocus /><div className="searchable-select-list">{filteredModels.map(m => (<div key={m.value} className={`searchable-select-option ${config.AI_MODEL === m.value ? 'active' : ''}`} onClick={() => { setConfig({...config, AI_MODEL: m.value}); setActiveDropdown(null); }}>{m.label}</div>))}<div className="searchable-select-option" style={{ color: 'var(--accent)', background: '#000' }} onClick={() => { setConfig({...config, AI_MODEL: 'CUSTOM'}); setActiveDropdown(null); }}>-- USE CUSTOM MODEL ID --</div></div></div>}</div>{(config.AI_MODEL === 'CUSTOM' || !dynamicModels.some(m => m.value === config.AI_MODEL)) && <div style={{ marginTop: '10px' }}><label className="metric-label">Manual Model ID</label><input placeholder="e.g. gpt-4o" value={config.AI_MODEL === 'CUSTOM' ? '' : config.AI_MODEL} onChange={e => setConfig({...config, AI_MODEL: e.target.value})} /></div>}</div>
              {config.EXCHANGE === 'BYBIT' ? (<><div><label className="metric-label">Bybit API Key</label><input value={config.BYBIT_API_KEY} onChange={e => setConfig({...config, BYBIT_API_KEY: e.target.value})} /></div><div><label className="metric-label">Bybit API Secret</label><input type="password" value={config.BYBIT_API_SECRET} onChange={e => setConfig({...config, BYBIT_API_SECRET: e.target.value})} /></div></>) : (<><div><label className="metric-label">Binance API Key</label><input value={config.BINANCE_API_KEY} onChange={e => setConfig({...config, BINANCE_API_KEY: e.target.value})} /></div><div><label className="metric-label">Binance API Secret</label><input type="password" value={config.BINANCE_API_SECRET} onChange={e => setConfig({...config, BINANCE_API_SECRET: e.target.value})} /></div></>)}
              {config.AI_PROVIDER === 'OPENROUTER' ? (<div><label className="metric-label">OpenRouter API Key</label><input type="password" value={config.OPENROUTER_API_KEY} onChange={e => setConfig({...config, OPENROUTER_API_KEY: e.target.value})} /></div>) : (<div><label className="metric-label">Groq API Key</label><input type="password" value={config.GROQ_API_KEY} onChange={e => setConfig({...config, GROQ_API_KEY: e.target.value})} /></div>)}
              <div><label className="metric-label">Margin (USDT)</label><input type="number" value={config.FIXED_MARGIN_USDT} onChange={e => setConfig({...config, FIXED_MARGIN_USDT: parseFloat(e.target.value)})} /></div>
              <div className="neo-card" data-label="Strategy Presets" style={{ margin: 0, padding: '10px', display: 'flex', gap: '8px', transform: 'none' }}><button className="neo-btn" style={{ flex: 1, fontSize: '0.65rem' }} onClick={() => applyPreset('SCALP')}>⚡ SCALP</button><button className="neo-btn" style={{ flex: 1, fontSize: '0.65rem' }} onClick={() => applyPreset('SWING')}>🏹 SWING</button><button className="neo-btn" style={{ flex: 1, fontSize: '0.65rem', background: '#eee' }} onClick={() => applyPreset('DEFAULT')}>🔄 RESET</button></div>
              <div><label className="metric-label">Technical Analysis Matrix</label><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{['RSI', 'EMA', 'MACD', 'BB', 'ATR'].map(ind => (<div key={ind} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f5f5f5', padding: '8px', border: 'var(--border-thin)' }}><input type="checkbox" style={{ width: '24px', height: '24px' }} checked={config.ACTIVE_INDICATORS.includes(ind)} onChange={e => { const next = e.target.checked ? [...config.ACTIVE_INDICATORS, ind] : config.ACTIVE_INDICATORS.filter(i => i !== ind); setConfig({...config, ACTIVE_INDICATORS: next}); }} /><span style={{ fontSize: '0.85rem', fontWeight: '800', flex: 1 }}>{ind}</span>{ind === 'RSI' && <input type="number" style={{ width: '60px', padding: '4px' }} value={config.INDICATOR_PARAMS.RSI} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, RSI: parseInt(e.target.value)}})} />}{ind === 'EMA' && (<div style={{ display: 'flex', gap: '5px' }}><input type="number" style={{ width: '50px', padding: '4px' }} value={config.INDICATOR_PARAMS.EMA_FAST} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, EMA_FAST: parseInt(e.target.value)}})} /><input type="number" style={{ width: '50px', padding: '4px' }} value={config.INDICATOR_PARAMS.EMA_SLOW} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, EMA_SLOW: parseInt(e.target.value)}})} /></div>)}{ind === 'MACD' && (<div style={{ display: 'flex', gap: '5px' }}><input type="number" style={{ width: '45px', padding: '4px' }} value={config.INDICATOR_PARAMS.MACD_FAST} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, MACD_FAST: parseInt(e.target.value)}})} /><input type="number" style={{ width: '45px', padding: '4px' }} value={config.INDICATOR_PARAMS.MACD_SLOW} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, MACD_SLOW: parseInt(e.target.value)}})} /></div>)}{ind === 'BB' && <input type="number" style={{ width: '60px', padding: '4px' }} value={config.INDICATOR_PARAMS.BB_PERIOD} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, BB_PERIOD: parseInt(e.target.value)}})} />}{ind === 'ATR' && <input type="number" style={{ width: '60px', padding: '4px' }} value={config.INDICATOR_PARAMS.ATR} onChange={e => setConfig({...config, INDICATOR_PARAMS: {...config.INDICATOR_PARAMS, ATR: parseInt(e.target.value)}})} />}</div>))}</div></div>
              <button className="neo-btn neo-btn-primary" style={{ padding: '12px', marginTop: '10px' }} onClick={() => { setConfirmData({ title: 'Save Settings', message: 'Update configuration?', onConfirm: () => { setConfirmData(null); setShowSettings(false); fetchData(); } }); }}>Update Configuration</button>
            </div>
          </div>
        </div>
      )}

      {editingPos && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <button className="modal-close" onClick={() => setEditingPos(null)}>×</button>
            <h2 style={{ marginBottom: '8px', fontSize: '1.25rem', fontWeight: '900' }}>MANAGE {editingPos.symbol}</h2>
            <p style={{ marginBottom: '20px', fontWeight: '600', fontSize: '0.85rem' }}>Set targets by Price, ROI %, or Profit USDT.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="neo-card" data-label="Take Profit Setup" style={{ margin: 0, padding: '15px', transform: 'none' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}><div><label className="metric-label">Target Price</label><input type="number" step="0.0001" value={newTP} onChange={e => performExitCalc(editingPos, 'TP', 'price', e.target.value)} /></div><div><label className="metric-label">ROI %</label><input type="number" placeholder="%" value={tpPercent} onChange={e => performExitCalc(editingPos, 'TP', 'percent', e.target.value)} /></div><div><label className="metric-label">Profit USDT</label><input type="number" placeholder="$" value={tpAmount} onChange={e => performExitCalc(editingPos, 'TP', 'amount', e.target.value)} /></div></div>{tpAmount !== '' && !isNaN(parseFloat(tpAmount)) && (<div className="pnl-estimate" style={{ marginTop: '10px' }}><span>EST. PROFIT</span><span style={{ color: 'var(--success)' }}>+${parseFloat(tpAmount).toFixed(2)} ({tpPercent}%)</span></div>)}</div>
              <div className="neo-card" data-label="Stop Loss Setup" style={{ margin: 0, padding: '15px', transform: 'none' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}><div><label className="metric-label">Stop Price</label><input type="number" step="0.0001" value={newSL} onChange={e => performExitCalc(editingPos, 'SL', 'price', e.target.value)} /></div><div><label className="metric-label">Risk %</label><input type="number" placeholder="%" value={slPercent} onChange={e => performExitCalc(editingPos, 'SL', 'percent', e.target.value)} /></div><div><label className="metric-label">Loss USDT</label><input type="number" placeholder="$" value={slAmount} onChange={e => performExitCalc(editingPos, 'SL', 'amount', e.target.value)} /></div></div>{slAmount !== '' && !isNaN(parseFloat(slAmount)) && (<div className="pnl-estimate" style={{ marginTop: '10px' }}><span>EST. LOSS</span><span style={{ color: 'var(--danger)' }}>-${Math.abs(parseFloat(slAmount)).toFixed(2)} ({slPercent}%)</span></div>)}</div>
              <div style={{ display: 'flex', gap: '10px' }}><button className="neo-btn neo-btn-primary" style={{ flex: 1.5, height: '48px' }} onClick={updateTPSL}>Update Position</button><button className="neo-btn" style={{ flex: 1, height: '48px' }} onClick={() => setEditingPos(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

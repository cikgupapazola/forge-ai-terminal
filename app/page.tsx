'use client';

import { useState, useEffect, useRef } from 'react';
import { ZenithConfig, AIAnalysisResult } from '@/lib/types';
import NeoLoader from '@/components/NeoLoader';
import { calculateEstimatedPNL } from '@/lib/bybit';

export default function Dashboard() {
  const [config, setConfig] = useState<ZenithConfig>({
    EXCHANGE: 'BYBIT',
    BYBIT_API_KEY: '',
    BYBIT_API_SECRET: '',
    BINANCE_API_KEY: '',
    BINANCE_API_SECRET: '',
    AI_PROVIDER: 'OPENROUTER',
    OPENROUTER_API_KEY: '',
    GROQ_API_KEY: '',
    FIXED_MARGIN_USDT: 0.2,
    ACTIVE_INDICATORS: ['RSI', 'EMA', 'ATR']
  });

  const [wallet, setWallet] = useState<{ walletBalance: number, totalEquity: number } | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [currentScanIdx, setCurrentScanIdx] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  // Modal System State
  const [confirmData, setConfirmData] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string, type: 'info' | 'error' } | null>(null);

  const [editingPos, setEditingPos] = useState<any>(null);
  const [newTP, setNewTP] = useState('');
  const [newSL, setNewSL] = useState('');

  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('zenith_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      setConfig(prev => ({ ...prev, ...parsed }));
    } else {
      setShowWelcome(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem('zenith_config', JSON.stringify(config));
  }, [config, loading]);

  const fetchData = async () => {
    const key = config.EXCHANGE === 'BYBIT' ? config.BYBIT_API_KEY : config.BINANCE_API_KEY;
    const secret = config.EXCHANGE === 'BYBIT' ? config.BYBIT_API_SECRET : config.BINANCE_API_SECRET;
    
    if (!key || !secret) return;

    const headers = { 
      'x-exchange': config.EXCHANGE,
      'x-api-key': key,
      'x-api-secret': secret
    };

    try {
      const w = await fetch('/api/wallet', { headers }).then(r => r.json());
      if (!w.error) setWallet(w);
      const p = await fetch('/api/positions', { headers }).then(r => r.json());
      if (!p.error) setPositions(p);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [config.EXCHANGE, config.BYBIT_API_KEY, config.BYBIT_API_SECRET, config.BINANCE_API_KEY, config.BINANCE_API_SECRET]);

  const runScan = async () => {
    setIsScanning(true);
    setScanResults([]);
    setCurrentScanIdx(0);
    try {
      const r = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, count: 6 })
      }).then(r => r.json());
      if (!r.error) setScanResults(r);
      else setNotification({ title: 'Scan Error', message: r.error, type: 'error' });
    } catch (e: any) {
      setNotification({ title: 'Network Error', message: e.message, type: 'error' });
    } finally { setIsScanning(false); }
  };

  const closePosition = async (p: any) => {
    setConfirmData({
      title: 'Confirm Market Close',
      message: `Are you sure you want to close ${p.symbol} ${p.side} position immediately at Market Price?`,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: p.symbol, side: p.side, qty: p.size, positionIdx: p.positionIdx, config })
          }).then(r => r.json());
          if (r.success) fetchData(); 
          else setNotification({ title: 'Close Failed', message: r.error, type: 'error' });
        } catch (e) {}
      }
    });
  };

  const closeBulkPositions = async (type: 'all' | 'profit' | 'loss') => {
    const toClose = positions.filter(p => {
      if (type === 'all') return true;
      const pnl = parseFloat(p.unrealisedPnl);
      if (type === 'profit') return pnl > 0;
      if (type === 'loss') return pnl < 0;
      return false;
    });

    if (toClose.length === 0) return setNotification({ title: 'Action Cancelled', message: `No ${type} positions available to close.`, type: 'info' });

    setConfirmData({
      title: `Bulk Close: ${type.toUpperCase()}`,
      message: `You are about to close ${toClose.length} active positions. This action cannot be undone. Proceed?`,
      onConfirm: async () => {
        setConfirmData(null);
        for (const p of toClose) {
          await fetch('/api/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: p.symbol, side: p.side, qty: p.size, positionIdx: p.positionIdx, config })
          });
        }
        fetchData();
        setNotification({ title: 'Bulk Close Complete', message: `Successfully requested closure for ${toClose.length} positions.`, type: 'info' });
      }
    });
  };

  const updateTPSL = async () => {
    setConfirmData({
      title: 'Update Strategy',
      message: `Modify TP/SL targets for ${editingPos.symbol}?`,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/modify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: editingPos.symbol, takeProfit: newTP, stopLoss: newSL, config })
          }).then(r => r.json());
          if (r.success) { fetchData(); setEditingPos(null); } 
          else setNotification({ title: 'Update Failed', message: r.error, type: 'error' });
        } catch (e) {}
      }
    });
  };

  const executeTrade = async (symbol: string, result: any, tpPrice: number) => {
    setConfirmData({
      title: 'Deploy Strategy',
      message: `Open ${result.signal.side} position for ${symbol} using TP: ${tpPrice}?`,
      onConfirm: async () => {
        setConfirmData(null);
        try {
          const r = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, signal: result.signal, tpPrice, config })
          }).then(r => r.json());
          if (r.success) { 
            fetchData(); 
            setNotification({ title: 'Success', message: `${symbol} strategy deployed!`, type: 'info' });
            if (currentScanIdx < scanResults.length - 1) setCurrentScanIdx(prev => prev + 1);
            else setScanResults([]);
          } else setNotification({ title: 'Deployment Failed', message: r.error, type: 'error' });
        } catch (e) {}
      }
    });
  };

  const scrollCarousel = (dir: 'left' | 'right') => {
    if (carouselRef.current) {
      const amount = 540;
      carouselRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  const calculateTotalProjections = () => {
    let totalTP = 0, totalSL = 0, currentProfit = 0, currentLoss = 0;
    positions.forEach(p => {
      const entry = parseFloat(p.avgPrice), qty = parseFloat(p.size), isLong = p.side === 'Buy', unrealisedPnl = parseFloat(p.unrealisedPnl);
      if (unrealisedPnl >= 0) currentProfit += unrealisedPnl; else currentLoss += unrealisedPnl;
      if (p.takeProfit && parseFloat(p.takeProfit) > 0) {
        const tpPrice = parseFloat(p.takeProfit);
        totalTP += isLong ? (tpPrice - entry) * qty : (entry - tpPrice) * qty;
      }
      if (p.stopLoss && parseFloat(p.stopLoss) > 0) {
        const slPrice = parseFloat(p.stopLoss);
        totalSL += isLong ? (slPrice - entry) * qty : (entry - slPrice) * qty;
      }
    });
    return { totalTP, totalSL, currentProfit, currentLoss };
  };

  const { totalTP, totalSL, currentProfit, currentLoss } = calculateTotalProjections();

  const calculateEstimate = (type: 'TP' | 'SL', val: string) => {
    if (!editingPos || !val || isNaN(parseFloat(val))) return null;
    const price = parseFloat(val), entry = parseFloat(editingPos.avgPrice), qty = parseFloat(editingPos.size), isLong = editingPos.side === 'Buy';
    let pnl = isLong ? (price - entry) * qty : (entry - price) * qty;
    const roi = (pnl / (entry * qty / editingPos.leverage)) * 100;
    return { pnl, roi };
  };

  const currentResult = scanResults[currentScanIdx];

  if (loading) return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#f0f0f0' }}>
      <NeoLoader message="FORGE INITIALIZING..." />
    </div>
  );

  return (
    <div className="app-wrapper">
      <main className="layout-grid">
        {/* Sidebar: Intelligence */}
        <aside className="sidebar-content">
          <div className="neo-card" data-label="Intelligence Scanner" style={{ transform: 'none', height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span className="metric-label">Market Scan</span>
              <div className="btn-wrapper" onClick={runScan}>
                <button className={`btn-dexter ${isScanning ? 'loading' : ''}`} disabled={isScanning}>
                  <svg className="btn-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path>
                  </svg>
                  <div className="txt-wrapper">
                    {"ANALYZE".split('').map((l, i) => (
                      <span key={i} className="btn-letter" style={{ animationDelay: `${i * 0.08}s` }}>{l}</span>
                    ))}
                  </div>
                </button>
              </div>
            </div>

            {isScanning && <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><NeoLoader message="FORGE IS SCANNING..." /></div>}

            {!isScanning && currentResult && (
              <div key={currentScanIdx} className="neo-card" data-label={`${currentScanIdx + 1}/${scanResults.length} : ${currentResult.symbol}`} style={{ flex: 1, margin: 0, padding: '15px', display: 'flex', flexDirection: 'column', transform: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '900', fontSize: '0.8rem' }}>PRICE: ${currentResult.price}</span>
                  <span className="mono" style={{ color: currentResult.change >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '900', fontSize: '0.8rem' }}>
                    {currentResult.change >= 0 ? '▲' : '▼'} {Math.abs(currentResult.change).toFixed(2)}%
                  </span>
                </div>
                <div className="opinion-block">{currentResult.opinion}</div>
                {currentResult.signal.side !== 'WAIT' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <div style={{ background: currentResult.signal.side === 'LONG' ? 'var(--success)' : 'var(--danger)', color: '#fff', textAlign: 'center', padding: '6px', fontWeight: '900', border: '2px solid #000', fontSize: '0.75rem' }}>
                      {currentResult.signal.side} @ {currentResult.signal.entry || currentResult.price}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {[1, 2, 3].map(idx => {
                        const tpVal = currentResult.signal[`tp${idx}`];
                        if (!tpVal) return null;
                        const pnl = calculateEstimatedPNL(currentResult.signal.side, currentResult.signal.entry || currentResult.price, tpVal, config.FIXED_MARGIN_USDT, currentResult.maxLeverage);
                        return (
                          <button key={idx} className="neo-btn neo-btn-primary" style={{ padding: '4px 8px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column' }} onClick={() => executeTrade(currentResult.symbol, currentResult, tpVal)}>
                            <span>TP{idx}: ${tpVal}</span>
                            <span style={{ fontSize: '0.55rem' }}>+${pnl.toFixed(2)}</span>
                          </button>
                        );
                      })}
                      <button className="neo-btn" style={{ fontSize: '0.7rem' }} onClick={() => {
                        if (currentScanIdx < scanResults.length - 1) setCurrentScanIdx(prev => prev + 1);
                        else setScanResults([]);
                      }}>NEXT ⏭</button>
                    </div>
                    <button className="neo-btn neo-btn-danger" style={{ width: '100%', height: '32px', fontSize: '0.7rem' }} onClick={() => setScanResults([])}>STOP SCAN 🔙</button>
                  </div>
                ) : (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ textAlign: 'center', fontWeight: '800', color: 'var(--text-dim)', fontSize: '0.75rem' }}>NO SIGNAL</div>
                    <button className="neo-btn" style={{ width: '100%' }} onClick={() => {
                      if (currentScanIdx < scanResults.length - 1) setCurrentScanIdx(prev => prev + 1);
                      else setScanResults([]);
                    }}>SKIP NEXT ⏭</button>
                  </div>
                )}
              </div>
            )}
            {!isScanning && !currentResult && (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--text-dim)', fontWeight: '700', fontSize: '0.8rem' }}>Press ANALYZE to scan markets.</div>
            )}
          </div>
        </aside>

        <section className="dashboard-content">
          <div className="dashboard-header-row">
            <div className="stats-container">
              <div className="metric-box"><span className="metric-label">Equity</span><span className="metric-value">${wallet?.totalEquity?.toFixed(2) || '0.00'}</span></div>
              <div className="metric-box metric-box-white"><span className="metric-label">Active Orders</span><span className="metric-value">{positions.length}</span></div>
              <div className="metric-box metric-box-white"><span className="metric-label">Balance</span><span className="metric-value">${wallet?.walletBalance?.toFixed(2) || '0.00'}</span></div>
              
              <div className="control-block">
                <button className="neo-btn neo-btn-primary" style={{ height: '35px' }} onClick={() => setShowSettings(true)}>SETTINGS</button>
                <div className="batch-close-grid">
                  <button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px' }} onClick={() => closeBulkPositions('all')}>ALL</button>
                  <button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px', color: 'var(--success)' }} onClick={() => closeBulkPositions('profit')}>WIN</button>
                  <button className="neo-btn" style={{ fontSize: '0.6rem', padding: '4px', color: 'var(--danger)' }} onClick={() => closeBulkPositions('loss')}>LOSS</button>
                </div>
              </div>
            </div>

            <div className="brand-text-wrapper">
              <div className="brand-text">
                <div className="brand-main">
                  <span className="brand-zenith">FORGE</span>
                  <div className="brand-engine">{"TRADER ENGINE".split('').map((char, i) => <span key={i}>{char === ' ' ? '\u00A0' : char}</span>)}</div>
                </div>
                <div className="brand-ai">AI</div>
              </div>
              <div className="carousel-nav"><button className="neo-btn" onClick={() => scrollCarousel('left')}>◀</button><button className="neo-btn" onClick={() => scrollCarousel('right')}>▶</button></div>
            </div>
          </div>

          <div className="carousel-container">
            {!wallet && positions.length === 0 && <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><NeoLoader message="SYNCING POSITIONS..." /></div>}
            <div className="pos-carousel" ref={carouselRef}>
              {positions.map((p, i) => (
                <div key={i} className="neo-card neo-card-carousel" data-label={p.symbol}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div><h4 style={{ fontSize: '1.2rem', fontWeight: '900' }}>{p.symbol}</h4><span style={{ background: p.side === 'Buy' ? 'var(--success)' : 'var(--danger)', color: '#fff', padding: '2px 8px', fontWeight: '900', fontSize: '0.7rem', border: '2px solid #000', display: 'inline-block', marginTop: '2px' }}>{p.side === 'Buy' ? 'LONG' : 'SHORT'} {p.leverage}X</span></div>
                    <div style={{ textAlign: 'right' }}><span className="metric-label" style={{ fontSize: '0.55rem' }}>Unrealized PNL</span><div className="mono" style={{ fontSize: '1.6rem', fontWeight: '900', color: parseFloat(p.unrealisedPnl) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{parseFloat(p.unrealisedPnl) >= 0 ? '+' : ''}{parseFloat(p.unrealisedPnl).toFixed(2)}</div></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 0', borderTop: '2px solid #000', borderBottom: '2px solid #000', marginBottom: '10px' }}>
                    <div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Entry / Mark</span><div className="mono" style={{ fontWeight: '800', fontSize: '0.8rem' }}>{parseFloat(p.avgPrice).toFixed(4)} / {parseFloat(p.markPrice).toFixed(4)}</div></div>
                    <div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Size</span><div className="mono" style={{ fontWeight: '800', fontSize: '0.8rem' }}>{p.size}</div></div>
                    <div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Take Profit</span><div className="mono" style={{ fontWeight: '800', color: 'var(--success)', fontSize: '0.8rem' }}>${parseFloat(p.takeProfit || 0).toFixed(4)}</div></div>
                    <div><span className="metric-label" style={{ fontSize: '0.55rem' }}>Stop Loss</span><div className="mono" style={{ fontWeight: '800', color: 'var(--danger)', fontSize: '0.8rem' }}>${parseFloat(p.stopLoss || 0).toFixed(4)}</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}><button className="neo-btn neo-btn-primary" style={{ flex: 1.5, padding: '8px' }} onClick={() => { setEditingPos(p); setNewTP(p.takeProfit || ''); setNewSL(p.stopLoss || ''); }}>Update Exit</button><button className="neo-btn neo-btn-danger" style={{ flex: 1, padding: '8px' }} onClick={() => closePosition(p)}>Close</button></div>
                </div>
              ))}
              {positions.length === 0 && wallet && <div style={{ flex: 1, display: 'grid', placeItems: 'center', opacity: 0.5, border: '4px dashed #000', borderRadius: '12px', minWidth: '500px' }}><h3 style={{ fontWeight: 900 }}>NO ACTIVE TRADES</h3></div>}
            </div>
            {positions.length > 0 && (
              <div className="global-projection-bar">
                <div className="projection-segment tp-hit-seg"><span className="projection-label">POTENTIAL PROFIT</span><div className="projection-value tp">+${totalTP.toFixed(2)}</div></div>
                <div className="projection-segment curr-profit-seg"><span className="projection-label">CURRENT PROFIT</span><div className="projection-value curr">+${currentProfit.toFixed(2)}</div></div>
                <div className="projection-segment curr-loss-seg"><span className="projection-label">CURRENT LOSS</span><div className="projection-value curr">-${Math.abs(currentLoss).toFixed(2)}</div></div>
                <div className="projection-segment sl-hit-seg"><span className="projection-label">POTENTIAL LOSS</span><div className="projection-value sl">-${Math.abs(totalSL).toFixed(2)}</div></div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="neo-footer">CREATED BY CRYPTSMILE | FORGE TRADER AI ENGINE V6.3</footer>

      {/* Welcome / Privacy Modal */}
      {showWelcome && (
        <div className="modal-overlay modal-overlay-high">
          <div className="modal-content">
            <h2 className="modal-title">Welcome to Forge AI</h2>
            <div className="opinion-block" style={{ maxHeight: 'none', background: 'var(--accent-light)' }}>
              <strong>🔒 PRIVACY & SUPPORT INFO</strong>
              <p style={{ marginTop: '10px' }}>
                <strong>FORGE AI tidak pernah menyimpan data kredensial Anda di server mana pun.</strong> Seluruh kunci API disimpan secara lokal di browser Anda.
              </p>
              <hr style={{ margin: '15px 0', border: 'none', borderTop: '2px solid #000' }} />
              <p style={{ fontSize: '0.75rem' }}>
                <strong>Current Version Support:</strong><br/>
                • Exchange: <strong>Bybit & Binance</strong><br/>
                • Intelligence: <strong>OpenRouter & Groq</strong>
              </p>
            </div>
            <button className="neo-btn neo-btn-primary" style={{ width: '100%', height: '54px', marginTop: '20px' }} onClick={() => setShowWelcome(false)}>SAYA MENGERTI & LANJUTKAN</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmData && (
        <div className="modal-overlay modal-overlay-high">
          <div className="modal-content">
            <h2 className="modal-title">{confirmData.title}</h2>
            <p style={{ marginBottom: '32px', fontWeight: '600' }}>{confirmData.message}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="neo-btn neo-btn-primary" style={{ flex: 1.5, height: '48px' }} onClick={confirmData.onConfirm}>PROCEED ✓</button>
              <button className="neo-btn" style={{ flex: 1, height: '48px' }} onClick={() => setConfirmData(null)}>CANCEL ✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notification && (
        <div className="modal-overlay modal-overlay-high">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setNotification(null)}>×</button>
            <h2 className="modal-title" style={{ color: notification.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>{notification.title}</h2>
            <p style={{ marginBottom: '32px', fontWeight: '600' }}>{notification.message}</p>
            <button className="neo-btn neo-btn-primary" style={{ width: '100%', height: '48px' }} onClick={() => setNotification(null)}>OK, GOT IT</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content"><button className="modal-close" onClick={() => setShowSettings(false)}>×</button><h2 style={{ marginBottom: '24px', fontSize: '1.5rem', fontWeight: '900' }}>SYSTEM CONFIG</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="metric-label">Exchange</label>
                  <select value={config.EXCHANGE} onChange={e => setConfig({...config, EXCHANGE: e.target.value as any})} style={{ width: '100%', padding: '10px', border: 'var(--border-thick)', fontWeight: '800' }}>
                    <option value="BYBIT">BYBIT</option>
                    <option value="BINANCE">BINANCE</option>
                  </select>
                </div>
                <div>
                  <label className="metric-label">AI Provider</label>
                  <select value={config.AI_PROVIDER} onChange={e => setConfig({...config, AI_PROVIDER: e.target.value as any})} style={{ width: '100%', padding: '10px', border: 'var(--border-thick)', fontWeight: '800' }}>
                    <option value="OPENROUTER">OPENROUTER</option>
                    <option value="GROQ">GROQ (FAST)</option>
                  </select>
                </div>
              </div>

              {config.EXCHANGE === 'BYBIT' ? (
                <>
                  <div><label className="metric-label">Bybit API Key</label><input value={config.BYBIT_API_KEY} onChange={e => setConfig({...config, BYBIT_API_KEY: e.target.value})} /></div>
                  <div><label className="metric-label">Bybit API Secret</label><input type="password" value={config.BYBIT_API_SECRET} onChange={e => setConfig({...config, BYBIT_API_SECRET: e.target.value})} /></div>
                </>
              ) : (
                <>
                  <div><label className="metric-label">Binance API Key</label><input value={config.BINANCE_API_KEY} onChange={e => setConfig({...config, BINANCE_API_KEY: e.target.value})} /></div>
                  <div><label className="metric-label">Binance API Secret</label><input type="password" value={config.BINANCE_API_SECRET} onChange={e => setConfig({...config, BINANCE_API_SECRET: e.target.value})} /></div>
                </>
              )}

              {config.AI_PROVIDER === 'OPENROUTER' ? (
                <div><label className="metric-label">OpenRouter API Key</label><input type="password" value={config.OPENROUTER_API_KEY} onChange={e => setConfig({...config, OPENROUTER_API_KEY: e.target.value})} /></div>
              ) : (
                <div><label className="metric-label">Groq API Key</label><input type="password" value={config.GROQ_API_KEY} onChange={e => setConfig({...config, GROQ_API_KEY: e.target.value})} /></div>
              )}

              <div><label className="metric-label">Margin (USDT)</label><input type="number" value={config.FIXED_MARGIN_USDT} onChange={e => setConfig({...config, FIXED_MARGIN_USDT: parseFloat(e.target.value)})} /></div>
              <div><label className="metric-label">Indicators</label><div style={{ display: 'flex', gap: '15px' }}>{['RSI', 'EMA', 'ATR'].map(ind => (<label key={ind} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}><input type="checkbox" style={{ width: '18px', height: '18px' }} checked={config.ACTIVE_INDICATORS.includes(ind)} onChange={e => { const next = e.target.checked ? [...config.ACTIVE_INDICATORS, ind] : config.ACTIVE_INDICATORS.filter(i => i !== ind); setConfig({...config, ACTIVE_INDICATORS: next}); }} /><span style={{ fontSize: '0.85rem', fontWeight: '800' }}>{ind}</span></label>))}</div></div>
              
              <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '5px 0' }} />
              
              <div style={{ background: '#000', color: '#fff', padding: '12px', border: 'var(--border-thin)', fontSize: '0.75rem' }}>
                <strong>🛠️ FEEDBACK & SUPPORT</strong>
                <p style={{ marginTop: '5px', opacity: 0.9 }}>
                  Found a bug or have a brilliant idea? We&apos;re always evolving. 
                  Reach out to the Forge Forge Engineering team:
                </p>
                <div style={{ marginTop: '10px', color: 'var(--accent)', fontWeight: '900', fontSize: '0.85rem', textAlign: 'center' }}>
                  official@forgeai.eu.org
                </div>
              </div>

              <button className="neo-btn neo-btn-primary" style={{ padding: '12px', marginTop: '10px' }} onClick={() => {
                setConfirmData({
                  title: 'Save Settings',
                  message: 'Update your system configuration? Active connections will be reset.',
                  onConfirm: () => { setConfirmData(null); setShowSettings(false); fetchData(); }
                });
              }}>Update Configuration</button>
            </div>
          </div>
        </div>
      )}

      {editingPos && (
        <div className="modal-overlay">
          <div className="modal-content"><button className="modal-close" onClick={() => setEditingPos(null)}>×</button><h2 style={{ marginBottom: '8px', fontSize: '1.25rem', fontWeight: '900' }}>MANAGE {editingPos.symbol}</h2><p style={{ marginBottom: '24px', fontWeight: '600', fontSize: '0.85rem' }}>Set your next strategic move.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label className="metric-label">Take Profit</label><input type="number" step="0.0001" value={newTP} onChange={e => setNewTP(e.target.value)} />{newTP && calculateEstimate('TP', newTP) && (<div className="pnl-estimate"><span>EST. PROFIT</span><span style={{ color: 'var(--success)' }}>+${calculateEstimate('TP', newTP)?.pnl.toFixed(2)} ({calculateEstimate('TP', newTP)?.roi.toFixed(2)}%)</span></div>)}</div>
              <div><label className="metric-label">Stop Loss</label><input type="number" step="0.0001" value={newSL} onChange={e => setNewSL(e.target.value)} />{newSL && calculateEstimate('SL', newSL) && (<div className="pnl-estimate"><span>EST. LOSS</span><span style={{ color: 'var(--danger)' }}>-${Math.abs(calculateEstimate('SL', newSL)?.pnl || 0).toFixed(2)} ({calculateEstimate('SL', newSL)?.roi.toFixed(2)}%)</span></div>)}</div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}><button className="neo-btn neo-btn-primary" style={{ flex: 1.5, height: '48px' }} onClick={updateTPSL}>Update Position</button><button className="neo-btn" style={{ flex: 1, height: '48px' }} onClick={() => setEditingPos(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

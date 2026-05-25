'use client';

import React, { useEffect, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  exchange: 'BYBIT' | 'BINANCE';
}

export default function TradingViewWidget({ symbol, exchange }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    // Clean up previous script if any
    container.current.innerHTML = '';

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    // Map internal symbol to TradingView format
    // Bybit: BYBIT:BTCUSDT.P (Linear)
    // Binance: BINANCE:BTCUSDT.P (Futures)
    const tvExchange = exchange === 'BYBIT' ? 'BYBIT' : 'BINANCE';
    const tvSymbol = `${tvExchange}:${symbol}${exchange === 'BINANCE' ? '' : ''}`;

    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "60",
      "timezone": "Etc/UTC",
      "theme": "light",
      "style": "1",
      "locale": "en",
      "allow_symbol_change": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    container.current.appendChild(script);
  }, [symbol, exchange]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "calc(100% - 32px)", width: "100%" }}></div>
    </div>
  );
}

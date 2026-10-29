import { useState } from 'react';

export default function TradingViewChart({ pair }) {
  const initialSymbol = `KRAKEN:${String(pair).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  const [symbol, setSymbol] = useState(initialSymbol);
  const [input, setInput] = useState(initialSymbol);
  const [error, setError] = useState('');
  const settings = { autosize: true, symbol, interval: '60', timezone: 'Europe/Vienna', theme: 'dark', style: '1', locale: 'de_DE', allow_symbol_change: false, hide_top_toolbar: false, hide_side_toolbar: false, withdateranges: true, calendar: false, support_host: 'https://www.tradingview.com' };
  // The hosted chart has a different origin; its scripts cannot access
  // dashboard data or trading forms in the parent page.
  const source = `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=de_DE#${encodeURIComponent(JSON.stringify({ ...settings, width: '100%', height: '100%' }))}`;
  function change(event) {
    event.preventDefault();
    const next = input.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,30}:[A-Z0-9_.!-]{1,50}$/.test(next)) { setError('Bitte ein TradingView-Symbol wie KRAKEN:BTCEUR eingeben.'); return; }
    setError(''); setSymbol(next);
  }
  return <div className="fusion-tradingview">
    <p className="source-note">TradingView-Referenzmarkt: <strong>{symbol}</strong>. Diese Kurse können von Fusion abweichen. Orderbuch und Orderformular handeln weiterhin <strong>{pair}</strong> über Fusion.</p>
    <form className="tradingview-symbol-form" onSubmit={change}><label>TradingView-Symbol<input aria-label="TradingView-Symbol" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} /></label><button className="secondary-button" type="submit">Referenzmarkt anzeigen</button></form>
    {error && <p role="alert">{error}</p>}
    <iframe key={symbol} title={`TradingView-Chart ${symbol}`} src={source} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerPolicy="no-referrer" allowFullScreen />
    <p className="source-note"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts von TradingView</a> · Falls das Paar bei Kraken nicht verfügbar ist, oben ein anderes TradingView-Symbol desselben Paars wählen. Bei Ladeproblemen <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noreferrer">Chart bei TradingView öffnen ↗</a>.</p>
  </div>;
}

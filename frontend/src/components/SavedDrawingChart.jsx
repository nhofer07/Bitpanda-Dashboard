import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChartDrawings } from './useChartDrawings.js';
import { formatPriceNumber, priceDigits, formatNumber } from './formatters.js';
const TOOLS = { cursor: 'Verschieben / Zoom', line: 'Trendlinie', horizontal: 'Kursmarke', rectangle: 'Rechteck', fibonacci: 'Fibonacci', text: 'Text' };
const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
function barsFrom(candles) {
  const byTime = new Map();
  for (const row of candles) {
    const rawTime = Array.isArray(row) ? row[0] : row.timestamp ?? row.time ?? row.openTime;
    const numeric = finite(rawTime), milliseconds = numeric == null ? Date.parse(rawTime) : numeric < 1e12 ? numeric * 1000 : numeric;
    const close = finite(Array.isArray(row) ? row[4] : row.close ?? row.c);
    const time = Math.floor(milliseconds / 1000);
    if (!Number.isFinite(time) || close == null || close <= 0) continue;
    const open = finite(Array.isArray(row) ? row[1] : row.open ?? row.o), high = finite(Array.isArray(row) ? row[2] : row.high ?? row.h), low = finite(Array.isArray(row) ? row[3] : row.low ?? row.l);
    byTime.set(time, { time, value: close, ...(open > 0 && high >= Math.max(open, close) && low > 0 && low <= Math.min(open, close) ? { open, high, low, close } : {}) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
function logicalAtTime(bars, time) {
  if (bars.length < 2) return null;
  let index = bars.findIndex(bar => bar.time >= time);
  if (index === 0) return (time - bars[0].time) / (bars[1].time - bars[0].time);
  if (index < 0) { index = bars.length - 1; return index + (time - bars[index].time) / (bars[index].time - bars[index - 1].time); }
  return index - 1 + (time - bars[index - 1].time) / (bars[index].time - bars[index - 1].time);
}
function timeAtLogical(bars, logical) {
  const index = Math.max(0, Math.min(bars.length - 2, Math.floor(logical)));
  return bars[index].time + (logical - index) * (bars[index + 1].time - bars[index].time);
}
export default function SavedDrawingChart({ pair, candles, currency, interval, onIntervalChange }) {
  const host = useRef(null), plot = useRef(null), api = useRef(null);
  const state = useChartDrawings(pair);
  const [tool, setTool] = useState('cursor'), [color, setColor] = useState('#2acb99'), [text, setText] = useState('');
  const [start, setStart] = useState(null), [preview, setPreview] = useState(null), [geometry, setGeometry] = useState({ width: 0, height: 0, positions: [] });
  const bars = useMemo(() => barsFrom(candles), [candles]);
  const hasOHLC = bars.length > 0 && bars.every(bar => bar.open != null);
  const shapes = useRef([]), barsRef = useRef(bars); barsRef.current = bars;
  const draft = start && preview ? { id: 'preview', type: tool, color, text, points: [start, preview] } : null;
  shapes.current = [...state.drawings, ...(draft ? [draft] : [])];
  useEffect(() => {
    const chart = createChart(host.current, { autoSize: true, height: 510, layout: { background: { color: '#101615' }, textColor: '#a4afac', attributionLogo: true }, grid: { vertLines: { color: '#202b28' }, horzLines: { color: '#202b28' } }, rightPriceScale: { minimumWidth: 78 }, timeScale: { timeVisible: true, secondsVisible: false }, localization: { locale: 'de-AT' } });
    const prices = bars.map(b => b.value), minimum = Math.min(...prices.filter(p => p > 0));
    const precision = minimum < .01 ? Math.min(12, Math.ceil(-Math.log10(minimum)) + 4) : 4;
    const series = chart.addSeries(hasOHLC ? CandlestickSeries : LineSeries, { ...(hasOHLC ? { upColor: '#29bd94', downColor: '#f56969', wickUpColor: '#29bd94', wickDownColor: '#f56969', borderVisible: false } : { color: '#29bd94', lineWidth: 2 }), priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    chart.applyOptions({ localization: { priceFormatter: value => formatPriceNumber(value, Math.max(4, priceDigits(value))) } });
    api.current = { chart, series, fitted: false };
    let frame, previous = '';
    function paint() {
      if (api.current?.chart !== chart) return;
      const width = chart.timeScale().width(), height = chart.panes()[0]?.getHeight() || 470;
      const positions = shapes.current.map(shape => ({ ...shape, screen: shape.points.map(p => ({ x: barsRef.current.length < 2 ? null : chart.timeScale().logicalToCoordinate(logicalAtTime(barsRef.current, p.time)), y: series.priceToCoordinate(p.price) })) }));
      const signature = JSON.stringify([width, height, positions]);
      if (signature !== previous) { previous = signature; setGeometry({ width, height, positions }); }
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); api.current = null; chart.remove(); };
  }, [hasOHLC]);
  useEffect(() => {
    const instance = api.current; if (!instance) return;
    const minimum = Math.min(...bars.map(b => b.value));
    const precision = minimum > 0 && minimum < .01 ? Math.min(12, Math.ceil(-Math.log10(minimum)) + 4) : 4;
    instance.series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
    instance.series.setData(hasOHLC ? bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })) : bars.map(({ time, value }) => ({ time, value })));
    if (bars.length > 1 && !instance.fitted) { instance.chart.timeScale().fitContent(); instance.fitted = true; }
  }, [bars, hasOHLC]);
  useEffect(() => { api.current?.chart.applyOptions({ handleScroll: tool === 'cursor', handleScale: tool === 'cursor' }); setStart(null); setPreview(null); }, [tool, interval]);
  useEffect(() => { const escape = e => { if (e.key === 'Escape') { setStart(null); setPreview(null); setTool('cursor'); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
  function point(event) {
    if (!api.current || bars.length < 2) return null;
    const rect = plot.current.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > geometry.width || y > geometry.height) return null;
    const logical = api.current.chart.timeScale().coordinateToLogical(x), price = api.current.series.coordinateToPrice(y);
    return logical == null || price == null || price <= 0 ? null : { time: timeAtLogical(bars, logical), price };
  }
  function draw(event) {
    if (!state.ready || state.saving || tool === 'cursor') return;
    event.preventDefault(); const p = point(event); if (!p) return;
    if (tool === 'text' && !text.trim()) return;
    if (!['text', 'horizontal'].includes(tool) && !start) { setStart(p); setPreview(p); return; }
    const shape = { id: crypto.randomUUID?.() || `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: tool, points: ['text', 'horizontal'].includes(tool) ? [p] : [start, p], color, text: tool === 'text' ? text.trim() : '' };
    if (state.drawings.length >= 150) return;
    void state.save([...state.drawings, shape]); setStart(null); setPreview(null); setTool('cursor');
  }
  const disabled = !state.ready || state.saving;
  const priceLabel = value => `${formatPriceNumber(value, Math.max(4, priceDigits(value)))} ${currency === 'EUR' ? '€' : currency}`;
  return <div className="saved-drawing-chart">
    <div className="drawing-toolbar" role="group" aria-label="Zeichenwerkzeuge">{Object.entries(TOOLS).map(([id, label]) => <button type="button" className="secondary-button" key={id} disabled={disabled || state.drawings.length >= 150 && id !== 'cursor'} aria-pressed={tool === id} onClick={() => setTool(id)}>{label}</button>)}<label>Farbe<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label><label>Intervall<select aria-label="Zeichenchart-Intervall" value={interval} disabled={state.saving} onChange={e => onIntervalChange(e.target.value)}>{['15m', '1h', '4h', '1d'].map(v => <option key={v}>{v}</option>)}</select></label></div>
    {tool === 'text' && <label className="settings-field">Text eintragen und im Chart platzieren<input maxLength={160} value={text} onChange={e => setText(e.target.value)} /></label>}
    <p className="source-note" role="status">{state.saving ? 'Zeichnungen werden gespeichert …' : state.dirty ? 'Lokale Änderungen noch nicht auf dem Server gespeichert.' : state.ready ? 'Zeichnungen auf dem Server gespeichert · automatisch pro Handelspaar' : 'Gespeicherte Zeichnungen werden geladen …'}</p>
    {state.error && <div className="error-box" role="alert">{state.error}<div className="settings-actions"><button className="secondary-button" disabled={disabled} onClick={() => state.save()}>Erneut speichern</button><button className="secondary-button" disabled={state.saving} onClick={state.exportDraft}>Lokalen Entwurf exportieren</button><button className="secondary-button" disabled={state.saving} onClick={state.discardDraft}>Serverstand laden</button></div></div>}
    {tool !== 'cursor' && <p className="source-note">{start ? 'Zweiten Punkt setzen. Escape bricht ab.' : tool === 'horizontal' ? 'Auf die gewünschte Kurshöhe klicken oder tippen.' : tool === 'text' ? 'Text eingeben und die Position anklicken.' : 'Anfangs- und Endpunkt nacheinander anklicken oder antippen.'}</p>}
    <div className="drawing-plot" ref={plot}><div ref={host} className="drawing-chart-canvas" /><svg className="drawing-overlay" width={geometry.width} height={geometry.height} role="img" aria-label={`Zeichnungen für ${pair}`} style={{ pointerEvents: tool === 'cursor' || disabled ? 'none' : 'auto', touchAction: tool === 'cursor' ? 'auto' : 'none' }} onPointerDown={draw} onPointerMove={e => { if (start) setPreview(point(e)); }}>{geometry.positions.map(shape => {
      const a = shape.screen[0], b = shape.screen[1]; if (!a || a.x == null || a.y == null) return null;
      const common = { stroke: shape.color, strokeWidth: 2, fill: 'none' };
      if (shape.type === 'horizontal') return <g key={shape.id} data-drawing-id={shape.id}><line x1="0" x2={geometry.width} y1={a.y} y2={a.y} {...common} /><text x="8" y={a.y - 5} fill={shape.color}>{priceLabel(shape.points[0].price)}</text></g>;
      if (shape.type === 'text') return <text key={shape.id} data-drawing-id={shape.id} x={a.x} y={a.y} fill={shape.color}>{shape.text}</text>;
      if (!b || b.x == null || b.y == null) return null;
      if (shape.type === 'line') return <line key={shape.id} data-drawing-id={shape.id} x1={a.x} x2={b.x} y1={a.y} y2={b.y} {...common} />;
      if (shape.type === 'rectangle') return <rect key={shape.id} data-drawing-id={shape.id} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} {...common} fill={shape.color} fillOpacity=".1" />;
      return <g key={shape.id} data-drawing-id={shape.id}>{[0, .236, .382, .5, .618, .786, 1].map(level => { const price = shape.points[0].price + (shape.points[1].price - shape.points[0].price) * level, y = a.y + (b.y - a.y) * level; return <g key={level}><line x1={Math.min(a.x,b.x)} x2={Math.max(a.x,b.x)} y1={y} y2={y} {...common} strokeWidth="1" /><text x={Math.min(a.x,b.x) + 4} y={y - 4} fill={shape.color}>{formatNumber(level * 100, 1)} % · {priceLabel(price)}</text></g>; })}</g>;
    })}</svg></div>
    {bars.length < 2 && <p>Für dieses Paar werden noch keine ausreichenden Kursdaten angezeigt.</p>}
    <p className="source-note">{hasOHLC ? 'Kerzen' : 'Schlusskurs-Linie'} · Fusion-Marktdaten · {pair}. Zeit- und Kurskoordinaten bleiben beim Zoomen und beim erneuten Öffnen erhalten. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.</a></p>
    {state.drawings.length > 0 && <details className="drawing-list"><summary>{state.drawings.length} gespeicherte Zeichnungen · verwalten</summary><ul>{state.drawings.map((shape, index) => <li key={shape.id}><span>{TOOLS[shape.type]} {index + 1}{shape.text ? ` · ${shape.text}` : ''}</span><button className="secondary-button" disabled={disabled} onClick={() => state.save(state.drawings.filter(item => item.id !== shape.id))}>Entfernen</button></li>)}</ul></details>}
  </div>;
}

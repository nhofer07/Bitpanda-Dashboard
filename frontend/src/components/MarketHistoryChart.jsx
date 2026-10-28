import { formatNumber } from "./formatters.js";
import LoadingState from "./LoadingState.jsx";
import { useEffect, useState } from "react";

import { chartTrades } from "./chartTrades.js";

import useMarketHistoryRefresh from "./useMarketHistoryRefresh.js";
import { loadMarketHistorySnapshot, marketDateLabel } from "./marketHistory.js";

const ranges = [["1d", "1 Tag"], ["1w", "1 Woche"], ["1mo", "1 Monat"], ["6mo", "6 Monate"], ["1y", "1 Jahr"], ["5y", "5 Jahre"], ["10y", "10 Jahre"], ["max", "Gesamt"]];
const date = value => new Date(value).toLocaleDateString("de-AT");
const dateTime = value => new Date(value).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
const axisDate = (value, range) => range === "1d"
  ? new Date(value).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })
  : range === "1w"
    ? new Date(value).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" })
    : date(value);
const number = value => formatNumber(value, 2);

export default function MarketHistoryChart({ asset, trades = [] }) {
  const refresh = useMarketHistoryRefresh();
  const [range, setRange] = useState("1d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null); setHover(null); setSelectedTrade(null);
    loadMarketHistorySnapshot(asset, range, refresh, retry).then(result => {
      if (active) setData(result);
    }).catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [asset.symbol, asset.name, asset.category, range, retry, refresh, asset.chartSource]);
  const points = data?.history || [];
  const markers = chartTrades(trades, points);
  const values = [...points, ...markers].map(point => point.close);
  const first = points[0];
  const last = points.at(-1);
  const change = first && last ? (last.close / first.close - 1) * 100 : 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || max * .02 || 1;
  const x = point => 76 + (new Date(point.date) - new Date(first.date)) / (new Date(last.date) - new Date(first.date) || 1) * 704;
  const y = value => 230 - (value - min) / spread * 190;
  const selected = points[hover] || last;
  return <section className="table-card market-history">
    <div className="section-heading"><div><span className="eyebrow">Historische Kurse</span><h3>{asset.name} · Kursverlauf</h3></div></div>
    <div className="segmented-control history-ranges" aria-label="Chart-Zeitraum">{ranges.map(([value, label]) => <button key={value} aria-pressed={range === value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{label}</button>)}</div>
    <div aria-live="polite">{loading && <LoadingState compact>Kursverlauf wird geladen …</LoadingState>}{error && <div className="error-box">{error} <button onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></div>}</div>
    {points.length > 1 && <>
      {range === "1d" && <p className="source-note">{marketDateLabel(last.date)}</p>}
      <p className="source-note">{data.source?.startsWith("Bitpanda") ? "Original-Kursdaten von Bitpanda · " : ""}<span className="positive">▲ Kauf</span> · <span className="negative">▼ Verkauf</span> · {markers.length} Trades im angezeigten Zeitraum</p>
      <div className="history-summary"><strong>{number(selected.close)} {data.currency}{data.unit ? `/${data.unit}` : ""} <small>· {data.interval === "1d" ? date(selected.date) : dateTime(selected.date)}</small></strong><span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{number(change)} % im angezeigten Zeitraum</span></div>
      <svg className="history-svg" viewBox="0 0 800 280" role="img" aria-label={`${asset.name}: Kursverlauf von ${date(first.date)} bis ${date(last.date)} in ${data.currency}`} onPointerLeave={() => setHover(null)} onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const targetX = (event.clientX - rect.left) / rect.width * 800;
        let closest = 0;
        points.forEach((point, index) => { if (Math.abs(x(point) - targetX) < Math.abs(x(points[closest]) - targetX)) closest = index; });
        setHover(closest);
      }}>
        {[0, .5, 1].map(fraction => <g key={fraction}><line x1="76" x2="780" y1={40 + fraction * 190} y2={40 + fraction * 190} stroke="#dce5e1" /><text x="66" y={44 + fraction * 190} textAnchor="end">{number(min + (1 - fraction) * spread)}</text></g>)}
        <polyline points={points.map(point => `${x(point)},${y(point.close)}`).join(" ")} fill="none" stroke={change >= 0 ? "#16936b" : "#d25454"} strokeWidth="2.5" strokeLinejoin="round" />
        {markers.map(trade => <g key={trade.key} role="button" tabIndex="0" aria-label={`${trade.type === "buy" ? "Kauf" : "Verkauf"}: ${dateTime(trade.date)}, ${number(trade.close)} EUR`} style={{ cursor: "pointer" }} onClick={() => setSelectedTrade(trade)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelectedTrade(trade); } }}>
          <title>{trade.type === "buy" ? "Kauf" : "Verkauf"} · {dateTime(trade.date)} · {number(trade.quantity)} Stück · {number(trade.close)} EUR</title>
          <circle cx={x(trade)} cy={y(trade.close)} r="10" fill="transparent" />
          <path d={trade.type === "buy" ? `M ${x(trade)} ${y(trade.close) - 7} l 6 12 h -12 Z` : `M ${x(trade)} ${y(trade.close) + 7} l 6 -12 h -12 Z`} fill={trade.type === "buy" ? "#16936b" : "#d25454"} stroke="white" strokeWidth="1.5" />
        </g>)}
        {[0, .5, 1].map(fraction => <text key={fraction} x={76 + fraction * 704} y="265" textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{axisDate(new Date(+new Date(first.date) + fraction * (new Date(last.date) - new Date(first.date))), range)}</text>)}
        {hover !== null && <g><line x1={x(selected)} x2={x(selected)} y1="30" y2="235" stroke="#83978e" strokeDasharray="4" /><circle cx={x(selected)} cy={y(selected.close)} r="4" fill="#147951" /></g>}
      </svg>
      {selectedTrade && <p role="status"><strong>{selectedTrade.type === "buy" ? "Kauf" : "Verkauf"}</strong> · {dateTime(selectedTrade.date)} · {Number(selectedTrade.quantity).toLocaleString("de-AT", { maximumFractionDigits: 8 })} Stück · Ausführungspreis {number(selectedTrade.close)} EUR · Betrag {number(selectedTrade.fiat)} EUR</p>}
      <label className="history-slider">Datenpunkt ansehen<input type="range" min="0" max={points.length - 1} value={hover ?? points.length - 1} onChange={event => setHover(Number(event.target.value))} aria-valuetext={`${data.interval === "1d" ? date(selected.date) : dateTime(selected.date)}: ${number(selected.close)} ${data.currency}`} /></label>
      <small className="source-note">{data.source} · {data.sampled ? "Ausgewählte Kurse" : data.interval === "5m" ? "5-Minuten-Kurse" : data.interval === "15m" ? "15-Minuten-Kurse" : data.interval === "intraday" ? "Intraday-Kurse" : "Tägliche Kurse"} in EUR{data.sourceCurrency !== "EUR" ? " · zum jeweiligen historischen Wechselkurs umgerechnet" : ""}. Verfügbar: {data.interval === "1d" ? `${date(first.date)}–${date(last.date)}` : `${dateTime(first.date)}–${dateTime(last.date)}`}. Kursentwicklung ohne Dividenden; je nach Asset und Börsenöffnungszeiten kann die Historie kürzer sein. {data.note}</small>
    </>}
  </section>;
}

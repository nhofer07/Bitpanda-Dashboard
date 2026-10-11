import { useEffect, useMemo, useState } from "react";
import { buildChartCashflows, cashflowsInRange, cashflowAdjustedPoints, portfolioValueScale } from "./chartCashflows.js";

const RANGES = [
  ["1d", "1 Tag", 86_400_000], ["1w", "1 Woche", 604_800_000],
  ["1m", "1 Monat", 2_678_400_000], ["1y", "1 Jahr", 31_536_000_000],
  ["5y", "5 Jahre", 157_680_000_000],
  ["all", "Gesamt", Infinity]
];
const RETURN_LABELS = { "1d": "Rendite heute", "1w": "Rendite 1 Woche", "1m": "Rendite 1 Monat", "1y": "Rendite 1 Jahr", "5y": "Rendite 5 Jahre", all: "Rendite Gesamt" };

function money(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function percent(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function pointTime(value) {
  return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export default function PortfolioValueChart({ snapshots = [], currentValue, loadedAt, historyStartedAt, transactions = [], cashflowOverrides = {} }) {
  const [range, setRange] = useState("1d");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedCashflow, setSelectedCashflow] = useState(null);
  const points = useMemo(() => {
    const byTime = new Map();
    const startTime = new Date(historyStartedAt || loadedAt).getTime();
    for (const item of snapshots || []) {
      const time = new Date(item?.createdAt).getTime();
      const value = Number(item?.totalValue);
      if (Number.isFinite(time) && Number.isFinite(value) && time >= startTime) byTime.set(time, { time, value });
    }
    const currentTime = new Date(loadedAt).getTime();
    if (Number.isFinite(currentTime) && Number.isFinite(Number(currentValue))) {
      byTime.set(currentTime, { time: currentTime, value: Number(currentValue) });
    }
    return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  }, [snapshots, currentValue, loadedAt, historyStartedAt]);

  const cashflows = useMemo(() => buildChartCashflows(transactions, cashflowOverrides), [transactions, cashflowOverrides]);

  const visible = useMemo(() => {
    let selected;
    if (range === "1d" && points.length) {
      const midnight = new Date(points[points.length - 1].time);
      midnight.setHours(0, 0, 0, 0);
      const start = midnight.getTime();
      const today = points.filter(point => point.time >= start);
      const previous = points.filter(point => point.time <= start).at(-1);
      const baseline = previous || today[0];
      selected = baseline && today[0]?.time !== start ? [{ time: start, value: baseline.value, synthetic: true }, ...today] : today;
    } else {
      const duration = RANGES.find(item => item[0] === range)?.[2] ?? Infinity;
      if (!Number.isFinite(duration) || !points.length) selected = points;
      else {
        const threshold = points[points.length - 1].time - duration;
        selected = points.filter(point => point.time >= threshold);
      }
    }
    if (range === "1d" || selected.length < 3) return selected;
    const displayedDuration = selected.at(-1).time - selected[0].time;
    const interval = displayedDuration > 31 * 86_400_000 ? 86_400_000 : 15 * 60_000;
    return downsamplePoints(selected, interval, cashflows);
  }, [points, range, cashflows]);

  const availableRanges = useMemo(() => {
    const recordedDuration = points.length > 1 ? points.at(-1).time - points[0].time : 0;
    return RANGES.filter(([id, , duration]) => id === "1d" || id === "all" || recordedDuration >= duration);
  }, [points]);

  const adjusted = useMemo(() => cashflowAdjustedPoints(visible, cashflows), [visible, cashflows]);

  const visibleCashflows = useMemo(() => {
    if (!visible.length) return [];
    return cashflowsInRange(cashflows, visible[0].time, visible.at(-1).time);
  }, [visible, cashflows]);

  const newestPointTime = points[points.length - 1]?.time;
  useEffect(() => {
    setSelectedIndex(-1);
    setSelectedCashflow(null);
  }, [newestPointTime]);

  if (!visible.length) return null;

  const { minimumPoint, maximumPoint, scaleMin, scaleMax } = portfolioValueScale(adjusted);
  const span = scaleMax - scaleMin || 1;
  const timeSpan = lastTime(visible) - visible[0].time;
  const coordinates = adjusted.map(point => ({
    ...point,
    x: visible.length === 1 ? 500 : (point.time - visible[0].time) / timeSpan * 1000,
    y: 250 - (point.adjustedValue - scaleMin) / span * 210
  }));
  const first = visible[0];
  const last = visible[visible.length - 1];
  const change = adjusted.at(-1).adjustedValue - adjusted[0].adjustedValue;
  const changePercent = visible[0].value ? change / visible[0].value * 100 : null;
  const safeIndex = Math.max(0, Math.min(selectedIndex < 0 ? visible.length - 1 : selectedIndex, visible.length - 1));
  const selected = visible[safeIndex];
  const selectedPoint = coordinates[safeIndex];
  const line = coordinates.map(point => `${point.x},${point.y}`).join(" ");
  const cashflowMarkers = visibleCashflows.map(item => ({ ...item, ...coordinateAtTime(item.time, coordinates) }));
  function selectNearestPoint(event) {
    if (visible.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const targetX = Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000));
    let closest = 0;
    for (let index = 1; index < coordinates.length; index++) {
      if (Math.abs(coordinates[index].x - targetX) < Math.abs(coordinates[closest].x - targetX)) closest = index;
    }
    setSelectedCashflow(null);
    setSelectedIndex(closest);
  }

  return (
    <section className="table-card snapshot-card portfolio-value-card">
      <div className="section-heading portfolio-chart-heading">
        <div><span className="eyebrow">Gesamtwert inklusive Guthaben</span><h3>Portfolioverlauf</h3></div>
        <div className="portfolio-chart-change">
          <strong>{money(last.value)}</strong>
          <span>Aktueller Portfoliowert</span>
        </div>
      </div>
      <div className="portfolio-chart-toolbar">
        <div className="portfolio-range-buttons" aria-label="Zeitraum Portfolioverlauf">
          {availableRanges.map(([id, label]) => <button key={id} className={range === id ? "active" : ""} onClick={() => { setRange(id); setSelectedIndex(-1); setSelectedCashflow(null); }}>{label}</button>)}
        </div>
        <div className={`portfolio-period-performance ${change >= 0 ? "positive" : "negative"}`} title="Ein- und Auszahlungen sind nicht eingerechnet">
          <span>{RETURN_LABELS[range]}</span>
          <i aria-hidden="true">{change >= 0 ? "↗" : "↘"}</i>
          <strong>{changePercent == null ? "–" : `${change >= 0 ? "+" : ""}${percent(changePercent)}`}</strong>
          <small>{change >= 0 ? "+" : ""}{money(change)}</small>
        </div>
      </div>
      <div className="portfolio-chart-wrap">
        <div className="portfolio-chart-y-labels"><span title={`Portfoliowert am Kurvenhoch · ${pointTime(maximumPoint.time)}`}>{money(maximumPoint.value)}</span><span title={`Portfoliowert am Kurventief · ${pointTime(minimumPoint.time)}`}>{money(minimumPoint.value)}</span></div>
        <svg className="portfolio-value-chart" viewBox="0 0 1000 270" role="img" aria-label={`Cashflow-bereinigter Portfolioverlauf von ${money(first.value)} bis ${money(last.value)}`} preserveAspectRatio="none" onPointerMove={selectNearestPoint} onPointerDown={selectNearestPoint} onPointerLeave={() => { setSelectedIndex(-1); setSelectedCashflow(null); }}>
          <defs><linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={change < 0 ? "#ff6262" : "#00e08f"} stopOpacity="0.30" /><stop offset="100%" stopColor={change < 0 ? "#ff6262" : "#00e08f"} stopOpacity="0" /></linearGradient></defs>
          {[40, 110, 180, 250].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="portfolio-chart-gridline" />)}
          {visible.length > 1 && <polygon points={`0,250 ${line} 1000,250`} fill="url(#portfolioArea)" />}
          {visible.length > 1 ? <polyline points={line} className={`portfolio-chart-line ${change < 0 ? "negative-line" : "positive-line"}`} /> : <line x1="0" x2="1000" y1={coordinates[0].y} y2={coordinates[0].y} className={`portfolio-chart-line single ${change < 0 ? "negative-line" : "positive-line"}`} />}
          <line x1={selectedPoint.x} x2={selectedPoint.x} y1="35" y2="250" className="portfolio-chart-cursor" />
          <circle cx={selectedPoint.x} cy={selectedPoint.y} r="7" className={`portfolio-chart-dot ${change < 0 ? "negative" : "positive"}`} />
          {cashflowMarkers.map((item, index) => <circle key={`${item.id || "cashflow"}-${item.time}-${index}`} cx={item.x} cy={item.y} r="8" className={`portfolio-cashflow-dot ${item.signedAmount > 0 ? "deposit" : "withdrawal"}`} onPointerEnter={event => { event.stopPropagation(); setSelectedCashflow(item); }} onPointerMove={event => event.stopPropagation()} onPointerDown={event => { event.stopPropagation(); setSelectedCashflow(item); }} />)}
        </svg>
      </div>
      {selectedCashflow ? <div className={`portfolio-chart-selection cashflow-selection ${selectedCashflow.signedAmount > 0 ? "positive" : "negative"}`}><strong>{cashflowName(selectedCashflow.classification)} {selectedCashflow.signedAmount < 0 ? "−" : "+"}{money(selectedCashflow.value)}</strong><span>{pointTime(selectedCashflow.time)}</span></div> : <div className="portfolio-chart-selection"><strong>{money(selected.value)}</strong><span>Portfoliowert · {pointTime(selected.time)}</span></div>}
      {visible.length > 1 ? <input className="portfolio-chart-slider" type="range" min="0" max={visible.length - 1} value={safeIndex} onChange={event => setSelectedIndex(Number(event.target.value))} aria-label="Datenpunkt im Portfolioverlauf ansehen" /> : <p className="portfolio-chart-empty">Die Aufzeichnung beginnt mit diesem Stand. Nach den nächsten Aktualisierungen entsteht hier der Verlauf.</p>}
      <div className="portfolio-chart-axis"><span>{pointTime(first.time)}</span><span>{pointTime(last.time)}</span></div>
    </section>
  );
}

function lastTime(points) {
  return points[points.length - 1].time;
}

function downsamplePoints(points, interval, cashflows) {
  if (points.length < 3 || !Number.isFinite(interval) || interval <= 0) return points;
  const buckets = new Map();
  for (const point of points) buckets.set(Math.floor(point.time / interval), point);
  const adjusted = cashflowAdjustedPoints(points, cashflows);
  const required = [
    points[0],
    points.at(-1),
    points.reduce((lowest, point) => point.value < lowest.value ? point : lowest, points[0]),
    points.reduce((highest, point) => point.value > highest.value ? point : highest, points[0]),
    adjusted.reduce((lowest, point) => point.adjustedValue < lowest.adjustedValue ? point : lowest, adjusted[0]),
    adjusted.reduce((highest, point) => point.adjustedValue > highest.adjustedValue ? point : highest, adjusted[0])
  ];
  const byTime = new Map([...buckets.values(), ...required].map(point => [point.time, point]));
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function cashflowName(classification) {
  if (classification === "deposit") return "Einzahlung";
  if (classification === "refund") return "Rückerstattung";
  if (classification === "expense") return "Ausgabe";
  if (classification === "transfer") return "Transfer";
  return "Auszahlung";
}

function coordinateAtTime(time, coordinates) {
  if (coordinates.length === 1 || time <= coordinates[0].time) return { x: coordinates[0].x, y: coordinates[0].y };
  const nextIndex = coordinates.findIndex(point => point.time >= time);
  if (nextIndex < 0) return { x: coordinates.at(-1).x, y: coordinates.at(-1).y };
  const previous = coordinates[nextIndex - 1];
  const next = coordinates[nextIndex];
  const ratio = (time - previous.time) / (next.time - previous.time || 1);
  return { x: previous.x + (next.x - previous.x) * ratio, y: previous.y + (next.y - previous.y) * ratio };
}

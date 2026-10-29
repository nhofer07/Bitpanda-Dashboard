import { suspiciousPortfolioPoints } from "../../../backend/historical-portfolio-audit.js";
import { reconcilePortfolioHistory, comparePortfolioHistory, preferFinerPortfolioHistory } from "./reconcilePortfolioHistory.js";
import { portfolioHistoryCashflows } from "./portfolioHistoryCashflows.js";
import { API_PORTFOLIO_RANGES, usePortfolioHistory } from "./usePortfolioHistory.js";
import LoadingState from "./LoadingState.jsx";
import { formatCurrency as money, formatPercent as percent, formatDateTime as pointTime } from "./formatters.js";
import DataQuality from "./DataQuality.jsx";
import { useEffect, useMemo, useState } from "react";
import { buildChartCashflows, cashflowsInRange, cashflowAdjustedPoints, portfolioValueScale, portfolioPeriodResult, portfolioDisplayPoints } from "./chartCashflows.js";
import { portfolioChartPoints } from "./portfolioChartPoints.js";

const RANGES = [
  ["1d", "1 Tag", 86_400_000], ["1w", "1 Woche", 604_800_000],
  ["1m", "1 Monat", 2_678_400_000], ["6m", "6 Monate", 184 * 86_400_000], ["1y", "1 Jahr", 31_536_000_000],
  ["5y", "5 Jahre", 157_680_000_000],
  ["all", "Gespeichert", Infinity]
];
const RETURN_LABELS = { "1d": "Rendite heute", "1w": "Rendite 1 Woche", "1m": "Rendite 1 Monat", "1y": "Rendite 1 Jahr", "5y": "Rendite 5 Jahre", "6m": "Rendite 6 Monate", all: "Rendite Gesamt" };
const VALUE_MODE_STORAGE_KEY = "bitpanda-dashboard-portfolio-value-mode";




export default function PortfolioValueChart({ snapshots = [], currentValue, loadedAt, historyStartedAt, transactions = [], cashflowOverrides = {}, initialHistory }) {
  const [range, setRange] = useState("1d");
  const [uniformValue, setUniformValue] = useState(() => {
    try {
      return localStorage.getItem(VALUE_MODE_STORAGE_KEY) !== "actual";
    } catch {
      return true;
    }
  });
  const [showCashflows, setShowCashflows] = useState(false);
  const api = usePortfolioHistory(range, loadedAt, initialHistory);
  const comparisonRange = range === "1m" ? "6m" : range === "6m" ? "1m" : range === "1y" ? "6m" : null;
  const comparisonApi = usePortfolioHistory(comparisonRange, loadedAt);
  const [audit, setAudit] = useState(null);
  const [showUnverified, setShowUnverified] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedCashflow, setSelectedCashflow] = useState(null);
  useEffect(() => {
    try {
      localStorage.setItem(VALUE_MODE_STORAGE_KEY, uniformValue ? "adjusted" : "actual");
    } catch { /* Browser storage can be unavailable. */ }
  }, [uniformValue]);
  const localPoints = useMemo(() => portfolioChartPoints({ snapshots, currentValue, loadedAt, historyStartedAt }), [snapshots, currentValue, loadedAt, historyStartedAt]);

  const awaitingReference = range === "1y" && api.history && !comparisonApi.history && !comparisonApi.error;
  const awaitingApi = API_PORTFOLIO_RANGES.some(([id]) => id === range) && ((!api.history && !api.error) || awaitingReference);
  const usingApi = Boolean(!awaitingReference && api.history?.available && ['1d', '1w', '1m', '6m', '1y'].includes(range));
  const cashflows = useMemo(() => buildChartCashflows(transactions, cashflowOverrides), [transactions, cashflowOverrides]);
  const preferredResolution = useMemo(() => range === '1y' && api.history && comparisonApi.history
    ? preferFinerPortfolioHistory(api.history.snapshots.map(p => ({time: Date.parse(p.createdAt),value:p.totalValue})), comparisonApi.history.snapshots.map(p => ({time:Date.parse(p.createdAt),value:p.totalValue})), comparisonApi.history.loadedAt)
    : {points: api.history?.snapshots.map(p => ({time:Date.parse(p.createdAt),value:p.totalValue})) || [], references: []}, [range,api.history,comparisonApi.history]);
  const reconciliation = useMemo(() => usingApi
    ? reconcilePortfolioHistory(preferredResolution.points, localPoints, cashflows, api.history.loadedAt)
    : { points: awaitingApi ? [] : localPoints, corrections: [] }, [usingApi, awaitingApi, api.history, preferredResolution.points, localPoints, cashflows]);
  useEffect(() => {
    setShowUnverified(false);
    if (!usingApi || !['1y', '6m'].includes(range)) { setAudit(null); return; }
    let active = true, timer, attempts = 0; const controller = new AbortController();
    async function loadAudit() {
      try {
        const response = await fetch(`/api/portfolio-history-audit?range=${range}`, { signal: controller.signal }); const result = await response.json();
        if (!response.ok || !Array.isArray(result.checks)) throw new Error('Historischer Abgleich derzeit nicht verfügbar.');
        if (!active) return; setAudit({ ...result, range });
        if (result.pending && ++attempts < 30) timer = setTimeout(loadAudit, 4000);
      } catch (e) { if (active) setAudit({ range, checks: [], pending: false, error: e.message }); }
    }
    setAudit({ range, checks: [], pending: true }); void loadAudit();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [usingApi, range, api.history?.loadedAt]);
  const suspected = useMemo(() => usingApi ? suspiciousPortfolioPoints(reconciliation.points, cashflows).filter(p => !reconciliation.points.find(point => point.time === p.time)?.correction) : [], [usingApi, reconciliation.points, cashflows]);
  const reviews = suspected.map(p => ({ ...p, ...(audit?.range === range ? audit.checks.find(c => c.time === p.time) : null) }));
  const withheld = reviews.filter(p => p.status !== 'confirmed');
  const excludedTimes = new Set(showUnverified ? [] : withheld.map(p => p.time));
  let gap = false;
  const points = reconciliation.points.flatMap(point => { if (excludedTimes.has(point.time)) { gap = true; return []; } const kept = gap ? { ...point, gapBefore: true } : point; gap = false; return [kept]; });
  const historyComparison = useMemo(() => usingApi && comparisonApi.history
    ? comparePortfolioHistory(api.history.snapshots.map(point => ({ time: Date.parse(point.createdAt), value: point.totalValue })), comparisonApi.history.snapshots.map(point => ({ time: Date.parse(point.createdAt), value: point.totalValue })))
    : null, [usingApi, api.history, comparisonApi.history]);

  const visible = useMemo(() => {
    if (usingApi) return points;
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
  }, [points, range, cashflows, usingApi]);

  const availableRanges = useMemo(() => {
    const recordedDuration = localPoints.length > 1 ? localPoints.at(-1).time - localPoints[0].time : 0;
    return [...API_PORTFOLIO_RANGES, ...RANGES.filter(([id, , duration]) => (id === 'all' && localPoints.length > 0) || (id === '5y' && recordedDuration >= duration))];
  }, [localPoints]);
  const rangeButtons = <div className="portfolio-range-buttons" aria-label="Zeitraum Portfolioverlauf">
    {availableRanges.map(([id, label]) => <button key={id} className={range === id ? 'active' : ''} onClick={() => { setRange(id); if (id === "1y") setUniformValue(false); setSelectedIndex(-1); setSelectedCashflow(null); }}>{label}</button>)}
  </div>;

  const bucketFlows = useMemo(() => usingApi ? portfolioHistoryCashflows(visible, cashflows, api.history.loadedAt) : null, [usingApi, visible, cashflows, api.history?.loadedAt]);
  const calculationFlows = bucketFlows?.calculation || cashflows;
  const adjusted = useMemo(() => cashflowAdjustedPoints(visible, calculationFlows), [visible, calculationFlows]);

  const visibleCashflows = useMemo(() => {
    if (!visible.length) return [];
    return bucketFlows?.markers || cashflowsInRange(cashflows, visible[0].time, visible.at(-1).time);
  }, [visible, cashflows, bucketFlows]);

  const newestPointTime = points[points.length - 1]?.time;
  useEffect(() => {
    setSelectedIndex(-1);
    setSelectedCashflow(null);
  }, [newestPointTime, range, usingApi]);

  if (!visible.length) return <section className="table-card snapshot-card portfolio-value-card"><div className="section-heading"><h3>Portfolioentwicklung</h3></div>{rangeButtons}{api.loading || awaitingReference ? <div className="portfolio-chart-pending"><LoadingState compact>Bitpanda-Verlauf wird geladen …</LoadingState></div> : <div className="portfolio-history-status" role="status"><p>{api.error || 'Für diesen Zeitraum sind noch keine Portfolio-Messpunkte verfügbar.'}</p><button className="secondary-button" onClick={api.retry}>Erneut versuchen</button></div>}</section>;

  const displayPoints = portfolioDisplayPoints(adjusted, uniformValue);
  const { minimumPoint, maximumPoint, scaleMin, scaleMax } = portfolioValueScale(displayPoints);
  const span = scaleMax - scaleMin || 1;
  const timeSpan = lastTime(visible) - visible[0].time;
  const coordinates = displayPoints.map(point => ({
    ...point,
    x: visible.length === 1 ? 500 : (point.time - visible[0].time) / timeSpan * 1000,
    y: 250 - (point.adjustedValue - scaleMin) / span * 210
  }));
  const first = visible[0];
  const last = visible[visible.length - 1];
  const result = portfolioPeriodResult(visible, calculationFlows);
  const change = result.profit;
  const reportedPercent = usingApi && !reconciliation.corrections.length && !withheld.length && !preferredResolution.references.some(r => Math.abs(r.originalValue-r.referenceValue) > .01) ? api.history.reportedReturnPercent : null;
  const changePercent = reportedPercent ?? result.percent;
  const performancePositive = (changePercent ?? change) >= 0;
  const curveChange = displayPoints.at(-1).adjustedValue - displayPoints[0].adjustedValue;
  const safeIndex = Math.max(0, Math.min(selectedIndex < 0 ? visible.length - 1 : selectedIndex, visible.length - 1));
  const selected = visible[safeIndex];
  const displayedValue = point => point.adjustedValue;
  const valueLabel = uniformValue ? "Vergleichswert auf heutigem Kapitalstand" : "Portfoliowert";
  const selectedPoint = coordinates[safeIndex];
  const line = coordinates.map(point => `${point.x},${point.y}`).join(" ");
  const segments = []; for (const point of coordinates) { if (!segments.length || point.gapBefore) segments.push([]); segments.at(-1).push(point); }
  const cashflowMarkers = (showCashflows ? visibleCashflows : []).map(item => ({ ...item, ...coordinateAtTime(item.chartTime ?? item.time, coordinates) }));
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
        <div><span className="eyebrow">Gesamtwert inklusive Guthaben</span><h3>Portfolioentwicklung</h3></div>

      </div>
      <div className="portfolio-chart-toolbar">
        <div className="portfolio-chart-controls">{rangeButtons}<div className="portfolio-display-buttons">
          <button type="button" aria-pressed={!uniformValue} className={!uniformValue ? "active" : ""} title="Die tatsächlichen damaligen Eurobeträge anzeigen" onClick={() => { setUniformValue(value => !value); setSelectedCashflow(null); }}>Tatsächliche Werte anzeigen</button>
          <button type="button" aria-pressed={showCashflows} className={showCashflows ? "active" : ""} onClick={() => { setShowCashflows(value => !value); setSelectedCashflow(null); }}>{showCashflows ? 'Buchungen ausblenden' : 'Buchungen anzeigen'}</button>
        </div></div>
        <div className={`portfolio-period-performance ${performancePositive ? "positive" : "negative"}`} title={reportedPercent != null ? "Die Prozent-Rendite stammt von Bitpanda. Das Euro-Ergebnis wird nach deiner Cashflow-Zuordnung bereinigt." : result.hasCashflows ? "Ergebnis nach Abzug der Zahlungsbewegungen. Ohne Bewertungen direkt vor jeder Buchung ist keine verlässliche zeitgewichtete Prozent-Rendite verfügbar." : "Wertentwicklung ohne Zahlungsbewegungen im gewählten Zeitraum"}>
          <span>{reportedPercent != null ? "Rendite · Bitpanda" : result.hasCashflows ? "Ergebnis bereinigt" : usingApi && range === "1d" ? "Rendite 24 Stunden" : RETURN_LABELS[range]}</span>
          <i aria-hidden="true">{performancePositive ? "↗" : "↘"}</i>
          {changePercent != null && <strong>{`${changePercent >= 0 ? "+" : ""}${percent(changePercent)}`}</strong>}
          <small className={change >= 0 ? "positive" : "negative"}>{result.hasCashflows || reportedPercent != null ? "Bereinigt " : ""}{change >= 0 ? "+" : ""}{money(change)}</small>
        </div>
      </div>
      <div className="chart-context"><DataQuality kind={usingApi ? api.history.stale ? "stale" : "reported" : "calculated"}>{usingApi ? api.history.stale ? "Bitpanda · letzter Abruf" : "Bitpanda" : "Gespeicherter Verlauf"}</DataQuality><span className="portfolio-mode-label">{uniformValue ? "Vergleich auf heutigem Kapitalstand" : "Tatsächliche Werte"}</span><details><summary>Darstellung & Berechnung</summary><p>{uniformValue ? "Ein-/Auszahlungen bereinigt: Frühere Werte inklusive Hoch und Tief sind auf den heutigen Kapitalstand angepasst." : "Tatsächliche Werte: Kurve, Skala sowie Hoch und Tief zeigen die damaligen Eurobeträge inklusive Ein- und Auszahlungen."}</p>{reportedPercent != null && <p>Die Prozent-Rendite wird unverändert von Bitpanda übernommen. Das Euro-Ergebnis und die bereinigte Kurve verwenden die Ein-/Auszahlungen und Buchungszuordnungen deines Dashboards; diese Berechnung kann von Bitpandas Rendite abweichen.</p>}{usingApi && <p>Original-Messpunkte von Bitpanda · letzter Zeitabschnitt: {pointTime(api.history.lastPointAt)}. Buchungen werden ihrem Bitpanda-Zeitabschnitt zugeordnet; die angezeigte Buchungszeit bleibt unverändert. Der letzte Messpunkt kann zeitlich hinter dem aktuellen Kontostand liegen.</p>}{!usingApi && <p>Dieser Verlauf stammt aus den gespeicherten Kontoständen des Dashboards.</p>}{result.hasCashflows && reportedPercent == null && <p>Prozent-Rendite nicht verfügbar: Für Zahlungsbewegungen fehlen Bewertungen unmittelbar vor der Buchung. Das bereinigte Ergebnis in Euro bleibt sichtbar.</p>}</details></div>
      {api.loading && range !== 'all' && <p className="source-note" role="status">Bitpanda-Verlauf wird aktualisiert …</p>}
      {(api.error || (usingApi && api.history.stale)) && range !== 'all' && <div className="portfolio-history-status" role="status"><span>{usingApi ? 'Der Bitpanda-Verlauf konnte nicht aktuell geladen werden. Angezeigt wird der letzte verfügbare Stand.' : 'Bitpanda-Verlauf nicht verfügbar. Angezeigt werden gespeicherte Kontostände.'}</span><button className="secondary-button" onClick={api.retry}>Erneut versuchen</button></div>}

      <div className="portfolio-chart-wrap">
        <div className="portfolio-chart-y-labels"><span title={`${valueLabel} am Kurvenhoch · ${pointTime(maximumPoint.time)}`}>{money(displayedValue(maximumPoint))}</span><span title={`${valueLabel} am Kurventief · ${pointTime(minimumPoint.time)}`}>{money(displayedValue(minimumPoint))}</span></div>
        <svg className="portfolio-value-chart" viewBox="0 0 1000 270" role="img" aria-label={`${uniformValue ? "Bereinigter" : "Tatsächlicher"} Portfolioverlauf von ${money(displayedValue(displayPoints[0]))} bis ${money(displayedValue(displayPoints.at(-1)))}`} preserveAspectRatio="none" onPointerMove={selectNearestPoint} onPointerDown={selectNearestPoint} onPointerLeave={() => { setSelectedIndex(-1); setSelectedCashflow(null); }}>
          <defs><linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={curveChange < 0 ? "#ff6262" : "#00e08f"} stopOpacity="0.30" /><stop offset="100%" stopColor={curveChange < 0 ? "#ff6262" : "#00e08f"} stopOpacity="0" /></linearGradient></defs>
          {[40, 110, 180, 250].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="portfolio-chart-gridline" />)}
          {visible.length > 1 && segments.length === 1 && <polygon points={`0,250 ${line} 1000,250`} fill="url(#portfolioArea)" />}
          {visible.length > 1 ? segments.map((segment, index) => segment.length > 1 ? <polyline key={index} points={segment.map(p => `${p.x},${p.y}`).join(" ")} className={`portfolio-chart-line ${curveChange < 0 ? "negative-line" : "positive-line"}`} /> : <circle key={index} cx={segment[0].x} cy={segment[0].y} r="3" className="portfolio-chart-dot" />) : <line x1="0" x2="1000" y1={coordinates[0].y} y2={coordinates[0].y} className={`portfolio-chart-line single ${curveChange < 0 ? "negative-line" : "positive-line"}`} />}
          {segments.slice(1).map((segment,index) => { const a=segments[index].at(-1),b=segment[0]; return <line key={`gap-${index}`} x1={a.x} x2={b.x} y1={a.y} y2={b.y} className="portfolio-chart-gap" />; })}
          <line x1={selectedPoint.x} x2={selectedPoint.x} y1="35" y2="250" className="portfolio-chart-cursor" />
          <circle cx={selectedPoint.x} cy={selectedPoint.y} r="7" className={`portfolio-chart-dot ${curveChange < 0 ? "negative" : "positive"}`} />
          {cashflowMarkers.map((item, index) => <circle key={`${item.id || "cashflow"}-${item.time}-${index}`} cx={item.x} cy={item.y} r="8" className={`portfolio-cashflow-dot ${item.signedAmount > 0 ? "deposit" : "withdrawal"}`} tabIndex="0" role="button" aria-label={`${cashflowName(item.classification)} ${money(item.value)} · ${pointTime(item.time)}`} onFocus={() => setSelectedCashflow(item)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelectedCashflow(item); } }} onPointerEnter={event => { event.stopPropagation(); setSelectedCashflow(item); }} onPointerMove={event => event.stopPropagation()} onPointerDown={event => { event.stopPropagation(); setSelectedCashflow(item); }} />)}
        </svg>
      </div>
      {selectedCashflow ? <div className={`portfolio-chart-selection cashflow-selection ${selectedCashflow.signedAmount > 0 ? "positive" : "negative"}`}><strong>{cashflowName(selectedCashflow.classification)} {selectedCashflow.signedAmount < 0 ? "−" : "+"}{money(selectedCashflow.value)}</strong><span>{pointTime(selectedCashflow.time)}</span></div> : <div className="portfolio-chart-selection"><strong>{money(displayedValue(displayPoints[safeIndex]))}</strong><span>{selected.resolutionReference ? `${valueLabel} · Tages-Schlusswert aus 6 Monaten (Jahres-Original: ${money(selected.resolutionReference.originalValue)})` : selected.correction ? `${valueLabel} · mit gespeichertem Kontostand korrigiert (Original: ${money(selected.correction.originalValue)})` : selected.reconstructed ? `${valueLabel} · rekonstruiert (geschätzt)` : valueLabel} · {pointTime(selected.time)}</span></div>}
      {segments.length > 1 && <p className="source-note portfolio-gap-legend">Gestrichelt: Verbindung über ausgelassene, unbestätigte Messpunkte. Dafür werden keine Zwischenwerte berechnet.</p>}
      {visible.length > 1 ? <input className="portfolio-chart-slider" type="range" min="0" max={visible.length - 1} value={safeIndex} onChange={event => setSelectedIndex(Number(event.target.value))} aria-label="Datenpunkt im Portfolioverlauf ansehen" /> : <p className="portfolio-chart-empty">Die Aufzeichnung beginnt mit diesem Stand. Nach den nächsten Aktualisierungen entsteht hier der Verlauf.</p>}
      <div className="portfolio-chart-axis"><span>{pointTime(first.time)}</span><span>{pointTime(last.time)}</span></div>
      {visibleCashflows.length > 0 && <details className="portfolio-cashflow-list"><summary>Ein- & Auszahlungen · {visibleCashflows.length} {visibleCashflows.length === 1 ? "Buchung" : "Buchungen"}</summary><ul>{visibleCashflows.map((flow, index) => <li key={`${flow.id}-${index}`}><button type="button" className="portfolio-cashflow-entry" onClick={() => setSelectedCashflow(flow)}><span>{cashflowName(flow.classification)}<small>{pointTime(flow.time)}</small></span><strong className={flow.signedAmount > 0 ? 'positive' : 'negative'}>{flow.signedAmount > 0 ? '+' : '−'}{money(flow.value)}</strong></button></li>)}</ul></details>}
      {reconciliation.corrections.length > 0 && <details className="source-note portfolio-history-corrections"><summary>{reconciliation.corrections.length} {reconciliation.corrections.length === 1 ? "Bitpanda-Messpunkt mit gespeicherten Kontoständen korrigiert" : "Bitpanda-Messpunkte mit gespeicherten Kontoständen korrigiert"}</summary><p>Isolierte Abweichungen wurden durch zeitlich passende, übereinstimmende Kontostände ersetzt. Die Bitpanda-Prozentrendite wird für diesen Verlauf nicht übernommen. Originaldaten bleiben erhalten.</p><ul>{reconciliation.corrections.map(item => <li key={item.time}>{pointTime(item.time)} · Original: {money(item.originalValue)} → Kontostand: {money(item.referenceValue)} vom {pointTime(item.referenceTime)}</li>)}</ul></details>}
      {withheld.length > 0 && <details className="source-note portfolio-history-audit"><summary>{withheld.length} auffällige {withheld.length === 1 ? "Einzelspitze" : "Einzelspitzen"} {showUnverified ? "im Original eingeblendet" : "bis zur Bestätigung ausgeblendet"}{audit?.range === range && audit.pending ? " · Bestandsabgleich läuft …" : ""}</summary><p>Isolierte große Sprünge werden auf historische Wallet-Bestände und verfügbare EUR-Schlusskurse geprüft. Ausgeblendete Zeitabschnitte bleiben als Lücke erhalten; es werden keine Ersatzwerte erfunden. Ein Verdacht allein beweist keinen Datenfehler. Vergleichswerte sind historische Schätzungen, keine damaligen Ausführungspreise.</p><ul>{withheld.map(item => <li key={item.time}>{pointTime(item.time)} · Bitpanda: {money(item.originalValue)}{item.reconstructedValue != null ? ` · Buchungsbestände × historische Kurse: ca. ${money(item.reconstructedValue)}` : item.partialValue > 0 ? ` · Bewerteter Teilbestand: ca. ${money(item.partialValue)} (unvollständig)` : ''} · {item.reason || audit?.error || (audit?.pending ? 'Historische Prüfung noch nicht abgeschlossen.' : 'Keine ausreichenden unabhängigen Daten für eine Bestätigung.')}</li>)}</ul><button className="secondary-button" onClick={() => setShowUnverified(v => !v)}>{showUnverified ? "Auffällige Originalpunkte ausblenden" : "Auffällige Originalpunkte trotzdem anzeigen"}</button></details>}
      {usingApi && comparisonRange && <details className="source-note portfolio-history-comparison"><summary>{historyComparison ? preferredResolution.references.length > 0 ? `${preferredResolution.references.length} Tages-Schlusswerte aus 6 Monaten verwendet · ${historyComparison.discrepancies.length} Abweichungen im Jahres-Original` : `${historyComparison.discrepancies.length} Abweichungen beim Vergleich mit ${comparisonRange === "6m" ? "6 Monaten" : "1 Monat"} · ${historyComparison.compared} gemeinsame Schlusswerte` : comparisonApi.error ? "Vergleich der Zeiträume derzeit nicht verfügbar" : "Vergleich der Zeiträume wird geladen …"}</summary><p>{preferredResolution.references.length > 0 && `Im Jahreschart werden für ${preferredResolution.references.length} gemeinsame Schlusszeitpunkte die höher aufgelösten Tageswerte des Sechsmonatsverlaufs verwendet. Die Jahres-Originalwerte bleiben hier zum Vergleich erhalten. `}Verglichen werden nur Messpunkte mit demselben Schlusszeitpunkt. Spitzen innerhalb eines Tages sind durch einen Tageswert allein weder bestätigt noch widerlegt. Abweichende Originalwerte bleiben erhalten; ein automatischer Ersatz benötigt passende gespeicherte Kontostände.</p>{comparisonApi.history?.stale && <p>Der Vergleich verwendet den letzten verfügbaren Abruf.</p>}{historyComparison?.discrepancies.length > 0 && <ul>{historyComparison.discrepancies.map(item => <li key={item.time}>Schlusszeit {pointTime(item.closeTime)} · Dieser Zeitraum: {money(item.value)} · Vergleich: {money(item.comparisonValue)}</li>)}</ul>}</details>}
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

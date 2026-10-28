import AdaptiveTable from "./AdaptiveTable.jsx";
import DataNote from "./DataNote.jsx";
import PageIntro from "./PageIntro.jsx";
import LoadingState from "./LoadingState.jsx";
import { useMemo, useState } from "react";
import "./performanceCalendar.css";
import { buildPortfolioDays, buildSalesDays, calendarDate, monthCells } from "./performanceCalendar.js";

const money = value => `${Number(value).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signedMoney = value => `${value > 0 ? "+" : ""}${money(value)}`;
const percent = value => value == null ? "–" : `${value > 0 ? "+" : ""}${value.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const dateLabel = key => new Date(`${key}T12:00:00Z`).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Vienna" });
const timeLabel = time => new Date(time).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna" });
const tone = value => value == null || Math.abs(value) < .005 ? "neutral" : value > 0 ? "positive" : "negative";

export default function PerformanceCalendar({ data, loading, error, cashflowOverrides = {} }) {
  const today = calendarDate(Date.now());
  const [mode, setMode] = useState("portfolio");
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const portfolioDays = useMemo(() => buildPortfolioDays({ snapshots: data?.snapshots, currentValue: data?.portfolioHistoryWarning ? undefined : data?.portfolio?.totalValue, loadedAt: data?.loadedAt, historyStartedAt: data?.portfolioHistoryStartedAt, transactions: data?.transactions, cashflowOverrides }), [data, cashflowOverrides]);
  const salesDays = useMemo(() => buildSalesDays(data?.profitLoss?.assets), [data?.profitLoss?.assets]);
  const days = mode === "portfolio" ? portfolioDays : salesDays;
  const rows = [...days.values()].filter(day => day.key.startsWith(month));
  const measured = rows.filter(day => day.gain != null);
  const total = measured.reduce((sum, day) => sum + day.gain, 0);
  const selected = days.get(selectedDay);
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  const firstRecorded = [...portfolioDays.keys()][0];
  function changeMonth(value) { if (!/^\d{4}-\d{2}$/.test(value)) return; setMonth(value); setSelectedDay(null); }
  function moveMonth(offset) {
    const [year, number] = month.split("-").map(Number);
    changeMonth(new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7));
  }
  if (loading) return <LoadingState>Kalender wird geladen …</LoadingState>;
  if (error) return <div className="error-box">{error}</div>;

  return <div className="performance-calendar">
    <PageIntro>
      <div><p>Grüne Tage zeigen Gewinne, rote Tage Verluste. Wähle einen Tag für die Details.</p></div>
      <div className="segmented-control" aria-label="Kalenderansicht">
        <button className={mode === "portfolio" ? "active" : ""} aria-pressed={mode === "portfolio"} onClick={() => setMode("portfolio")}>Portfolioentwicklung</button>
        <button className={mode === "sales" ? "active" : ""} aria-pressed={mode === "sales"} onClick={() => setMode("sales")}>Verkäufe · Netto</button>
      </div>
    </PageIntro>
    <DataNote title="Berechnung der Tageswerte">{mode === "portfolio" ? "Tägliche Portfolioentwicklung inklusive Guthaben, bereinigt um Ein- und Auszahlungen sowie andere zugeordnete Cashflows. Verkaufserlöse werden nicht als zusätzlicher Gewinn gezählt." : "Netto-Gewinn oder -Verlust aus Verkäufen nach Kauf- und Verkaufsgebühren sowie KESt. Tage ohne Verkäufe bleiben neutral."}</DataNote>
    <section className="table-card calendar-card">
      <div className="section-heading calendar-heading">
        <div><span className="eyebrow">{mode === "portfolio" ? "Portfolioentwicklung" : "Realisierte Verkaufsergebnisse"}</span><h3>{monthLabel}</h3></div>
        <div className="calendar-month-controls">
          <button className="secondary-button" aria-label="Vorheriger Monat" onClick={() => moveMonth(-1)}>‹</button>
          <input className="cashflow-select" type="month" aria-label="Kalendermonat" value={month} max={today.slice(0, 7)} onChange={event => changeMonth(event.target.value)} />
          <button className="secondary-button" aria-label="Nächster Monat" disabled={month >= today.slice(0, 7)} onClick={() => moveMonth(1)}>›</button>
          <button className="secondary-button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>Heute</button>
        </div>
      </div>
      <div className="calendar-month-summary">
        <span><small>{mode === "portfolio" ? "Ergebnis der erfassten Tage" : "Netto-Verkaufsergebnis"}</small><strong className={tone(measured.length ? total : null)}>{measured.length ? signedMoney(total) : "–"}</strong></span>
        <span><small>Gewinntage</small><strong className="positive">{measured.filter(day => tone(day.gain) === "positive").length}</strong></span>
        <span><small>Verlusttage</small><strong className="negative">{measured.filter(day => tone(day.gain) === "negative").length}</strong></span>
        {mode === "sales" && <span><small>Verkäufe</small><strong>{rows.reduce((sum, day) => sum + day.count, 0)}</strong></span>}
      </div>
      <div className="calendar-grid" aria-label={`${monthLabel} · ${mode === "portfolio" ? "Portfolioentwicklung" : "Verkäufe"}`}>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(label => <span className="calendar-weekday" key={label}>{label}</span>)}
        {monthCells(month).map((key, index) => {
          if (!key) return <div className="calendar-spacer" key={`space-${index}`} />;
          const day = days.get(key);
          const dayTone = tone(day?.gain);
          const future = key > today;
          const result = day?.gain != null ? signedMoney(day.gain) : mode === "sales" && !day ? "Keine Verkäufe" : "Keine Tagesdaten";
          return <button key={key} className={`calendar-day calendar-day-${dayTone}${key === selectedDay ? " selected" : ""}${key === today ? " today" : ""}`} aria-label={`${dateLabel(key)}: ${future ? "Zukünftiger Tag" : result}`} aria-pressed={key === selectedDay} disabled={future} onClick={() => setSelectedDay(key)}>
            <span className="calendar-day-number">{Number(key.slice(-2))}{key === today && <i aria-hidden="true" />}</span>
            <strong className="calendar-full-value">{day?.gain != null ? signedMoney(day.gain) : "–"}</strong>
            <strong className="calendar-compact-value" aria-hidden="true">{day?.gain == null ? "–" : `${day.gain > 0 ? "+" : ""}${new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 0 }).format(day.gain)}`}</strong>
            <small>{day ? mode === "sales" ? `${day.count} ${day.count === 1 ? "Verkauf" : "Verkäufe"}` : day.gain == null ? "Unvollständig" : percent(day.percent) : ""}</small>
            {mode === "portfolio" && day?.partial && day.gain != null && <small className="calendar-partial">Teilzeitraum</small>}
          </button>;
        })}
      </div>
      <p className="calendar-mobile-hint">Tageswerte in Euro · gerundet. Wähle einen Tag für genaue Beträge und Details.</p>
      <div className="calendar-legend"><span><i className="positive" />Gewinn</span><span><i className="negative" />Verlust</span><span><i className="neutral" />{mode === "sales" ? "Keine Verkäufe oder ausgeglichen" : "Ausgeglichen oder keine Daten"}</span></div>
      {mode === "portfolio" && <p className="calendar-note">{firstRecorded ? `Portfolioaufzeichnung ab ${dateLabel(firstRecorded)}. ` : "Noch keine Portfolioaufzeichnung vorhanden. "}Fehlende Tage werden nicht rückwirkend geschätzt. Bei einem Teilzeitraum beginnt die Berechnung mit dem ersten verfügbaren Tagesstand.</p>}
      {mode === "sales" && <p className="calendar-note">Manuell ergänzte Finanzierungsgebühren werden hier nicht einzelnen Verkaufstagen zugeordnet.</p>}
    </section>
    {selectedDay && <section className="table-card calendar-details">
      <div className="section-heading"><div><span className="eyebrow">{mode === "portfolio" ? "Portfolioentwicklung" : "Verkäufe · Netto"}</span><h3>{dateLabel(selectedDay)}</h3></div><strong className={tone(selected?.gain)}>{selected?.gain != null ? signedMoney(selected.gain) : "–"}</strong></div>
      {mode === "portfolio" ? selected ? <div className="calendar-detail-content">
        <div className="detail-row"><span>Tagesentwicklung</span><strong className={tone(selected.gain)}>{selected.gain != null ? `${signedMoney(selected.gain)} · ${percent(selected.percent)}` : "Noch kein Vergleichswert"}</strong></div>
        <div className="detail-row"><span>Ausgangswert · {timeLabel(selected.first.time)}</span><strong>{money(selected.first.value)}</strong></div>
        <div className="detail-row"><span>Letzter Wert · {timeLabel(selected.last.time)}</span><strong>{money(selected.last.value)}</strong></div>
        <div className="detail-row"><span>Herausgerechneter Netto-Cashflow</span><strong>{signedMoney(selected.cashflow)}</strong></div>
        {selected.partial && <p className="source-note">Für den Tagesbeginn fehlt ein Vergleichsstand. Angezeigt wird die Entwicklung im erfassten Teilzeitraum.</p>}
      </div> : <p className="calendar-detail-content muted">Für diesen Tag liegen keine Portfolioaufzeichnungen vor.</p> : selected ? <>
        {selected.missing > 0 && <p className="calendar-detail-content muted">Für {selected.missing} Verkäufe fehlt ein Ergebnis. Dieser Tag bleibt neutral, bis vollständige Daten vorliegen.</p>}
        <div className="calendar-trades-scroll"><AdaptiveTable className="clean-table compact"><thead><tr><th>Asset</th><th>Uhrzeit</th><th>Menge</th><th>Verkaufserlös</th><th>Netto G/V</th></tr></thead><tbody>{selected.trades.map((trade, index) => <tr key={`${trade.assetKey}-${trade.id || index}`}><td>{trade.assetName}<small className="asset-cell-note">{trade.assetKey}</small></td><td>{new Date(trade.time.date_iso8601).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna" })}</td><td>{Number(trade.quantity || 0).toLocaleString("de-AT", { maximumFractionDigits: 8 })}</td><td>{money(trade.fiat || 0)}</td><td className={tone(trade.realizedProfit)}>{trade.realizedProfit == null ? "–" : signedMoney(Number(trade.realizedProfit))}</td></tr>)}</tbody></AdaptiveTable></div>
      </> : <p className="calendar-detail-content muted">An diesem Tag gab es keine Verkäufe.</p>}
    </section>}
  </div>;
}

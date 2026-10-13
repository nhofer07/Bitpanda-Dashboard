import { useEffect, useState } from "react";
import { SourceTaxPanel } from "./AccountDataComponents.jsx";
import { paidTaxRecords } from "./paidTaxDetails.js";

const eur = value => `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const date = value => new Date(value).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "medium", timeStyle: "short" });
const kinds = { withholding: "Steuerabzug", refund: "Steuererstattung / Storno", settlement: "Nachforderung bezahlt" };

export default function TaxCockpitView({ onSelectAsset }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRefunded, setShowRefunded] = useState(false);
  const [category, setCategory] = useState("sales");

  useEffect(() => {
    fetch("/api/dashboard-data")
      .then(response => response.json().then(result => {
        if (!response.ok) throw new Error(result.error || "Steuerdaten konnten nicht geladen werden");
        return result;
      }))
      .then(setDashboard)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Lade Steuerbuchungen...</div>;
  if (error) return <div className="error-box">{error}</div>;
  const tax = dashboard?.paidTax;
  if (!tax?.available) return <div className="error-box">{tax?.error || "Bezahlte KESt ist für diesen Datenstand noch nicht verfügbar. Bitte Dashboard aktualisieren."}</div>;

  return <div className="tax-view">
    <section className="hero-card">
      <div><div className="eyebrow">Steuern</div><h2>Deine bereits bezahlte KESt</h2><p>Tatsächlich gebuchte Steuer auf Verkäufe und Positionsschließungen, abzüglich Erstattungen und einschließlich bezahlter Nachforderungen. Dividenden-KESt wird separat gezeigt.</p></div>
      <div className="hero-status"><span>Bezahlte KESt aus Verkäufen · gesamt</span><strong>{eur(tax.salesPaid)}</strong><small>Alle geladenen Jahre · nach Erstattungen</small></div>
    </section>
    <section className="table-card tax-overview-card">
      <div className="section-heading"><h3>Jahresübersicht</h3><span>Gebuchte Zahlungen</span></div>
      <div className="tax-table-scroll"><table className="clean-table tax-overview-table"><thead><tr><th>Jahr</th><th>Bezahlte KESt aus Verkäufen</th><th>Dividenden-KESt</th><th>Sonstige KESt</th><th>KESt gesamt</th><th>Buchungen</th></tr></thead><tbody>
        {tax.yearly.map(year => <tr key={year.period}><td><strong>{year.period}</strong></td><td>{eur(year.salesPaid)}</td><td>{eur(year.dividendsPaid)}</td><td>{eur(year.otherPaid)}</td><td className="strong">{eur(year.totalPaid)}</td><td>{year.withheld === 0 && year.refunded === 0 && year.settlements === 0 ? "Keine KESt-Buchungen gefunden" : "Abzüge und Erstattungen verfügbar"}</td></tr>)}
      </tbody></table></div>
      {!tax.yearly.length && <p className="category-empty">Keine KESt-Zahlungen in der geladenen Historie gefunden.</p>}
      <p className="muted tax-note">0,00 € ohne Steuerbuchungen bedeutet: In der geladenen API-Historie wurde für dieses Jahr kein KESt-Abzug gefunden. Eine mögliche selbst zu zahlende Steuer wird hier nicht berechnet. Erstattungen werden am Buchungsdatum berücksichtigt. Handels- und Finanzierungsgebühren sowie Quellensteuer gehören nicht zu diesen KESt-Beträgen.</p>
    </section>
    <section className="table-card tax-bookings-card">
      <div className="section-heading"><h3>Für was und wann wurde KESt bezahlt?</h3></div>
      <div className="tax-detail-controls"><label>Steuerart <select value={category} onChange={event => setCategory(event.target.value)}><option value="sales">Verkäufe und Positionsschließungen</option><option value="dividends">Dividenden</option><option value="other">Sonstige KESt</option></select></label><label><input type="checkbox" checked={showRefunded} onChange={event => setShowRefunded(event.target.checked)} /> Vollständig erstattete Buchungen anzeigen</label></div>
      {tax.yearly.map(year => {
        const allRecords = paidTaxRecords(tax.events, year.period, category);
        const records = allRecords.filter(record => showRefunded || record.paid !== 0);
        return <details className="tax-year-details" key={`${year.period}-${category}`}>
          <summary><span>{year.period} · {records.length} Buchungen</span><strong>{eur(year[category === "sales" ? "salesPaid" : category === "dividends" ? "dividendsPaid" : "otherPaid"])}</strong></summary>
          {!records.length && <p className="category-empty">Keine verbleibenden Zahlungen für diese Auswahl.</p>}
          {records.map(record => <details className="tax-payment-details" key={record.id}>
            <summary><span><strong>{record.asset}</strong><small>{record.reason && `${record.reason} · `}{date(record.date)}</small></span><strong className={record.paid < 0 ? "positive" : record.paid > 0 ? "negative" : "muted"}>{record.paid < 0 ? "Erstattung " : "Bezahlt "}{eur(Math.abs(record.paid))}</strong></summary>
            <div className="tax-table-scroll"><table className="clean-table"><thead><tr><th>Datum</th><th>Buchung</th><th>Steuerzahlung</th></tr></thead><tbody>{record.events.map(event => <tr key={event.id}><td>{date(event.date)}</td><td>{kinds[event.kind]}</td><td className={event.amount < 0 ? "positive" : "negative"}>{eur(event.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan="2"><strong>Nach Erstattungen</strong></td><td><strong>{eur(record.paid)}</strong></td></tr></tfoot></table></div>
          </details>)}
        </details>;
      })}
    </section>
    <SourceTaxPanel insights={dashboard.accountInsights} onSelectAsset={onSelectAsset} />
  </div>;
}

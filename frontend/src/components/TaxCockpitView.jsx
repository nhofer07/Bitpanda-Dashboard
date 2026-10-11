import { useEffect, useMemo, useState } from "react";

const TAX_RATE = 0.275;
const eur = value => `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function TaxCockpitView() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const years = useMemo(() => {
    const profits = new Map((dashboard?.profitLoss?.yearly || []).map(item => [item.period, item]));
    const fiat = new Map((dashboard?.fiat?.yearly || []).map(item => [item.period, item]));
    return [...new Set([...profits.keys(), ...fiat.keys()])].sort((a, b) => String(b).localeCompare(String(a))).map(year => {
      const profit = profits.get(year) || {};
      const dividends = fiat.get(year) || {};
      const realizedBeforeTax = Number(profit.grossRealizedProfit || 0) - Number(profit.tradingFees || 0);
      // The backend calculates tax per profitable sale. Summing only the annual
      // net result would incorrectly turn taxable gains into 0 € after losses.
      const capitalGainsTax = Math.max(0, Number(profit.estimatedTax || 0));
      const dividendGross = Number(dividends.dividendGross || 0);
      const withholdingTax = Math.abs(Number(dividends.dividendTax || 0));
      const dividendTaxEstimate = Math.max(0, dividendGross * TAX_RATE - withholdingTax);
      return { year, realizedBeforeTax, capitalGainsTax, dividendGross, withholdingTax, dividendTaxEstimate, estimate: capitalGainsTax + dividendTaxEstimate };
    });
  }, [dashboard]);
  const current = years[0] || null;

  if (loading) return <div className="loading-state">Lade Steuer-Cockpit...</div>;
  if (error) return <div className="error-box">{error}</div>;

  return <div>
    <section className="hero-card"><div><div className="eyebrow">Steuer-Cockpit</div><h2>Orientierung für deine Veranlagung</h2><p>Die Rechnung übernimmt eine von Bitpanda im Trade ausgewiesene Steuer, falls vorhanden. Fehlt sie, werden 27,5 % auf jeden positiven realisierten Verkauf nach Gebühren geschätzt. Quellensteuer aus Dividenden wird gegengerechnet. Keine Steuerberatung.</p></div><div className="hero-status"><span>Schätzung {current?.year || "-"}</span><strong>{eur(current?.estimate)}</strong><small>Ohne Verlustverrechnung über externe Depots</small></div></section>
    <div className="info-box"><strong>Wichtig:</strong> Das ist kein Steuerreport. Die Ansicht verrechnet Verluste nicht automatisch mit positiven Einzelverkäufen und berücksichtigt keine externen Depots, Verlusttöpfe oder Sonderfälle. Prüfe vor einer Erklärung immer den offiziellen Bitpanda-Steuerreport und Jahresdokumente.</div>
    <section className="table-card tax-overview-card"><div className="section-heading"><h3>Jahresübersicht</h3><span>27,5 % KESt-Annahme</span></div><table className="clean-table tax-overview-table"><thead><tr><th>Jahr</th><th>Realisierte Basis</th><th>KESt aus Verkäufen</th><th>Dividenden brutto</th><th>Quellensteuer</th><th>Zusätzliche Dividenden-KESt</th><th>Schätzung</th></tr></thead><tbody>{years.map(item => <tr key={item.year}><td><strong>{item.year}</strong></td><td>{eur(item.realizedBeforeTax)}</td><td className="negative">{eur(item.capitalGainsTax)}</td><td className="positive">{eur(item.dividendGross)}</td><td className="negative">{eur(item.withholdingTax)}</td><td className="negative">{eur(item.dividendTaxEstimate)}</td><td className="negative strong">{eur(item.estimate)}</td></tr>)}</tbody></table>{years.length === 0 && <p className="category-empty">Noch keine steuerlich relevanten Buchungen gefunden.</p>}</section>
  </div>;
}

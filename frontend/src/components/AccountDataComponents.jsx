import AdaptiveTable from "./AdaptiveTable.jsx";
import { formatCurrency as money, formatNumber as quantity, formatDateTime as when } from "./formatters.js";
import { useState } from "react";

export { formatCurrency as money, formatNumber as quantity, formatDateTime as when } from "./formatters.js";
export const native = (value, symbol) => symbol === "EUR" ? money(value) : `${quantity(value)} ${symbol}`;
export function AssetButton({ symbol, name, onSelectAsset }) {
  return symbol && onSelectAsset ? <button className="asset-name-link" onClick={() => onSelectAsset(symbol)}>{name || symbol}</button> : <span>{name || symbol || "Nicht zugeordnet"}</span>;
}
const costLabels = { trade: "Handelsgebühr", leverage: "Hebel-Kostenbuchung", earn: "Earn-/Staking-Gebühr", transfer: "Transfergebühr", swap: "Tauschgebühr", other: "Weitere Gebühr" };
const sumEur = rows => rows.reduce((sum, row) => sum + Math.round((row.eurAmount || 0) * 100), 0) / 100;

export function BookedCostsPanel({ data, tradingFees, financingFees = 0, onSelectAsset }) {
  const [year, setYear] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [showIncluded, setShowIncluded] = useState(false);
  const [onlyUnvalued, setOnlyUnvalued] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const insights = data?.accountInsights;
  if (!insights?.available) return <div className="warning-box">{insights?.error || "Weitere Kostenbuchungen sind für diesen Datenstand noch nicht verfügbar. Bitte Dashboard aktualisieren."}</div>;
  const all = insights.costs || [];
  const years = [...new Set(all.map(row => row.year).filter(Boolean))].sort().reverse();
  const rows = all.filter(row => (year === "all" || row.year === year) && (category === "all" || row.category === category) && (showIncluded || !row.includedTradeId) && (!onlyUnvalued || row.eurAmount == null) && `${row.name} ${row.symbol} ${row.relatedAsset || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const extras = rows.filter(row => !row.includedTradeId);
  const unvalued = all.filter(row => !row.includedTradeId && row.eurAmount == null);
  const missingUnits = [...new Set(unvalued.map(row => row.symbol))].map(symbol => ({ symbol, amount: unvalued.filter(row => row.symbol === symbol).reduce((sum, row) => sum + Number(row.amount || 0), 0) }));
  return <section className="table-card account-costs-panel">
    <div className="section-heading"><div><h3>Weitere Kosten aus den Kontobuchungen</h3><p>Separate Gebühren, Hebel-Kosten und Gebühren auf Erträge. Belege, die bereits in den Handelsgebühren enthalten sind, werden verknüpft und nicht erneut addiert.</p></div></div>
    <div className="account-metrics"><article className="metric-card"><span>Handelsgebühren · gesamt</span><strong>{money(tradingFees)}</strong></article><article className="metric-card"><span>Hebel-Finanzierung · gesamt</span><strong>{money(financingFees)}</strong></article><article className="metric-card"><span>Weitere Kosten · mit historischem EUR-Wert</span><strong>{money(insights.additionalCostsEur)}</strong></article><article className="metric-card"><span>Bekannte Eurokosten · zusammen</span><strong>{money(tradingFees + financingFees + insights.additionalCostsEur)}</strong><small>Zusätzlich {insights.unvaluedCosts} {insights.unvaluedCosts === 1 ? "Kostenbuchung" : "Kostenbuchungen"} ohne historischen EUR-Wert</small></article></div>
    {unvalued.length > 0 && <div className="cost-coverage-note"><span>{unvalued.length} {unvalued.length === 1 ? "Beleg" : "Belege"} ohne EUR-Bewertung · nicht in der Eurosumme enthalten.<br /><small>Originalbeträge: {missingUnits.map(row => native(row.amount, row.symbol)).join(' · ')}</small></span><button className="secondary-button" onClick={() => { setOnlyUnvalued(true); setYear("all"); setCategory("all"); setQuery(""); setCostsOpen(true); }}>Fehlende EUR-Werte prüfen</button></div>}
    <details className="tax-year-details" open={costsOpen} onToggle={event => setCostsOpen(event.currentTarget.open)}><summary><span>Weitere Kostenbuchungen öffnen · {all.filter(row => !row.includedTradeId).length} Belege</span><strong>{money(insights.additionalCostsEur)} mit Eurobetrag</strong></summary>
    <div className="tax-detail-controls"><label>Jahr <select value={year} onChange={e => setYear(e.target.value)}><option value="all">Alle Jahre</option>{years.map(y => <option key={y}>{y}</option>)}</select></label><label>Kostenart <select value={category} onChange={e => setCategory(e.target.value)}><option value="all">Alle Kostenarten</option>{Object.entries(costLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label><input type="checkbox" checked={onlyUnvalued} onChange={e => setOnlyUnvalued(e.target.checked)} /> Nur fehlende EUR-Werte</label><label><input type="checkbox" checked={showIncluded} onChange={e => setShowIncluded(e.target.checked)} /> Bereits enthaltene Handelsgebühren-Belege anzeigen</label><input className="search-input" aria-label="Weitere Kosten nach Asset suchen" placeholder="Asset suchen" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="tax-table-scroll"><AdaptiveTable className="clean-table"><thead><tr><th>Datum</th><th>Asset / Buchung</th><th>Kostenart</th><th>Originalbetrag</th><th>Historischer EUR-Wert</th><th>Zuordnung</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{when(row.date)}</td><td><AssetButton symbol={row.relatedAsset || row.assetKey} name={row.relatedAsset || row.name} onSelectAsset={onSelectAsset} /><small className="fee-detail-meta">{row.label}</small></td><td>{costLabels[row.category]}<small className="fee-detail-meta">{row.refund ? "Gebühr erstattet" : row.embedded ? "Gebühr im Buchungsfeld" : "Eigene Kostenbuchung"}</small></td><td>{native(row.amount, row.symbol)}</td><td>{money(row.eurAmount)}<small className="fee-detail-meta">{row.eurSource || "Historische EUR-Bewertung fehlt"}</small></td><td>{row.includedTradeId ? "Bereits in Handels- oder Finanzierungsgebühren enthalten" : row.isDebt ? "Kreditkonto · Kostenbuchung" : "Weitere ausgewiesene Kosten"}<small className="fee-detail-meta">Beleg: {row.transactionId}</small></td></tr>)}</tbody><tfoot><tr><td colSpan="4">Bekannte EUR-Kosten · aktuelle Auswahl</td><td><strong>{extras.length > 0 && extras.every(row => row.eurAmount == null) ? "Nicht verfügbar" : money(sumEur(extras))}</strong></td><td>{extras.filter(r => r.eurAmount == null).length} ohne Eurobetrag</td></tr></tfoot></AdaptiveTable></div>
    {!rows.length && <p className="category-empty">Keine Kostenbuchungen für diese Auswahl.</p>}
    </details>
    <p className="muted tax-note">Diese Übersicht zeigt gebuchte Kosten. Sie werden nicht zusätzlich vom Kontostand oder pauschal nochmals vom berechneten Gewinn abgezogen. Steuern sind separat auf der Steuerseite sichtbar.</p>
  </section>;
}

export function SourceTaxPanel({ insights, onSelectAsset }) {
  if (!insights?.available) return <div className="warning-box">Quellensteuerbuchungen sind für diesen Datenstand noch nicht verfügbar.</div>;
  const tax = insights.sourceTax;
  const years = [...new Set((tax?.events || []).map(row => row.year))].sort().reverse();
  return <section className="table-card"><div className="section-heading"><h3>Quellensteuer · separat von KESt</h3><strong>{money(tax?.totalPaid)}</strong></div><p>Ausdrücklich als Quellensteuer gebuchte EUR-Abzüge abzüglich verknüpfter Erstattungen. Diese Beträge gehören nicht zur oben angezeigten KESt.</p>{years.map(year => <details className="tax-year-details" key={year}><summary><span>{year}</span><strong>{money(tax.events.filter(r => r.year === year).reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100)}</strong></summary><div className="tax-table-scroll"><AdaptiveTable className="clean-table"><thead><tr><th>Datum</th><th>Asset</th><th>Buchung</th><th>Quellensteuer</th></tr></thead><tbody>{tax.events.filter(r => r.year === year).map(row => <tr key={row.id}><td>{when(row.date)}</td><td><AssetButton symbol={row.asset === "Dividende" ? null : row.asset} name={row.asset} onSelectAsset={onSelectAsset} /></td><td>{row.amount < 0 ? "Erstattung" : "Quellensteuerabzug"}<small className="fee-detail-meta">Beleg: {row.id}</small></td><td>{money(row.amount)}</td></tr>)}</tbody></AdaptiveTable></div></details>)}{!years.length && <p className="category-empty">Keine Quellensteuerbuchungen gefunden.</p>}</section>;
}

export function PortfolioComparison({ data, onSelectAsset, selectedSymbol }) {
  const insights = data?.accountInsights;
  if (!insights?.available || !insights.portfolioAvailable) return <div className="warning-box">{insights?.portfolioError || "Bitpanda-Portfoliovergleich ist für diesen Datenstand nicht verfügbar."}</div>;
  const rows = insights.portfolio.filter(row => !selectedSymbol || row.symbol === selectedSymbol);
  if (!rows.length) return selectedSymbol ? null : <p className="category-empty">Keine Asset-Positionen im API-Portfolio.</p>;
  return <section className="table-card"><div className="section-heading"><h3>Bitpanda-Werte und Dashboard im Vergleich</h3></div><p>Bitpanda liefert eigene Portfolio-Kennzahlen. Das Dashboard rekonstruiert Kosten und Gewinne aus der Historie. Bei Umbuchungen, Erträgen oder unterschiedlichen Berechnungsmethoden können die Werte abweichen.</p><div className="tax-table-scroll"><AdaptiveTable className="clean-table"><thead><tr><th>Asset</th><th>Bestand · Bitpanda / Dashboard</th><th>Investierter Betrag · Bitpanda</th><th>Restkostenbasis · Dashboard</th><th>Ø Kaufpreis · Bitpanda / Dashboard</th><th>Rendite · Bitpanda</th></tr></thead><tbody>{rows.map(row => {
    const trade = data.profitLoss?.assets?.find(a => a.assetKey === row.symbol);
    const position = data.openPositions?.find(a => a.assetKey === row.symbol);
    const dashboard = position || trade;
    return <tr key={row.assetId}><td><AssetButton symbol={row.assetKey} name={row.name} onSelectAsset={onSelectAsset} /><small className="fee-detail-meta">{row.symbol}</small></td><td>{quantity(row.balance)} / {quantity(dashboard?.currentQuantity)}<small className="fee-detail-meta">Verfügbar bei Bitpanda: {quantity(row.availableBalance)}</small></td><td>{money(row.investedAmount)}</td><td>{money(dashboard?.costBasis)}</td><td>{money(row.averageBuyPrice)} / {money(dashboard?.currentQuantity > 0 ? dashboard.costBasis / dashboard.currentQuantity : null)}</td><td>{money(row.totalReturn)}{row.totalReturnPercent != null && <small className="fee-detail-meta">{quantity(row.totalReturnPercent)} %</small>}<small className="fee-detail-meta">Aktueller API-Wert: {money(row.currentValue)}</small></td></tr>;
  })}</tbody></AdaptiveTable></div><p className="muted tax-note">Investierter Betrag und Restkostenbasis sind unterschiedliche Kennzahlen. Ein Unterschied ist deshalb kein automatischer Fehler. Fehlende API-Werte werden als „–“ angezeigt.</p></section>;
}

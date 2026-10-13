import { BookedCostsPanel } from "./AccountDataComponents.jsx";
import { useMemo, useState } from "react";

const eur = value => Number(value || 0).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
const sum = rows => rows.reduce((total, row) => total + Math.round(row.tradingFee * 100), 0) / 100;
const sources = { trades: "Bitpanda · Trades", operations: "Bitpanda · Operations", calculated: "Berechnet / Fallback" };
const date = row => row.time?.date_iso8601 || (row.time?.unix ? new Date(Number(row.time.unix) * 1000).toISOString() : "");

export default function FeesView({ data, loading, error, onSelectAsset }) {
  const [year, setYear] = useState("all");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");
  const [showZero, setShowZero] = useState(false);
  const [sort, setSort] = useState("date");
  const rows = useMemo(() => (data?.profitLoss?.assets || []).flatMap(asset => (asset.trades || []).map(trade => ({ ...trade, asset: asset.displayName || asset.name, assetKey: asset.assetKey, category: asset.categoryLabel }))), [data]);
  const years = [...new Set(rows.map(row => row.year))].sort().reverse();
  const filtered = rows.filter(row => (year === "all" || row.year === year) && (type === "all" || row.type === type) && (source === "all" || row.feeSource === source) && (showZero || row.tradingFee !== 0) && `${row.asset} ${row.assetKey} ${row.id}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === "fee" ? b.tradingFee - a.tradingFee : date(b).localeCompare(date(a)));
  const assets = [...new Set(filtered.map(row => row.assetKey))].map(key => { const trades = filtered.filter(row => row.assetKey === key); return { key, name: trades[0].asset, count: trades.length, fee: sum(trades) }; }).sort((a, b) => b.fee - a.fee);
  if (loading) return <div className="loading-state">Lade Handelsgebühren...</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data?.profitLoss) return <div className="error-box">Gebührendaten fehlen. Bitte Dashboard aktualisieren.</div>;
  return <div className="fees-view">
    <section className="hero-card"><div><div className="eyebrow">Gebühren</div><h2>Handelsgebühren prüfen</h2><p>Jede Gebühr eines abgeschlossenen Kaufs oder Verkaufs wird genau einmal gezählt. Die anteilige Kaufgebühr in der Gewinnberechnung wird hier nicht erneut addiert. KESt und separate Finanzierungsgebühren sind nicht in dieser Summe enthalten.</p></div><div className="hero-status"><span>Handelsgebühren · alle Jahre</span><strong>{eur(sum(rows))}</strong><small>{rows.length} Käufe und Verkäufe einschließlich gebührenfreier Trades</small></div></section>
    <BookedCostsPanel data={data} tradingFees={sum(rows)} onSelectAsset={onSelectAsset} />
    <section className="table-card"><div className="section-heading"><h3>Jahresübersicht</h3></div><div className="tax-table-scroll"><table className="clean-table"><thead><tr><th>Jahr</th><th>Kaufgebühren</th><th>Verkaufsgebühren</th><th>Gesamt</th></tr></thead><tbody>{years.map(y => <tr key={y}><td>{y}</td><td>{eur(sum(rows.filter(r => r.year === y && r.type === "buy")))}</td><td>{eur(sum(rows.filter(r => r.year === y && r.type === "sell")))}</td><td><strong>{eur(sum(rows.filter(r => r.year === y)))}</strong></td></tr>)}</tbody></table></div></section>
    <section className="table-card"><div className="section-heading"><h3>Einzelne Handelsgebühren</h3><span>{filtered.length} Trades · {eur(sum(filtered))}</span></div>
      <div className="tax-detail-controls"><label>Jahr <select value={year} onChange={e => setYear(e.target.value)}><option value="all">Alle Jahre</option>{years.map(y => <option key={y}>{y}</option>)}</select></label><label>Handel <select value={type} onChange={e => setType(e.target.value)}><option value="all">Käufe und Verkäufe</option><option value="buy">Käufe</option><option value="sell">Verkäufe</option></select></label><label>Quelle <select value={source} onChange={e => setSource(e.target.value)}><option value="all">Alle Quellen</option>{Object.entries(sources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Sortierung <select value={sort} onChange={e => setSort(e.target.value)}><option value="date">Neueste zuerst</option><option value="fee">Höchste Gebühr zuerst</option></select></label><label><input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} /> Gebührenfreie Trades anzeigen</label><input className="search-input" aria-label="Asset oder Trade-ID suchen" placeholder="Asset oder Trade-ID suchen" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <details className="tax-year-details"><summary>Gebühren nach Asset · aktuelle Auswahl</summary><div className="tax-table-scroll"><table className="clean-table"><thead><tr><th>Asset</th><th>Trades</th><th>Gebühren</th></tr></thead><tbody>{assets.map(asset => <tr key={asset.key}><td><button className="asset-name-link" onClick={() => onSelectAsset(asset.key)} aria-label={`${asset.name}: Details öffnen`}>{asset.name} · {asset.key}</button></td><td>{asset.count}</td><td>{eur(asset.fee)}</td></tr>)}</tbody></table></div></details>
      <div className="tax-table-scroll"><table className="clean-table"><thead><tr><th>Datum</th><th>Asset</th><th>Handel</th><th>Handelsbetrag</th><th>Gebühr</th><th>Anteil am Betrag</th><th>Quelle / Beleg</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>{date(row) ? new Date(date(row)).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "medium", timeStyle: "short" }) : "–"}</td><td><button className="asset-name-link" onClick={() => onSelectAsset(row.assetKey)} aria-label={`${row.asset}: Details öffnen`}>{row.asset}</button><small className="fee-detail-meta">{row.assetKey} · {row.category}</small></td><td>{row.type === "buy" ? "Kauf" : "Verkauf"}{row.isSavings && <small className="fee-detail-meta">Sparplan</small>}</td><td>{eur(row.fiat)}</td><td><strong>{eur(row.tradingFee)}</strong></td><td>{row.fiat > 0 ? `${(100 * row.tradingFee / row.fiat).toLocaleString("de-AT", { maximumFractionDigits: 2 })} %` : "–"}</td><td>{sources[row.feeSource] || "Quelle noch nicht verfügbar"}<small className="fee-detail-meta">Trade-ID: {row.id}</small></td></tr>)}</tbody><tfoot><tr><td colSpan="4"><strong>Summe der Auswahl</strong></td><td><strong>{eur(sum(filtered))}</strong></td><td colSpan="2" /></tr></tfoot></table></div>
      {!filtered.length && <p className="category-empty">Keine Trades für diese Auswahl.</p>}<p className="muted tax-note">„Trades“ verwendet das Gebührenfeld der Handelshistorie. „Operations“ ergänzt fehlende Gebühren aus den EUR-Handelsbuchungen. „Berechnet / Fallback“ kennzeichnet Gebühren ohne explizites API-Gebührenfeld. Der Prozentwert bezieht sich auf den angezeigten Handelsbetrag.</p>
    </section>
  </div>;
}

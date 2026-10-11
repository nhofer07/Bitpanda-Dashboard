import { buildCashflowTotals, formatCurrency, isSavingsTransaction } from "./helpers.js";

export default function SummaryCards({ transactions, overrides = {} }) {
  const totals = buildCashflowTotals(transactions, overrides);
  const savingsCount = transactions.filter(isSavingsTransaction).length;

  return (
    <div className="stats-grid cashflow-stats-grid">
      <Card title="Einzahlungen" value={formatCurrency(totals.deposits)} tone="positive" />
      <Card title="Echte Ausgaben" value={formatCurrency(totals.expenses)} tone="negative" />
      <Card title="Transfers auf andere Konten" value={formatCurrency(totals.transfers)} />
      <Card title="Rückerstattungen" value={formatCurrency(totals.refunds)} tone="positive" />
      <Card title="Netto" value={formatCurrency(totals.fiatNet)} tone={totals.fiatNet >= 0 ? "positive" : "negative"} />
      <Card title="Treffer" value={transactions.length} />
      <Card title="Sparplan-Buchungen" value={savingsCount} tone={savingsCount > 0 ? "positive" : ""} />
    </div>
  );
}

function Card({ title, value, tone }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

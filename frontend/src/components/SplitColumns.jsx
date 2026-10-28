import {
  amount,
  cashflowClass,
  cashflowLabel,
  fee,
  paymentMethod,
  isSavingsTransaction,
  formatCurrency,
  formatDate
} from "./helpers.js";

function TransactionCard({ transaction, overrides = {} }) {
  const attributes = transaction.attributes || {};
  const classification = cashflowClass(transaction, overrides);
  const positive = classification === "deposit" || classification === "refund";

  return (
    <article className="transaction-card">
      <div className="transaction-card__top">
        <strong className={positive ? "positive" : "negative"}>{formatCurrency(amount(transaction))}</strong>
        <span>{formatDate(transaction)}</span>
      </div>

      <div className="transaction-card__label">
        <span className={positive ? "pill pill-positive" : "pill pill-negative"}>
          {cashflowLabel(transaction, overrides)}
        </span>
      </div>

      <div className="transaction-card__meta">
        Status: {attributes.status || "-"} · Richtung: {attributes.in_or_out || "-"} · {paymentMethod(transaction)}
      </div>

      {isSavingsTransaction(transaction) && <div className="transaction-card__meta transaction-details"><span className="pill pill-positive savings-badge">Sparplan</span><span>Automatisch ausgeführte Bitpanda-Einzahlung</span></div>}

      {fee(transaction) > 0 && (
        <div className="transaction-card__meta">
          Gebühr: {formatCurrency(fee(transaction))}
        </div>
      )}
    </article>
  );
}

export default function SplitColumns({ transactions, overrides = {} }) {
  const deposits = transactions.filter(transaction => cashflowClass(transaction, overrides) === "deposit");
  const refunds = transactions.filter(transaction => cashflowClass(transaction, overrides) === "refund");
  const expenses = transactions.filter(transaction => ["expense", "withdrawal"].includes(cashflowClass(transaction, overrides)));
  const transfers = transactions.filter(transaction => cashflowClass(transaction, overrides) === "transfer");

  const groups = [
    { title: "Einzahlungen", items: deposits },
    { title: "Ausgaben", items: expenses },
    { title: "Transfers", items: transfers },
    { title: "Rückerstattungen", items: refunds }
  ];
  const populated = groups.filter(group => group.items.length);
  const empty = groups.filter(group => !group.items.length);
  return (
    <div className="cashflow-columns">
      {empty.length > 0 && <div className="cashflow-empty-groups" aria-label="Kategorien ohne Buchungen">
        {empty.map(group => <span key={group.title}>{group.title}: 0 Buchungen</span>)}
      </div>}
      {populated.length > 0 ? <div className="dashboard-grid split-grid">
        {populated.map(group => <Column key={group.title} title={`${group.title} (${group.items.length})`} transactions={group.items} overrides={overrides} />)}
      </div> : <p className="muted">Keine Transaktionen für diese Suche gefunden.</p>}
    </div>
  );
}

function Column({ title, transactions, overrides }) {
  return (
    <section className="column-card">
      <h2>{title}</h2>

      {transactions.length === 0 ? (
        <p className="muted">Keine Transaktionen gefunden.</p>
      ) : (
        transactions.map((transaction) => (
          <TransactionCard key={transaction.id} transaction={transaction} overrides={overrides} />
        ))
      )}
    </section>
  );
}

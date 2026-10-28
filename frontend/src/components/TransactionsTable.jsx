import AdaptiveTable from "./AdaptiveTable.jsx";
import {
  amount,
  cashflowClass,
  cashflowLabel,
  fee,
  paymentMethod,
  isSavingsTransaction,
  formatCurrency,
  formatDate,
  defaultCashflowClass
} from "./helpers.js";
import { CASHFLOW_OPTIONS } from "./cashflowOverrides.js";

export default function TransactionsTable({ transactions, overrides = {}, onChangeClassification }) {
  return (
    <div className="table-card cashflow-table-card">
      <div className="mobile-transaction-list">
        {transactions.map(transaction => <article className="mobile-transaction-card" key={transaction.id}>
          <header><span>{cashflowLabel(transaction, overrides)}</span><strong className={transaction.attributes?.in_or_out === "incoming" ? "positive" : "negative"}>{formatCurrency(amount(transaction))}</strong></header>
          <p>{formatDate(transaction)} · {paymentMethod(transaction)}</p>
          {isSavingsTransaction(transaction) && <div className="transaction-details"><span className="pill pill-positive savings-badge">Sparplan</span></div>}
          <details><summary>Details & Zuordnung</summary>
            <p>Status: {transaction.attributes?.status || "–"} · Gebühr: {formatCurrency(fee(transaction))}</p>
            <label>Zuordnung<select value={cashflowClass(transaction, overrides)} onChange={event => onChangeClassification?.(transaction.id, event.target.value)}>{CASHFLOW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </details>
        </article>)}
      </div>
      <AdaptiveTable className="clean-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Kategorie</th>
            <th>Einzahlung</th>
            <th>Rückerstattung</th>
            <th>Auszahlung</th>
            <th>Gebühr</th>
            <th>Status</th>
            <th>Richtung</th>
            <th>Details</th>
            <th>Korrektur</th>
          </tr>
        </thead>

        <tbody>
          {transactions.map((transaction) => {
            const attributes = transaction.attributes || {};
            const classification = cashflowClass(transaction, overrides);
            const defaultClassification = defaultCashflowClass(transaction);
            const positive = classification === "deposit" || classification === "refund";

            return (
              <tr key={transaction.id}>
                <td>{formatDate(transaction)}</td>
                <td>
                  <span className={positive ? "pill pill-positive" : "pill pill-negative"}>
                    {cashflowLabel(transaction, overrides)}
                  </span>
                </td>
                <td className="positive strong">
                  {classification === "deposit" ? formatCurrency(amount(transaction)) : "-"}
                </td>
                <td className="positive strong">
                  {classification === "refund" ? formatCurrency(amount(transaction)) : "-"}
                </td>
                <td className="negative strong">
                  {["expense", "withdrawal"].includes(classification) ? formatCurrency(amount(transaction)) : "-"}
                </td>
                <td>{formatCurrency(fee(transaction))}</td>
                <td>{attributes.status || "-"}</td>
                <td>{attributes.in_or_out || "-"}</td>
                <td>
                  <div className="transaction-details">
                    <span className="transaction-payment-method">{paymentMethod(transaction)}</span>
                    {isSavingsTransaction(transaction) && <span className="pill pill-positive savings-badge">Sparplan</span>}
                  </div>
                </td>
                <td>
                  <div className="cashflow-classification">
                  <select
                    className="cashflow-select"
                    value={classification}
                    onChange={event => onChangeClassification?.(transaction.id, event.target.value)}
                    aria-label={`Korrektur fuer ${formatDate(transaction)}`}
                  >
                    {CASHFLOW_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.value === "expense" ? "Ausgabe" : option.value === "transfer" ? "Transfer" : option.label}
                      </option>
                    ))}
                  </select>
                  <small>{classification === defaultClassification ? "Automatisch zugeordnet" : "Manuell zugeordnet"}</small>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdaptiveTable>
    </div>
  );
}

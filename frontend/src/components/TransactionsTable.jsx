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
    <div className="table-card">
      <table className="clean-table">
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
                  <div>{paymentMethod(transaction)}</div>
                  {isSavingsTransaction(transaction) && <div><span className="pill pill-positive">Sparplan</span></div>}
                </td>
                <td>
                  <select
                    className="cashflow-select"
                    value={classification}
                    onChange={event => onChangeClassification?.(transaction.id, event.target.value)}
                    aria-label={`Korrektur fuer ${formatDate(transaction)}`}
                  >
                    {CASHFLOW_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.value === defaultClassification ? `${option.label} (automatisch)` : option.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

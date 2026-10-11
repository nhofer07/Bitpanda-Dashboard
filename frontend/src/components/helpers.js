export function getType(transaction) {
  return (transaction.attributes?.type || "").toLowerCase();
}

export function getDirection(transaction) {
  return (transaction.attributes?.in_or_out || "").toLowerCase();
}

export function amount(transaction) {
  return Math.abs(Number(transaction.attributes?.amount || 0));
}

export function fee(transaction) {
  return Math.abs(Number(transaction.attributes?.fee || 0));
}

export function paymentMethod(transaction) {
  const attributes = transaction.attributes || {};
  const method = String(attributes.payment_option_short_name || "").trim();
  const provider = String(attributes.payment_provider_short_name || "").trim();
  const card = String(attributes.ccard_digits || "").trim();
  return [method, provider && provider !== method ? provider : "", card]
    .filter(Boolean)
    .join(" · ") || "-";
}

export function isSavingsTransaction(transaction) {
  return transaction.attributes?.is_savings === true;
}

export function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

export function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

export function formatDate(transaction) {
  const date =
    transaction.attributes?.time?.date_iso8601 ||
    transaction.attributes?.created_at ||
    transaction.created_at;

  return date ? new Date(date).toLocaleString("de-DE") : "-";
}

export function isDeposit(transaction) {
  const type = getType(transaction);
  const direction = getDirection(transaction);

  return type === "deposit" && direction === "incoming";
}

export function isWithdrawalOrCard(transaction) {
  const type = getType(transaction);
  const direction = getDirection(transaction);

  return (
    (type === "withdrawal" && direction === "outgoing") ||
    (type === "transfer" && direction === "outgoing")
  );
}

export function isCardPayment(transaction) {
  const attributes = transaction.attributes || {};
  const text = JSON.stringify(attributes).toLowerCase();
  return attributes.is_card === true || attributes.is_card_order_charge === true || text.includes("bitpanda card") || text.includes("bp card");
}

export function defaultCashflowClass(transaction) {
  if (isDeposit(transaction)) return "deposit";
  if (isWithdrawalOrCard(transaction)) {
    return "expense";
  }
  return "ignore";
}

export function cashflowClass(transaction, overrides = {}) {
  const override = overrides?.[transaction.id];
  const fallback = defaultCashflowClass(transaction);

  return override || fallback;
}

export function isRefund(transaction, overrides = {}) {
  return cashflowClass(transaction, overrides) === "refund";
}

export function cashflowLabel(transaction, overrides = {}) {
  const classification = cashflowClass(transaction, overrides);

  if (classification === "deposit") return "Einzahlung";
  if (classification === "expense") return "Ausgabe";
  if (classification === "transfer") return "Transfer";
  if (classification === "withdrawal") return "Auszahlung";
  if (classification === "refund") return ["expense", "transfer", "withdrawal"].includes(defaultCashflowClass(transaction)) ? "Erstattete Ausgabe" : "Rückerstattung";
  return "Ignorieren";
}

export function getLabel(transaction) {
  return cashflowLabel(transaction);
}

export function buildCashflowTotals(transactions, overrides = {}) {
  const totals = transactions.reduce((currentTotals, transaction) => {
    const value = amount(transaction);
    const classification = cashflowClass(transaction, overrides);
    const fallback = defaultCashflowClass(transaction);

    if (classification === "deposit") {
      currentTotals.deposits += value;
      currentTotals.net += value;
    } else if (classification === "expense" || classification === "withdrawal") {
      currentTotals.expenses += value;
      currentTotals.withdrawals += value;
      currentTotals.net -= value;
    } else if (classification === "transfer") {
      currentTotals.transfers += value;
      currentTotals.net -= value;
    } else if (classification === "refund") {
      if (["expense", "withdrawal", "transfer"].includes(fallback)) {
        currentTotals.refundedWithdrawals += value;
        currentTotals.net -= value;
      } else {
        currentTotals.refundedDeposits += value;
        currentTotals.net += value;
      }
    } else {
      currentTotals.ignored += value;
    }

    return currentTotals;
  }, {
    deposits: 0,
    withdrawals: 0,
    expenses: 0,
    transfers: 0,
    refundedDeposits: 0,
    refundedWithdrawals: 0,
    ignored: 0,
    net: 0
  });

  return {
    ...totals,
    fiatNet: totals.deposits - totals.withdrawals - totals.transfers,
    refunds: Math.max(totals.refundedDeposits, totals.refundedWithdrawals)
  };
}

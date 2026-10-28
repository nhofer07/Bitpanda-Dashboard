export function getType(transaction) {
  return (transaction.attributes?.type || "").toLowerCase();
}

export function getDirection(transaction) {
  return (transaction.attributes?.in_or_out || "").toLowerCase();
}

export function amount(transaction) {
  return Math.abs(Number(transaction.attributes?.amount || 0));
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

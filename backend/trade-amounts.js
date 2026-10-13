// Preserve explicit zero fees. Bitpanda supplies both scalar fees and nested
// fee objects; execution prices can already include those fees.
export function reportedTradeFee(trade) {
  const fee = trade.attributes?.fee;
  const value = fee && typeof fee === 'object' ? fee.attributes?.fee_amount_in_fiat : fee;
  if (value == null || value === '' || !['number', 'string'].includes(typeof value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

export function tradeValueBeforeFee(trade, quantity, fiat, fee) {
  const type = String(trade.attributes?.type || '').toLowerCase();
  // amount_fiat is the wallet debit/credit before tax, after trading fees.
  // Using a fee-inclusive execution price here would deduct the fee twice.
  if (reportedTradeFee(trade) != null) return type === 'buy' ? Math.max(0, fiat - fee) : fiat + fee;
  const priceValue = Number(trade.attributes?.price || 0) * quantity;
  if (Number.isFinite(priceValue) && priceValue > 0) return priceValue;
  return type === 'buy' ? Math.max(0, fiat - fee) : fiat + fee;
}

// Rewards/transfers may increase holdings without a matching purchase. Allocate
// only the purchase fees actually available, never more than their total.
export function allocateSalePurchaseFees(quantity, heldQuantity, feeCostBasis) {
  const matchedQuantity = Math.min(Math.max(0, quantity), Math.max(0, heldQuantity));
  const share = heldQuantity > 0 ? matchedQuantity / heldQuantity : 0;
  return { allocatedBuyFee: feeCostBasis * share, unmatchedQuantity: Math.max(0, quantity - matchedQuantity) };
}

export function enrichTradesWithBookedFees(trades, operations, eurCurrencyId) {
  const fees = new Map();
  const types = new Map(trades.map(trade => [trade.id, trade.attributes?.type]));
  for (const operation of operations) {
    for (const transaction of operation.transactions || []) {
      if (!transaction.trade?.trade_id || transaction.currency_id !== eurCurrencyId) continue;
      // Internal funding legs may carry a zero fee for the same trade.
      // Read the actual buy debit / sell credit, independent of API ordering.
      const type = types.get(transaction.trade.trade_id);
      if (transaction.flow && (type === 'buy' || type === 'sell') && transaction.flow !== (type === 'buy' ? 'OUTGOING' : 'INCOMING')) continue;
      const fee = transaction.trade.fee;
      if (fee?.currency_id !== eurCurrencyId || fee.value == null || fee.value === '') continue;
      const amount = Number(fee.value);
      if (Number.isFinite(amount)) fees.set(transaction.trade.trade_id, Math.abs(amount));
    }
  }
  return trades.map(trade => {
    if (reportedTradeFee(trade) != null || !fees.has(trade.id)) return trade;
    return { ...trade, attributes: { ...trade.attributes, dashboardFeeSource: 'operations', fee: { attributes: { fee_amount_in_fiat: String(fees.get(trade.id)) } } } };
  });
}

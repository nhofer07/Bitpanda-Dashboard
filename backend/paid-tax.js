const SALE_TYPES = new Set(['sell', 'advanced_trading_sell', 'stock_exchange_sell', 'securities_margin_trading_close_long', 'margin_trading_close_long']);
const cents = value => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) throw new Error('Ungültiger Betrag in einer Steuerbuchung.');
  return Math.round(Math.abs(Number(value)) * 100);
};
const yearOf = date => {
  if (!date || !Number.isFinite(Date.parse(date))) throw new Error('Datum einer Steuerbuchung fehlt.');
  return new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Vienna' }).format(new Date(date));
};
const categoryOf = type => /dividend/.test(type) ? 'dividends' : SALE_TYPES.has(type) ? 'sales' : 'other';

// Only cash movements count. Tax debt records and transfers into the tax-credit
// wallet are bookkeeping entries, not additional payments.
export function calculatePaidTax(operations, { eurCurrencyId, trades = [] }) {
  if (!eurCurrencyId) throw new Error('EUR-Währung für Steuerbuchungen fehlt.');
  const tradeMap = new Map(trades.map(trade => [trade.id, trade]));
  const assetMap = new Map();
  const transactions = new Map();
  const tradeTaxes = new Map();
  for (const operation of operations) {
    const sale = (operation.transactions || []).find(t => t.trade?.trade_id && t.transaction_type === 'sell' && t.currency_id === eurCurrencyId && t.flow === 'INCOMING');
    const tradeId = sale?.trade.trade_id || (operation.transactions || []).find(t => t.trade?.trade_id)?.trade.trade_id || null;
    const symbol = tradeMap.get(tradeId)?.attributes?.cryptocoin_symbol || null;
    for (const transaction of operation.transactions || []) {
      const transactionSymbol = tradeMap.get(transaction.trade?.trade_id)?.attributes?.cryptocoin_symbol;
      if (transaction.asset_id && transactionSymbol) assetMap.set(transaction.asset_id, transactionSymbol);
      if (transaction.trade?.trade_id) tradeTaxes.set(transaction.trade.trade_id, 0);
      if (!transactions.has(transaction.transaction_id)) transactions.set(transaction.transaction_id, { ...transaction, operationType: operation.operation_type, tradeId, symbol });
    }
  }
  const events = [];
  for (const transaction of transactions.values()) {
    if (transaction.currency_id !== eurCurrencyId || transaction.wallet_owner !== 'shared-default') continue;
    const original = transactions.get(transaction.compensates);
    let category, kind, groupId;
    if (transaction.transaction_type === 'tax') {
      category = categoryOf(transaction.operationType);
      kind = transaction.flow === 'INCOMING' ? 'refund' : 'withholding';
      groupId = transaction.transaction_id;
    } else if (transaction.compensates_info?.transaction_type === 'tax' && transaction.flow === 'INCOMING') {
      category = categoryOf(original?.operationType || transaction.compensates_info.operation_type);
      kind = 'refund';
      groupId = transaction.compensates;
    } else if (transaction.operationType === 'securities_tax_refund' && transaction.flow === 'INCOMING') {
      category = 'sales'; kind = 'refund'; groupId = transaction.transaction_id;
    } else if (transaction.operationType === 'securities_tax_debt_settlement' && transaction.flow === 'OUTGOING') {
      category = 'sales'; kind = 'settlement'; groupId = transaction.transaction_id;
    } else continue;
    const amountCents = cents(transaction.asset_amount?.value) * (kind === 'refund' ? -1 : 1);
    const parent = kind === 'refund' && original?.transaction_type === 'tax' ? original : transaction;
    const assetTransaction = (operations.find(o => (o.transactions || []).some(t => t.transaction_id === parent.transaction_id))?.transactions || []).find(t => t.asset_id);
    const event = {
      id: transaction.transaction_id, groupId, tradeId: parent.tradeId,
      date: transaction.credited_at, year: yearOf(transaction.credited_at), category, kind,
      asset: parent.symbol || assetMap.get(assetTransaction?.asset_id) || (category === 'dividends' ? 'Dividende' : 'Wertpapiere · allgemeine Korrektur'),
      reason: /margin_trading_close/.test(parent.operationType) ? 'Positionsschließung mit Hebel'
        : category === 'dividends' ? 'Dividende'
        : kind === 'settlement' ? 'Bezahlte Steuernachforderung'
        : transaction.operationType === 'securities_tax_refund' ? 'Allgemeine Steuererstattung'
        : 'Verkauf',
      amount: amountCents / 100
    };
    events.push(event);
    if (parent.tradeId && category === 'sales') tradeTaxes.set(parent.tradeId, (tradeTaxes.get(parent.tradeId) || 0) + amountCents);
  }
  const years = new Map();
  // Show years present in the cash history even when no tax was booked.
  for (const transaction of transactions.values()) {
    if (transaction.currency_id !== eurCurrencyId || transaction.wallet_owner !== 'shared-default' || !transaction.credited_at) continue;
    const year = yearOf(transaction.credited_at);
    if (!years.has(year)) years.set(year, { period: year, salesPaid: 0, dividendsPaid: 0, otherPaid: 0, totalPaid: 0, withheld: 0, refunded: 0, settlements: 0 });
  }
  for (const event of events) {
    if (!years.has(event.year)) years.set(event.year, { period: event.year, salesPaid: 0, dividendsPaid: 0, otherPaid: 0, totalPaid: 0, withheld: 0, refunded: 0, settlements: 0 });
    const year = years.get(event.year), amount = Math.round(event.amount * 100);
    year[`${event.category === 'dividends' ? 'dividends' : event.category === 'sales' ? 'sales' : 'other'}Paid`] += amount;
    year.totalPaid += amount;
    year[event.kind === 'refund' ? 'refunded' : event.kind === 'settlement' ? 'settlements' : 'withheld'] += Math.abs(amount);
  }
  const yearly = [...years.values()].map(year => Object.fromEntries(Object.entries(year).map(([key, value]) => [key, key === 'period' ? value : value / 100]))).sort((a, b) => b.period.localeCompare(a.period));
  const totals = Object.fromEntries(['salesPaid', 'dividendsPaid', 'otherPaid', 'totalPaid', 'withheld', 'refunded', 'settlements'].map(key => [key, yearly.reduce((sum, year) => sum + Math.round(year[key] * 100), 0) / 100]));
  return { available: true, source: 'bitpanda_bookings', ...totals, yearly, events: events.sort((a, b) => b.date.localeCompare(a.date)), tradeTaxes: Object.fromEntries([...tradeTaxes].map(([id, amount]) => [id, amount / 100])) };
}

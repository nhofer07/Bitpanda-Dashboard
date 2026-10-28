import { reportedTradeFee } from './trade-amounts.js';

// Match funding charges to the actual closing trade and its repayment legs.
// Never assume that a credit token is worth one EUR.
export function enrichTradesWithLeverageFees(trades, operations, eurCurrencyId, legacyTransactions = []) {
  const legacy = new Map(legacyTransactions.map(row => [row.id, row.attributes || {}]));
  const closingFees = new Map();
  const tradeMap = new Map(trades.map(trade => [trade.id, trade]));
  const booked = new Map();
  const seen = new Set();
  for (const operation of operations) {
    if (!/margin_trading_close/.test(operation.operation_type || '')) continue;
    const rows = operation.transactions || [];
    const saleIds = [...new Set(rows.filter(row => !/credit|debt/.test(row.wallet_owner || '') && row.asset_id && tradeMap.get(row.trade?.trade_id)?.attributes?.type === 'sell').map(row => row.trade.trade_id))];
    if (saleIds.length !== 1) continue;
    const standaloneFees = rows.filter(row => row.transaction_type === 'fee' && row.currency_id === eurCurrencyId && row.flow === 'OUTGOING');
    const closeFee = standaloneFees.reduce((sum, row) => sum + (Number(row.asset_amount?.value) || 0), 0);
    if (closeFee > 0) {
      const saleLegs = rows.filter(row => row.currency_id === eurCurrencyId && row.flow === 'INCOMING' && row.trade?.trade_id === saleIds[0]);
      if (saleLegs.length === 1 && Number(saleLegs[0].asset_amount?.value) > 0) closingFees.set(saleIds[0], { fee: closeFee, gross: Number(saleLegs[0].asset_amount.value) + Math.abs(Number(saleLegs[0].fee_amount?.value || 0)) });
    }
    for (const row of rows) {
      if (row.transaction_type !== 'charge' || row.flow !== 'OUTGOING' || !row.transaction_id || seen.has(row.transaction_id)) continue;
      const amount = Number(row.asset_amount?.value);
      const unit = row.asset_id || row.currency_id || row.asset_amount?.asset_id || row.asset_amount?.currency_id;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      let rate = unit === eurCurrencyId ? 1 : null;
      if (rate == null) {
        const historical = legacy.get(row.transaction_id);
        const historicAmount = Number(historical?.amount);
        const historicEur = Number(historical?.amount_eur);
        if (historical?.amount_eur != null && Number.isFinite(historicEur) && historicEur > 0 && Math.abs(Math.abs(historicAmount) - amount) < 0.00000002) rate = historicEur / amount;
      }
      if (rate == null) {
        const repayments = rows.filter(t => t.asset_id === unit && t.flow === 'INCOMING' && t.trade?.trade_id && /credit|debt/.test(t.wallet_owner || ''));
        if (repayments.length !== 1) continue;
        const repayment = repayments[0];
        const euroLegs = rows.filter(t => t.currency_id === eurCurrencyId && t.flow === 'OUTGOING' && t.trade?.trade_id === repayment.trade.trade_id);
        if (euroLegs.length !== 1) continue;
        const units = Number(repayment.asset_amount?.value), euros = Number(euroLegs[0].asset_amount?.value);
        if (!(units > 0 && euros > 0) || !Number.isFinite(units) || !Number.isFinite(euros)) continue;
        rate = euros / units;
      }
      seen.add(row.transaction_id);
      const tradeId = saleIds[0];
      const entries = booked.get(tradeId) || [];
      entries.push({ transactionId: row.transaction_id, operationId: operation.operation_id, amount, unitId: unit, eurAmount: Math.round(amount * rate * 100) / 100, source: unit === eurCurrencyId ? 'EUR-Buchung' : legacy.has(row.transaction_id) ? 'API · historischer EUR-Wert' : 'EUR-Wert aus zugehöriger Kreditrückzahlung' });
      booked.set(tradeId, entries);
    }
  }
  return trades.map(trade => {
    const entries = booked.get(trade.id);
    const closeFee = closingFees.get(trade.id);
    if (!entries && !closeFee) return trade;
    return { ...trade, attributes: { ...trade.attributes,
      ...(closeFee?.fee > (reportedTradeFee(trade) || 0) ? { fee: { attributes: { fee_amount_in_fiat: String(closeFee.fee) } }, dashboardFeeSource: 'operations' } : {}),
      ...(closeFee ? { dashboardGrossTradeValue: closeFee.gross } : {}),
      ...(entries ? { financingFee: entries.reduce((sum, fee) => sum + fee.eurAmount, 0), financingFeeBookings: entries } : {})
    } };
  });
}

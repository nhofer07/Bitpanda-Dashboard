import { catalogCategory } from "./asset-identity.js";
const REWARDS = new Set(['reward', 'passive_earn_reward', 'onetime_reward', 'earn_on_fiat_reward']);
const SPECIAL = new Set(['swap', 'dust_swap', 'merger_crypto', 'earn_on_fiat_swap', 'stake', 'unstake']);
const LABELS = { advanced_trading_reserve: 'Fusion-Guthaben reservieren', advanced_trading_release: 'Fusion-Reservierung freigeben', stock_exchange_reserve: 'Wertpapier-Guthaben reservieren', stock_exchange_release: 'Wertpapier-Reservierung freigeben', card_reserve: 'Kartenzahlung reservieren', securities_margin_trading_reserve_long: 'Guthaben für Wertpapier-Hebel reservieren', buy: 'Kauf', sell: 'Verkauf', advanced_trading_buy: 'Fusion-Kauf', advanced_trading_sell: 'Fusion-Verkauf', stock_exchange_buy: 'Wertpapierkauf', stock_exchange_sell: 'Wertpapierverkauf', reward: 'Staking-Ertrag', passive_earn_reward: 'Passives Earn', onetime_reward: 'Bonus', earn_on_fiat_reward: 'Cash-Plus-Ertrag', ca_dividend: 'Dividende', dividend: 'Dividende', stake: 'Staking-Umbuchung', unstake: 'Staking-Rückbuchung', swap: 'Tausch', dust_swap: 'Kleinstbeträge umwandeln', merger_crypto: 'Krypto-Zusammenlegung', earn_on_fiat_swap: 'Cash-Plus-Umbuchung', securities_tax_refund: 'Steuererstattung', securities_tax_debt_settlement: 'Steuernachforderung bezahlt', securities_tax_debt_record: 'Steuernachforderung vorgemerkt', refund: 'Erstattung', reversal: 'Storno', margin_trading_close_long: 'Krypto-Hebelposition schließen', margin_trading_open_long: 'Krypto-Hebelposition öffnen', securities_margin_trading_close_long: 'Wertpapier-Hebelposition schließen', securities_margin_trading_open_long: 'Wertpapier-Hebelposition öffnen', withdrawal: 'Auszahlung', deposit: 'Einzahlung', card_debit: 'Kartenzahlung', card_credit: 'Kartengutschrift', savings_plan: 'Sparplan' };
const finite = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const yearOf = date => date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Vienna' }).format(new Date(date)) : null;
const sumEur = rows => rows.reduce((sum, row) => sum + Math.round((row.eurAmount || 0) * 100), 0) / 100;
const unitId = amount => amount?.asset_id || amount?.currency_id;
const isDebt = owner => /credit|debt/.test(owner || '');

export function buildAccountInsights(operations, { eurCurrencyId, trades = [], assets = [], currencies = [], cryptoTransactions = [], fiatTransactions = [], portfolio = [], portfolioError = null, metadataErrors = [] }) {
  if (!eurCurrencyId) throw new Error('EUR-Währung für Kontodaten fehlt.');
  const catalog = new Map([...assets, ...currencies].map(item => [item.id, { symbol: item.symbol, name: item.name || item.symbol, category: catalogCategory(item), isin: item.isin || null, isAsset: assets.some(a => a.id === item.id) }]));
  catalog.set(eurCurrencyId, { symbol: 'EUR', name: 'Euro', isAsset: false });
  const tradeMap = new Map(trades.map(t => [t.id, t]));
  const legacy = new Map([...cryptoTransactions, ...fiatTransactions].map(t => [t.id, t.attributes || {}]));
  // Map transaction assets via the actual trade, not by the first leg of an operation.
  for (const operation of operations) for (const t of operation.transactions || []) {
    const trade = tradeMap.get(t.trade?.trade_id);
    if (t.asset_id && trade?.attributes?.cryptocoin_symbol && !catalog.has(t.asset_id)) catalog.set(t.asset_id, { symbol: trade.attributes.cryptocoin_symbol, name: trade.attributes.cryptocoin_symbol, isAsset: true });
  }
  const unit = id => catalog.get(id) || { symbol: id || 'Unbekannte Einheit', name: 'Unbekannte Einheit', isAsset: false };
  const lookup = new Map();
  const operationMap = new Map();
  for (const operation of operations) {
    operationMap.set(operation.operation_id, operation);
    for (const transaction of operation.transactions || []) if (!lookup.has(transaction.transaction_id)) lookup.set(transaction.transaction_id, { ...transaction, operationId: operation.operation_id, operationType: operation.operation_type });
  }
  const ledger = [];
  for (const t of lookup.values()) {
    const amount = finite(t.asset_amount?.value);
    const id = t.asset_id || t.currency_id || unitId(t.asset_amount);
    const fee = unitId(t.fee_amount) === id ? finite(t.fee_amount?.value) : null;
    const direction = t.flow === 'INCOMING' ? 1 : t.flow === 'OUTGOING' ? -1 : null;
    const info = unit(id);
    ledger.push({ id: t.transaction_id, operationId: t.operationId, operationType: t.operationType, label: LABELS[t.operationType] || t.operationType, transactionType: t.transaction_type || null, walletId: t.wallet_id, wallet: t.wallet_owner || 'Unbekannt', unitId: id, symbol: info.symbol, assetKey: info.isAsset ? info.symbol : null, name: info.name, date: t.credited_at, year: yearOf(t.credited_at), order: finite(t.order_id), amount, feeAmount: fee, delta: amount != null && direction != null ? direction * Math.abs(amount) - Math.abs(fee || 0) : null, balanceAfter: Number(t.order_id) === 0 && Number(t.asset_balance_after?.value) === -1 ? null : finite(t.asset_balance_after?.value), isDebt: isDebt(t.wallet_owner), tradeId: t.trade?.trade_id || null, compensates: t.compensates || null, balanceCheck: 'unverified' });
  }
  // Check each wallet and unit separately. Missing amounts remain unknown.
  const wallets = new Map();
  for (const row of ledger) {
    const key = `${row.walletId}:${row.unitId}`;
    if (!wallets.has(key)) wallets.set(key, []);
    wallets.get(key).push(row);
  }
  for (const rows of wallets.values()) {
    rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || (a.order ?? 0) - (b.order ?? 0));
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i], previous = rows[i - 1];
      if (row.balanceAfter == null || previous.balanceAfter == null || row.delta == null || row.order == null || previous.order == null || !yearOf(row.date) || !yearOf(previous.date)) continue;
      // Gaps can reflect a partial API history; they are not proven mismatches.
      if (row.operationId === previous.operationId && row.order !== previous.order + 1) continue;
      if (row.date === previous.date && row.order === previous.order) continue;
      const difference = row.balanceAfter - previous.balanceAfter - row.delta;
      row.balanceDifference = difference;
      row.balanceCheck = Math.abs(difference) <= (row.unitId === eurCurrencyId ? 0.011 : 0.00000002) ? 'matched' : 'difference';
    }
  }
  const costs = [], sourceTax = [], rewards = [];
  const matchedTradeFees = new Set();
  const tradeFees = new Map(trades.map(t => [t.id, finite(typeof t.attributes?.fee === 'object' ? t.attributes.fee?.attributes?.fee_amount_in_fiat : t.attributes?.fee)]));
  const financingBookings = new Map(trades.flatMap(trade => (trade.attributes?.financingFeeBookings || []).map(fee => [fee.transactionId, { ...fee, tradeId: trade.id }])));
  const operationAsset = operation => {
    const trade = (operation?.transactions || []).map(t => tradeMap.get(t.trade?.trade_id)).find(t => t && !['BCPEUR', 'EURCV'].includes(t.attributes?.cryptocoin_symbol));
    return trade?.attributes?.cryptocoin_symbol || null;
  };
  const eurValue = (row, amount, embedded = false) => {
    if (row.unitId === eurCurrencyId) return { eurAmount: amount, eurSource: 'EUR-Buchung' };
    const entry = legacy.get(row.id);
    // The historical value must refer to this exact debit, never today's price.
    if (!embedded && finite(entry?.amount_eur) != null && Math.abs(Math.abs(finite(entry.amount) || 0) - Math.abs(amount)) < 0.00000002) return { eurAmount: Math.abs(finite(entry.amount_eur)) * Math.sign(amount), eurSource: 'API · historischer EUR-Wert' };
    if (embedded && !row.isDebt && finite(entry?.amount_eur) != null && Math.abs(finite(entry.amount) || 0) > 0) {
      const nativeAmount = Math.abs(finite(entry.amount));
      const gross = Math.abs(row.amount || 0), net = Math.abs(row.delta || 0);
      // A matching receipt supplies a historical conversion rate for this
      // exact asset movement; never use a current market quote for old fees.
      const sameUnit = !entry.cryptocoin_symbol || entry.cryptocoin_symbol === row.symbol;
      if (sameUnit && [gross, net].some(value => Math.abs(nativeAmount - value) <= Math.max(1e-12, nativeAmount * 1e-8))) {
        return { eurAmount: amount * Math.abs(finite(entry.amount_eur)) / nativeAmount, eurSource: 'Berechnet · historischer EUR-Buchungskurs' };
      }
    }
    return { eurAmount: null, eurSource: null };
  };
  for (const row of ledger) {
    const raw = lookup.get(row.id), operation = operationMap.get(row.operationId);
    const amount = Math.abs(row.amount || 0);
    const original = lookup.get(raw.compensates);
    if ((row.transactionType === 'levy' || raw.compensates_info?.transaction_type === 'levy' || original?.transaction_type === 'levy') && row.unitId === eurCurrencyId && row.wallet === 'shared-default' && row.amount != null) {
      sourceTax.push({ ...row, asset: operationAsset(operation) || 'Dividende', amount: amount * (raw.flow === 'INCOMING' ? -1 : 1) });
    }
    if (REWARDS.has(row.operationType) && raw.flow === 'INCOMING' && !row.isDebt && row.amount != null) {
      const gross = amount, fee = Math.abs(row.feeAmount || 0), net = gross - fee;
      const entry = legacy.get(row.id);
      const netEur = row.unitId === eurCurrencyId ? net : finite(entry?.amount_eur) != null && Math.abs((finite(entry.amount) || 0) - net) < 0.00000002 ? finite(entry.amount_eur) : null;
      rewards.push({ ...row, gross, fee, net, netEur });
    }
    const costRefund = raw.flow === 'INCOMING' && (['fee', 'charge'].includes(original?.transaction_type) || ['fee', 'charge'].includes(raw.compensates_info?.transaction_type));
    const isStandalone = (['fee', 'charge'].includes(row.transactionType) && raw.flow === 'OUTGOING') || costRefund;
    const isEmbedded = row.feeAmount != null && row.feeAmount > 0;
    if (!isStandalone && !isEmbedded) continue;
    if (row.amount == null) continue;
    const costAmount = isStandalone ? amount * (costRefund ? -1 : 1) : row.feeAmount;
    const financing = financingBookings.get(row.id);
    const value = financing ? { eurAmount: financing.eurAmount, eurSource: financing.source } : eurValue(row, costAmount, !isStandalone);
    let includedTradeId = financing?.tradeId || null;
    if (isStandalone && !costRefund && value.eurAmount != null && !row.isDebt) {
      for (const t of operation?.transactions || []) {
        const tradeId = t.trade?.trade_id, fee = tradeFees.get(tradeId);
        if (fee > 0 && !matchedTradeFees.has(tradeId) && Math.abs(fee - value.eurAmount) < 0.005) { includedTradeId = tradeId; matchedTradeFees.add(tradeId); break; }
      }
    }
    const category = financing ? 'leverage' : includedTradeId ? 'trade' : /margin/.test(row.operationType) ? 'leverage' : REWARDS.has(row.operationType) ? 'earn' : /withdrawal|deposit/.test(row.operationType) ? 'transfer' : /swap/.test(row.operationType) ? 'swap' : 'other';
    costs.push({ ...row, id: `${row.id}:${isStandalone ? 'debit' : 'embedded'}`, transactionId: row.id, refund: costRefund, amount: costAmount, category, embedded: !isStandalone, includedTradeId, relatedAsset: operationAsset(operation), ...value });
  }
  const rewardGroups = new Map();
  for (const reward of rewards) {
    const key = `${reward.year}:${reward.unitId}:${reward.operationType}`;
    if (!rewardGroups.has(key)) rewardGroups.set(key, { year: reward.year, symbol: reward.symbol, name: reward.name, assetKey: reward.assetKey, label: reward.label, gross: 0, fee: 0, net: 0, netEur: 0, unvalued: 0, count: 0 });
    const group = rewardGroups.get(key);
    group.gross += reward.gross; group.fee += reward.fee; group.net += reward.net; group.count++;
    if (reward.netEur != null) group.netEur += reward.netEur; else group.unvalued++;
  }
  const portfolioRows = portfolio.filter(p => p.asset_id).map(p => {
    const info = unit(p.asset_id);
    // Only EUR values may be shown as EUR; preserve unavailable fields as null.
    const euro = value => unitId(value) === eurCurrencyId ? finite(value?.value) : null;
    return { assetId: p.asset_id, symbol: info.symbol, name: info.name, category: info.category, isin: info.isin, assetKey: info.isAsset ? info.symbol : null, balance: finite(p.balance?.value), availableBalance: finite(p.available_balance?.value), investedAmount: euro(p.invested_amount), averageBuyPrice: euro(p.average_buy_price), currentValue: euro(p.currency_balance), totalReturn: euro(p.total_return), totalReturnPercent: finite(p.total_return_percent) };
  });
  const extras = costs.filter(c => !c.includedTradeId);
  const checkCounts = ledger.reduce((counts, row) => { counts[row.balanceCheck]++; return counts; }, { matched: 0, difference: 0, unverified: 0 });
  return { available: true, metadataErrors, portfolioAvailable: !portfolioError, portfolioError, ledger: ledger.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.order ?? 0) - (a.order ?? 0)), balanceChecks: checkCounts, costs, additionalCostsEur: sumEur(extras), unvaluedCosts: extras.filter(c => c.eurAmount == null).length, sourceTax: { totalPaid: sourceTax.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100, events: sourceTax }, rewards, rewardGroups: [...rewardGroups.values()], portfolio: portfolioRows, specialOperations: [...operationMap.values()].filter(o => SPECIAL.has(o.operation_type)).map(o => ({ id: o.operation_id, type: o.operation_type, label: LABELS[o.operation_type], date: o.transactions?.[0]?.credited_at, transactionIds: (o.transactions || []).map(t => t.transaction_id) })), coverage: { operations: operationMap.size, transactions: lookup.size, firstDate: ledger.at(-1)?.date || null, lastDate: ledger[0]?.date || null } };
}

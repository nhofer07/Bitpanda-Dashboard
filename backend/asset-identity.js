const upper = value => String(value || '').trim().toUpperCase();

export function catalogCategory(item = {}) {
  const text = `${item.group || ''} ${item.type || ''}`.toLowerCase();
  if (/crypto|coin|token/.test(text)) return 'crypto';
  if (/etf/.test(text)) return 'etf';
  if (/metal|commodity/.test(text)) return 'metal';
  if (/equity|security|stock/.test(text)) return 'stock';
  return 'other';
}

// A trade's asset leg identifies the instrument. A symbol alone cannot
// distinguish Pi Network from Impinj, or the crypto index BC8 from Bechtle.
export function enrichTradeAssetIdentity(trades, operations, catalog) {
  const byId = new Map(catalog.map(item => [item.id, item]));
  const tradeAssets = new Map();
  for (const operation of operations) for (const tx of operation.transactions || []) {
    const item = byId.get(tx.asset_id || tx.asset_amount?.asset_id);
    if (!item || !tx.trade?.trade_id) continue;
    if (!tradeAssets.has(tx.trade.trade_id)) tradeAssets.set(tx.trade.trade_id, new Map());
    tradeAssets.get(tx.trade.trade_id).set(item.id, item);
  }
  return trades.map(trade => {
    const a = trade.attributes || {};
    const symbol = upper(a.cryptocoin_symbol || a.asset_symbol || a.symbol);
    const direct = byId.get(a.asset_id) || byId.get(a.instrument_id) || byId.get(a.cryptocoin_id);
    const linked = [...(tradeAssets.get(trade.id)?.values() || [])].filter(item => upper(item.symbol) === symbol);
    const item = direct && upper(direct.symbol) === symbol ? direct : linked.length === 1 ? linked[0] : null;
    if (!item) return trade;
    return { ...trade, attributes: { ...a, catalogAsset: { id: item.id, name: item.name, isin: item.isin || null, category: catalogCategory(item) } } };
  });
}

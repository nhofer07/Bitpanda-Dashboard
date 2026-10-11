export function compactWidgetData(data, cashflowOverrides, now = Date.now()) {
  const cutoff = now - 48 * 60 * 60 * 1000;
  const all = (data.snapshots || []).filter(p => Date.parse(p.createdAt) >= Date.parse(data.portfolioHistoryStartedAt || 0)).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const previous = all.filter(p => Date.parse(p.createdAt) < cutoff).at(-1);
  const snapshots = all.filter(p => Date.parse(p.createdAt) >= cutoff);
  if (previous) snapshots.unshift(previous);
  return {
    loadedAt: data.loadedAt, portfolioHistoryStartedAt: data.portfolioHistoryStartedAt,
    portfolio: { totalValue: data.portfolio.totalValue },
    snapshots: snapshots.map(({createdAt,totalValue}) => ({createdAt,totalValue})),
    transactions: (data.transactions || []).filter(t => Date.parse(t.attributes?.time?.date_iso8601 || t.attributes?.created_at || t.created_at) >= cutoff).map(t => ({
      id: t.id, created_at: t.created_at,
      attributes: { type:t.attributes?.type, in_or_out:t.attributes?.in_or_out, amount:t.attributes?.amount, created_at:t.attributes?.created_at, time:t.attributes?.time }
    })),
    cashflowOverrides: cashflowOverrides?.overrides || cashflowOverrides || {},
    cache: data.cache
  };
}

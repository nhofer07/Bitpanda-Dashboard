const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const symbolOf = row => String(row.assetKey || row.name || '').toUpperCase();

// These are the account's reported balances, not a second pool of holdings.
// Replace quantities rather than adding Fusion/legacy quantities together.
export function applyReportedPortfolio(positions, reported, historyAssets = []) {
  const bySymbol = new Map(positions.map(position => [symbolOf(position), { ...position }]));
  for (const row of reported || []) {
    if (!row.assetKey || !valid(row.balance)) continue;
    const symbol = row.assetKey.toUpperCase();
    if (row.balance === 0) { bySymbol.delete(symbol); continue; }
    const existing = bySymbol.get(symbol) || historyAssets.find(position => symbolOf(position) === symbol) || {
      assetKey: symbol, name: symbol, displayName: row.name || symbol, trades: [], realizedProfit: 0
    };
    const reportedAverage = valid(row.averageBuyPrice) ? row.averageBuyPrice : null;
    const average = reportedAverage ?? (valid(existing.averageRemainingCost) ? existing.averageRemainingCost : null);
    const costBasis = valid(row.investedAmount) ? row.investedAmount : average == null ? null : average * row.balance;
    const historyQuantity = Number(existing.currentQuantity);
    const historyMatches = Number.isFinite(historyQuantity) && Math.abs(historyQuantity - row.balance) <= Math.max(0.00000002, row.balance * 1e-8);
    const historicalAcquisitionCost = historyMatches && valid(existing.costBasis) && valid(existing.remainingFeeCostBasis ?? existing.feeCostBasis)
      ? existing.costBasis + (existing.remainingFeeCostBasis ?? existing.feeCostBasis) : null;
    bySymbol.set(symbol, {
      ...existing,
      assetKey: symbol, currentQuantity: row.balance,
      ...(row.category && row.category !== "other" ? { displayName: row.name || existing.displayName, metadataCategory: row.category, category: row.category } : {}),
      isin: row.isin || existing.isin || null,
      availableQuantity: valid(row.availableBalance) ? row.availableBalance : null,
      averageRemainingCost: average, costBasis,
      reportedAssetId: row.assetId || null,
      reportedCurrentValue: valid(row.currentValue) ? row.currentValue : null,
      reportedTotalReturn: typeof row.totalReturn === 'number' && Number.isFinite(row.totalReturn) ? row.totalReturn : null,
      reportedTotalReturnPercent: typeof row.totalReturnPercent === 'number' && Number.isFinite(row.totalReturnPercent) ? row.totalReturnPercent : null,
      historicalAcquisitionCost,
      reportedAverageBuyPrice: reportedAverage,
      reportedInvestedAmount: valid(row.investedAmount) ? row.investedAmount : null,
      averageEntrySource: reportedAverage == null ? 'Trade-Historie' : 'Bitpanda Portfolio API',
      positionSource: 'Bitpanda Portfolio API', walletReconciled: true,
      manualPosition: false, manualMode: null, manualQuantity: null, manualCostBasis: null, manualNote: ''
    });
  }
  return [...bySymbol.values()];
}

// Portfolio balances are an account valuation snapshot. A separately fetched
// ticker must never replace those reported EUR values with a different quote.
export function valueOpenPosition(position, ticker, updatedAt = new Date().toISOString()) {
  const quantity = Number(position.currentQuantity);
  const reported = position.positionSource === 'Bitpanda Portfolio API' && valid(position.reportedCurrentValue)
    ? position.reportedCurrentValue : null;
  const tickerPrice = ticker?.currency === 'EUR' && Number.isFinite(Number(ticker.price)) && Number(ticker.price) > 0 ? Number(ticker.price) : null;
  const currentValue = reported ?? (tickerPrice != null && Number.isFinite(quantity) && quantity >= 0 ? quantity * tickerPrice : null);
  const accountTicker = ticker?.accountAssetId === position.reportedAssetId && Boolean(position.reportedAssetId) && tickerPrice != null;
  const currentPrice = reported != null ? (accountTicker ? tickerPrice : null) : tickerPrice;
  const costBasis = valid(position.costBasis) ? position.costBasis : null;
  const reportedReturn = reported != null && typeof position.reportedTotalReturn === "number" && Number.isFinite(position.reportedTotalReturn) ? position.reportedTotalReturn : null;
  const reportedPercent = reported != null && typeof position.reportedTotalReturnPercent === "number" && Number.isFinite(position.reportedTotalReturnPercent) ? position.reportedTotalReturnPercent : null;
  const unrealizedProfit = reportedReturn ?? (currentValue != null && costBasis != null ? currentValue - costBasis : null);
  return {
    currentValue, currentPrice, unrealizedProfit,
    unrealizedProfitPercent: reportedPercent ?? (unrealizedProfit != null && costBasis > 0 ? unrealizedProfit / costBasis * 100 : null),
    priceCurrency: currentValue == null ? null : 'EUR',
    priceSource: reported != null ? 'Bitpanda Portfolio API' : tickerPrice != null ? 'Bitpanda Price Ticker · Ersatzbewertung' : null,
    priceUpdatedAt: currentValue == null ? null : updatedAt,
    valuationFallback: reported == null,
    tickerPrice,
    unitPriceUnavailable: reported != null && !accountTicker,
    // The API can retain more precision in its return fields than in EUR balances.
    reportedTotalReturn: position.reportedTotalReturn ?? null,
    reportedTotalReturnPercent: position.reportedTotalReturnPercent ?? null
  };
}

export function accountAssetTicker(payload, assetId, eurCurrencyId, metadata = {}) {
  const item = payload?.data;
  const price = Number(item?.price);
  if (!assetId || !eurCurrencyId || item?.asset_id !== assetId || item?.currency_id !== eurCurrencyId || !Number.isFinite(price) || price <= 0) return null;
  return { ...metadata, price, currency: 'EUR', accountAssetId: assetId };
}

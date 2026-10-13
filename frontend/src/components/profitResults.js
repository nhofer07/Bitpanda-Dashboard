export function getProfitValue(asset, mode) {
  const realized = Number(asset.netRealizedProfit ?? asset.realizedProfit ?? 0);
  const unrealized = Number(asset.unrealizedProfit ?? 0);
  return mode === 'unrealized' ? unrealized : mode === 'combined' ? realized + unrealized : realized;
}

export function realizedTradingFees(asset) {
  return (asset.trades || []).filter(trade => trade.type === 'sell')
    .reduce((sum, trade) => sum + Number(trade.tradingFee || 0) + Number(trade.allocatedBuyFee || 0), 0);
}

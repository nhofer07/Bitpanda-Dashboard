export const MARKET_WATCHLIST_KEY = "bitpanda-dashboard-market-watchlist";

export function readMarketWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(MARKET_WATCHLIST_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeMarketWatchlist(items) {
  try {
    localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify(items));
  } catch {
    // The watchlist remains usable for the current session without storage.
  }
}

export function addMarketWatchlistItem(items, asset) {
  const symbol = String(asset?.symbol || asset?.assetKey || "").toUpperCase();
  if (!symbol || items.some(item => item.symbol === symbol)) return items;
  return [...items, {
    symbol,
    name: asset.name || asset.displayName || symbol,
    category: asset.category || "other",
    ...(asset.isin ? { isin: asset.isin } : {})
  }];
}

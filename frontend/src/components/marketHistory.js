// Share one chart snapshot across cockpit cards and asset details for each
// refresh cycle. Keep requests alive during navigation so an unmount cannot
// cancel the snapshot the next view needs.
const snapshots = new Map();

export function loadMarketHistorySnapshot(asset, range, refresh, retry = 0) {
  const symbol = String(asset.symbol || asset.assetKey || "").trim().toUpperCase();
  const name = asset.displayName || asset.name || symbol;
  const category = asset.category || "other";
  const source = asset.chartSource || "market";
  const params = new URLSearchParams({ symbol, name, category, range, refresh, source });
  const key = JSON.stringify([symbol, name, category, range, refresh, retry, source]);
  if (snapshots.has(key)) return snapshots.get(key);
  const request = fetch(`/api/market/history?${params}`, { cache: "no-store" }).then(async response => {
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.history)) throw new Error(result.error || "Kursverlauf nicht verfügbar.");
    return result;
  }).catch(error => {
    if (snapshots.get(key) === request) snapshots.delete(key);
    throw error;
  });
  if (snapshots.size >= 200) snapshots.delete(snapshots.keys().next().value);
  snapshots.set(key, request);
  return request;
}

export function marketDateLabel(value, now = new Date()) {
  if (!value) return "Letzter Handelstag";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Letzter Handelstag";
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const label = date.toLocaleDateString("de-DE", { day: "numeric", month: "long", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return sameDay ? `Heute · ${label}` : label;
}

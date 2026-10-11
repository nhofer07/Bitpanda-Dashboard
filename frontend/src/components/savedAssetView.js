export const SAVED_ASSET_VIEW_KEY = "bitpandaHiddenProfitLossAssets";

export function readHiddenAssets() {
  try {
    const raw = localStorage.getItem(SAVED_ASSET_VIEW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function writeHiddenAssets(assetKeys) {
  localStorage.setItem(SAVED_ASSET_VIEW_KEY, JSON.stringify([...new Set(assetKeys.map(String))]));
}

export function hideAssetKey(assetKey, hiddenAssets) {
  const key = String(assetKey || "");
  if (!key) return hiddenAssets;
  return [...new Set([...hiddenAssets.map(String), key])];
}

export function showAssetKey(assetKey, hiddenAssets) {
  const key = String(assetKey || "");
  return hiddenAssets.map(String).filter(item => item !== key);
}

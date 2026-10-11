const PROFIT_FEE_ADJUSTMENTS_KEY = "bitpanda-dashboard-profit-fee-adjustments";

export function readProfitFeeAdjustments() {
  try {
    const entries = JSON.parse(localStorage.getItem(PROFIT_FEE_ADJUSTMENTS_KEY) || "[]");
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function writeProfitFeeAdjustments(entries) {
  try {
    localStorage.setItem(PROFIT_FEE_ADJUSTMENTS_KEY, JSON.stringify(entries || []));
  } catch {
    // Fee notes remain optional if local storage is unavailable.
  }
}

export function feeAdjustmentTotal(entries, assetKey) {
  return (entries || [])
    .filter(entry => String(entry.assetKey) === String(assetKey))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.amount || 0)), 0);
}

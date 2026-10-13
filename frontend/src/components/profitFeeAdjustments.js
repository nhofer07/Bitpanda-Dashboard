import { notify } from "./actionFeedback.js";

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
    notify("Eigene Finanzierungsgebühren gespeichert.", "success", "fee-notes");
    return true;
  } catch {
    notify("Änderung übernommen, konnte aber nicht im Browser gespeichert werden. Sie bleibt nur für diese Sitzung erhalten.", "warning", "fee-notes");
    return false;
  }
}

export function feeAdjustmentTotal(entries, assetKey) {
  return (entries || [])
    .filter(entry => String(entry.assetKey) === String(assetKey))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.amount || 0)), 0);
}

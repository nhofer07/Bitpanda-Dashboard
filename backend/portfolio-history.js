import { createHash } from 'node:crypto';

// Exact fingerprint of the user-confirmed corrupt snapshot (6 Oct 2026,
// 20:07 Vienna). This also repairs its original Synology copy after deployment,
// without removing legitimate jumps or another account's point at that time.
const CONFIRMED_INVALID = new Set(['e3d8b4d527e2f753948e0b238946f47c543ca9b660c3627240698ace127a6d06']);
export function snapshotFingerprint(point) {
  return createHash('sha256').update(JSON.stringify([point.createdAt, point.totalValue, point.openCostBasis, point.unrealizedProfit, point.openPositionCount])).digest('hex');
}

// Partial API responses can fall back to trade-history quantities and temporarily
// include sold positions. Such totals must never become historical chart points.
export function portfolioSnapshotIssue(data) {
  if (data.balanceError) return 'Wallet-Bestand konnte nicht vollständig abgeglichen werden.';
  if (data.priceError) return 'Aktuelle Kurse konnten nicht vollständig geladen werden.';
  if (data.liquidBalanceError) return 'Fiat- und Cash-Guthaben konnten nicht vollständig geladen werden.';
  if (Number(data.priceSummary?.unpricedPositions || 0) > 0) return 'Für mindestens eine Position fehlt ein aktueller Kurs.';
  if (!Number.isFinite(Date.parse(data.loadedAt)) || typeof data.portfolio?.totalValue !== 'number' || !Number.isFinite(data.portfolio.totalValue) || data.portfolio.totalValue < 0) return 'Der Portfoliowert ist ungültig.';
  return null;
}

export function excludeCorrectedSnapshots(snapshots = [], corrections = [], confirmed = CONFIRMED_INVALID) {
  const excluded = new Set(corrections.map(item => Date.parse(item.createdAt)).filter(Number.isFinite));
  return snapshots.filter(point => !excluded.has(Date.parse(point.createdAt)) && !confirmed.has(snapshotFingerprint(point)));
}

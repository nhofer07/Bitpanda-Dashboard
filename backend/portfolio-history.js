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
  return excludeIsolatedPortfolioDips(snapshots.filter(point => !excluded.has(Date.parse(point.createdAt)) && !confirmed.has(snapshotFingerprint(point))));
}

// Require two readings on either side to confirm recovery. Only repair brief
// valuation dips with unchanged holdings; trades, withdrawals, sustained falls
// and an unconfirmed latest reading remain part of the history.
export function excludeIsolatedPortfolioDips(snapshots = []) {
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const invalid = new Set();
  for (let i = 2; i < ordered.length - 2; i++) {
    const point = ordered[i];
    const neighbors = [ordered[i - 2], ordered[i - 1], ordered[i + 1], ordered[i + 2]];
    const window = [...neighbors, point];
    if (!window.every(p => Number.isFinite(p.totalValue) && Number.isFinite(p.openCostBasis) && Number.isInteger(p.openPositionCount) && Number.isFinite(Date.parse(p.createdAt)))) continue;
    if (Date.parse(neighbors[3].createdAt) - Date.parse(neighbors[0].createdAt) > 10 * 60_000) continue;
    const sameHoldings = (a, b) => a.openPositionCount === b.openPositionCount && Math.abs(a.openCostBasis - b.openCostBasis) < 0.01;
    const unchanged = window.every(p => sameHoldings(p, point));
    // A buy may debit cash one API refresh before the new holding appears.
    // Confirm that the missing cash becomes cost basis in both later readings.
    const cash = p => p.totalValue - p.openCostBasis - p.unrealizedProfit;
    const settlementGap = neighbors.every(p => Number.isFinite(p.unrealizedProfit)) && Number.isFinite(point.unrealizedProfit)
      && sameHoldings(neighbors[0], point) && sameHoldings(neighbors[1], point)
      && sameHoldings(neighbors[2], neighbors[3])
      && neighbors[2].openCostBasis > point.openCostBasis
      && neighbors[2].openPositionCount >= point.openPositionCount
      && Math.abs((cash(neighbors[1]) - cash(point)) - (neighbors[2].openCostBasis - point.openCostBasis)) < 2
      && Math.abs(cash(neighbors[0]) - cash(neighbors[1])) < 1
      && Math.abs(cash(point) - cash(neighbors[2])) < 1
      && Math.abs(cash(neighbors[2]) - cash(neighbors[3])) < 1;
    if (!unchanged && !settlementGap) continue;
    const low = Math.min(...neighbors.map(p => p.totalValue));
    const high = Math.max(...neighbors.map(p => p.totalValue));
    if (low <= 0 || high - low > low * 0.003) continue;
    if (low - point.totalValue > Math.max(25, low * 0.01)) invalid.add(point);
  }
  return ordered.filter(point => !invalid.has(point));
}

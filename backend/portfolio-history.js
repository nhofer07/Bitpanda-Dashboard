import { guardedPortfolioSnapshots } from './portfolio-chart-guard.js';
import { createHash } from 'node:crypto';

// Exact fingerprint of the user-confirmed corrupt snapshot (6 Oct 2026,
// 20:07 Vienna). This also repairs its original Synology copy after deployment,
// without removing legitimate jumps or another account's point at that time.
// Also exclude six exact 14 Oct readings undervalued by the stale ETH override.
const CONFIRMED_INVALID = new Set([
  'e3d8b4d527e2f753948e0b238946f47c543ca9b660c3627240698ace127a6d06',
  'f9a364dd6f1303024980fe44ff981e06a24b08b4e235dbee4b67d0735c83c398',
  'f2cefa0cc2e3b9fef614e0ec011b4910b3c439c9fe5c1c082062810b8c14f086',
  'c2c63649219b545d412cfa2c64ef4b177989ee7abb4b666b684666b7f6f8c145',
  '58e9d885764d7ef237a53e5539d4e1fe24d8a8d579b0923c69a51fa74c3a97f6',
  '6a029892d6c66e880c4320cc4bcaf2dd9d3029471700b9691821f4b426a58207',
  'a25f2c3c919085708303fcddb837d0b6c91e9baa2fdc730e45362c2d41f14af3'
]);
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
  return reconstructConfirmedOctoberGap(guardedPortfolioSnapshots(excludeIsolatedPortfolioDips(snapshots.filter(point => !excluded.has(Date.parse(point.createdAt)) && !confirmed.has(snapshotFingerprint(point)))), { pending: false }));
}

// User-confirmed outage: 13 Oct 19:44–14 Oct 11:57 (Europe/Vienna).
// Approximate screenshot trace, calibrated to €3334.34 at 19:40 and €3357.12
// at the peak. Never replace readings or apply this to an unrelated portfolio.
export function reconstructConfirmedOctoberGap(snapshots = []) {
  const start = Date.parse('2026-10-13T19:44:00+02:00');
  const end = Date.parse('2026-10-14T11:57:00+02:00');
  const ordered = [...snapshots].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const before = ordered.filter(p => Date.parse(p.createdAt) <= start + 60_000).at(-1);
  const after = ordered.find(p => Date.parse(p.createdAt) >= end);
  if (!before || !after || Math.abs(Date.parse(before.createdAt) - start) > 120_000
      || Date.parse(after.createdAt) - end > 120_000
      || before.openPositionCount !== 8 || !Number.isFinite(before.openCostBasis) || Math.abs(before.openCostBasis - 3349.6224498834) > 0.01
      || Math.abs(before.totalValue - 3334.34) > 8 || Math.abs(after.totalValue - 3349.5) > 8) return snapshots;
  // Coordinates in the supplied 946px screenshot; x=92 is 19:40,
  // x=335 is 01:50. Preserve the visible small reversals, without inventing noise.
  const trace = [[92,1040],[98,1048],[106,999],[113,1009],[122,1000],[130,1007],[139,1000],[147,969],[155,977],[164,970],[171,975],[180,955],[188,973],[196,978],[204,962],[214,972],[225,957],[238,959],[251,951],[260,956],[270,963],[283,948],[295,952],[305,975],[317,978],[328,973],[337,979],[349,958],[357,951],[364,936],[371,954],[383,968],[393,973],[400,965],[405,975],[414,966],[430,964],[441,971],[451,953],[460,951],[469,957],[479,949],[488,939],[499,956],[509,961],[520,941],[531,944],[540,964],[548,966],[557,958],[565,969],[571,963],[575,999],[584,971],[595,970],[603,978],[612,963],[618,966],[624,908],[632,928],[641,953],[650,921],[657,902],[663,855],[675,871],[686,857],[693,854],[701,825],[707,847],[715,884],[723,883],[731,895],[738,890]];
  const reference = Date.parse('2026-10-13T19:40:00+02:00');
  const timeAt = x => reference + (x - 92) / 243 * 370 * 60_000;
  const added = [];
  for (let i = 0; i < trace.length; i++) {
    const [x, y] = trace[i];
    const time = Math.round(timeAt(x));
    if (time <= Date.parse(before.createdAt) || time >= Date.parse(after.createdAt)) continue;
    // Only fill a missing interval: an existing reading within five minutes wins.
    if (ordered.some(p => Math.abs(Date.parse(p.createdAt) - time) < 5 * 60_000)) continue;
    added.push({ createdAt: new Date(time).toISOString(), totalValue: Math.round((3334.34 + (1040 - y) / 215 * (3357.12 - 3334.34)) * 100) / 100,
      reconstructed: true, reconstructionSource: 'Bitpanda screenshot 2026-10-14' });
  }
  return [...ordered, ...added].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
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

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function importChartHistory(cache, source) {
  if (!cache || !Array.isArray(source?.snapshots) || !source.snapshots.length) {
    throw new Error('Keine gespeicherte Chart-Historie in den Quelldaten.');
  }
  const byTime = new Map();
  for (const point of source.snapshots) {
    const timestamp = Date.parse(point?.createdAt);
    if (!Number.isFinite(timestamp) || typeof point.totalValue !== 'number' || !Number.isFinite(point.totalValue)) {
      throw new Error('Ungültiger Chart-Datenpunkt; Import abgebrochen.');
    }
    const normalized = { createdAt: new Date(timestamp).toISOString(), totalValue: point.totalValue };
    for (const key of ['openCostBasis', 'unrealizedProfit', 'openPositionCount']) {
      if (typeof point[key] === 'number' && Number.isFinite(point[key])) normalized[key] = point[key];
    }
    byTime.set(timestamp, normalized);
  }
  const snapshots = [...byTime.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const sourceStart = Date.parse(source.portfolioHistoryStartedAt);
  const portfolioHistoryStartedAt = new Date(Number.isFinite(sourceStart)
    ? Math.min(sourceStart, Date.parse(snapshots[0].createdAt)) : Date.parse(snapshots[0].createdAt)).toISOString();
  return { ...cache, portfolioHistoryStartedAt, snapshots };
}

async function main() {
  const sourceFile = process.argv[2];
  if (!sourceFile) throw new Error('Aufruf: node scripts/import-chart-history.mjs <Synology-Chartdaten.json> [Datenverzeichnis]');
  const dataDir = process.argv[3] || process.env.DASHBOARD_DATA_DIR || path.join(os.homedir(), '.bitpanda-dashboard');
  const credentials = JSON.parse(await fs.readFile(path.join(dataDir, 'credentials.json'), 'utf8'));
  if (!credentials.bitpanda) throw new Error('Kein lokales Bitpanda-Konto konfiguriert.');
  const accountHash = createHash('sha256').update(credentials.bitpanda).digest('hex');
  const cacheFile = path.join(dataDir, 'accounts', accountHash, '.cache', 'dashboard-data.json');
  const original = await fs.readFile(cacheFile, 'utf8');
  const imported = importChartHistory(JSON.parse(original), JSON.parse(await fs.readFile(sourceFile, 'utf8')));
  const backupFile = `${cacheFile}.before-chart-import-${Date.now()}.bak`;
  await fs.writeFile(backupFile, original, { mode: 0o600, flag: 'wx' });
  const temporary = `${cacheFile}.import-${process.pid}`;
  await fs.writeFile(temporary, JSON.stringify(imported, null, 2), { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, cacheFile);
  console.log(JSON.stringify({ importedPoints: imported.snapshots.length, from: imported.snapshots[0].createdAt, to: imported.snapshots.at(-1).createdAt, backupCreated: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

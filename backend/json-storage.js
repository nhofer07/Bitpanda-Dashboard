import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Readers must see either the previous complete document or the next one.
export async function writeJsonAtomically(file, data) {
  const body = JSON.stringify(data, null, 2);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(body); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
    const directory = await fs.open(path.dirname(file), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

// A damaged or unreadable history is not an empty account. Abort the refresh
// instead of replacing its saved history with a new starting point.
async function readOne(file) {
  let content;
  try { content = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const data = JSON.parse(content);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.snapshots)) {
    throw new Error('Gespeicherte Portfolio-Historie ist ungültig; Aktualisierung abgebrochen.');
  }
  return data;
}

export async function readDashboardCache(file) {
  const candidates = [file, `${file}.recovery.json`];
  const archive = `${file}.backups`;
  // Daily copies are a last resort; normal reads only need the two recent files.
  const valid = [];
  let failure;
  for (const candidate of candidates) {
    try { const data = await readOne(candidate); if (data) valid.push(data); }
    catch (error) { failure ||= error; }
  }
  if (valid.length) return valid.sort((a, b) => (Date.parse(b.loadedAt) || 0) - (Date.parse(a.loadedAt) || 0))[0];
  let entries;
  try { entries = await fs.readdir(archive); }
  catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
  for (const entry of entries.filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse()) {
    try { const data = await readOne(path.join(archive, entry)); if (data) return data; }
    catch (error) { failure ||= error; }
  }
  if (failure || entries.length) throw failure || new Error('Portfolio-Sicherungen konnten nicht gelesen werden.');
  return null;
}

const pendingWrites = new Map();
export function writeDashboardCache(file, data, expectedLoadedAt) {
  const previous = pendingWrites.get(file) || Promise.resolve();
  const writing = previous.catch(() => {}).then(async () => {
    const existing = await readDashboardCache(file);
    if ((existing?.loadedAt ?? null) !== (expectedLoadedAt ?? null)) {
      throw new Error('Portfolio-Daten wurden zwischenzeitlich aktualisiert; veraltete Speicherung abgebrochen.');
    }
    if (!Array.isArray(data.snapshots) || !Number.isFinite(Date.parse(data.loadedAt)) || !Number.isFinite(Date.parse(data.portfolioHistoryStartedAt))) {
      throw new Error('Ungültiger Portfolio-Verlauf; Speicherung abgebrochen.');
    }
    if (data.snapshots.some(point => !Number.isFinite(Date.parse(point?.createdAt)) || typeof point?.totalValue !== 'number' || !Number.isFinite(point.totalValue) || point.totalValue < 0)) {
      throw new Error('Ungültiger Portfolio-Messpunkt; Speicherung abgebrochen.');
    }
    if (existing?.snapshots.length && (!data.snapshots.length || Date.parse(data.portfolioHistoryStartedAt) > Date.parse(existing.portfolioHistoryStartedAt))) {
      throw new Error('Zurücksetzen der gespeicherten Portfolio-Historie verhindert.');
    }
    const latest = points => Math.max(-Infinity, ...points.map(point => Date.parse(point.createdAt)));
    if (existing?.snapshots.length && latest(data.snapshots) < latest(existing.snapshots)) {
      throw new Error('Verlust der neuesten Portfolio-Messpunkte verhindert.');
    }
    if (existing) {
      const day = new Date(existing.loadedAt).toISOString().slice(0, 10);
      const daily = path.join(`${file}.backups`, `${day}.json`);
      try { await fs.access(daily); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await writeJsonAtomically(daily, existing); }
    }
    // Commit a second durable copy before touching the primary file. A crash
    // between these writes recovers the newer complete document automatically.
    await writeJsonAtomically(`${file}.recovery.json`, data);
    await writeJsonAtomically(file, data);
  });
  pendingWrites.set(file, writing);
  void writing.finally(() => { if (pendingWrites.get(file) === writing) pendingWrites.delete(file); }).catch(() => {});
  return writing;
}

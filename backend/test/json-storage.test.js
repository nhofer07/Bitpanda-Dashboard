import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readDashboardCache, writeDashboardCache, writeJsonAtomically } from '../json-storage.js';

test('concurrent readers never lose history during a large cache rewrite', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-storage-'));
  const file = path.join(dir, 'dashboard-data.json');
  try {
    const snapshots = Array.from({ length: 10000 }, (_, index) => ({ createdAt: index, totalValue: 100 }));
    await writeJsonAtomically(file, { snapshots, version: 0 });
    await Promise.all([
      (async () => { for (let i = 1; i <= 20; i++) await writeJsonAtomically(file, { snapshots, version: i }); })(),
      (async () => { for (let i = 0; i < 100; i++) assert.equal((await readDashboardCache(file)).snapshots.length, 10000); })()
    ]);
    assert.equal((await readDashboardCache(file)).version, 20);
    assert.deepEqual(await fs.readdir(dir), ['dashboard-data.json']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

const history = minute => ({
  loadedAt: `2026-10-14T12:${String(minute).padStart(2, '0')}:00Z`,
  portfolioHistoryStartedAt: '2026-10-14T12:00:00Z',
  snapshots: Array.from({ length: minute + 1 }, (_, i) => ({ createdAt: `2026-10-14T12:${String(i).padStart(2, '0')}:00Z`, totalValue: 100 + i }))
});

test('recovery survives corrupted or missing primary, and daily copy survives losing both recent files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-recovery-'));
  const file = path.join(dir, 'dashboard-data.json');
  try {
    await writeDashboardCache(file, history(0));
    await writeDashboardCache(file, history(1), history(0).loadedAt);
    await fs.writeFile(file, '{broken');
    assert.deepEqual(await readDashboardCache(file), history(1));
    await fs.rm(file);
    assert.deepEqual(await readDashboardCache(file), history(1));
    await fs.rm(`${file}.recovery.json`);
    assert.deepEqual(await readDashboardCache(file), history(0));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('stale concurrent commits and attempted history resets cannot replace saved points', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-guard-'));
  const file = path.join(dir, 'dashboard-data.json');
  try {
    await writeDashboardCache(file, history(0));
    const results = await Promise.allSettled([
      writeDashboardCache(file, history(1), history(0).loadedAt),
      writeDashboardCache(file, history(2), history(0).loadedAt)
    ]);
    assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected']);
    await assert.rejects(writeDashboardCache(file, { ...history(2), portfolioHistoryStartedAt: history(2).loadedAt }, history(1).loadedAt));
    await assert.rejects(writeDashboardCache(file, { ...history(2), snapshots: [] }, history(1).loadedAt));
    await assert.rejects(writeDashboardCache(file, history(0), history(1).loadedAt));
    assert.deepEqual(await readDashboardCache(file), history(1));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a newer durable recovery copy wins after a crash before the primary rename', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-crash-'));
  const file = path.join(dir, 'dashboard-data.json');
  try {
    await writeJsonAtomically(file, history(0));
    await writeJsonAtomically(`${file}.recovery.json`, history(1));
    assert.deepEqual(await readDashboardCache(file), history(1));
    await writeDashboardCache(file, history(2), history(1).loadedAt);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), history(2));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('only a missing file starts a new history; damaged files remain untouched', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-storage-'));
  const file = path.join(dir, 'dashboard-data.json');
  try {
    assert.equal(await readDashboardCache(file), null);
    for (const content of ['', '{"snapshots":', 'null', '{}']) {
      await fs.writeFile(file, content);
      await assert.rejects(readDashboardCache(file));
      assert.equal(await fs.readFile(file, 'utf8'), content);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest, dashboardFreshness } from '../src/components/dashboardRefresh.js';
test('late old responses and older server snapshots cannot replace newer data', () => {
  const requests = createLatestRequest();
  const old = requests.begin(); const latest = requests.begin();
  assert.equal(requests.accept(latest, { loadedAt: '2026-10-26T12:00:00Z' }), true);
  assert.equal(requests.accept(old, { loadedAt: '2026-10-26T12:01:00Z' }), false);
  const next = requests.begin();
  assert.equal(requests.accept(next, { loadedAt: '2026-10-26T11:59:00Z' }), false);
});
test('failed refresh, stale timestamps and missing dates never claim fresh data', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(dashboardFreshness('2026-10-26T11:59:00Z', now).stale, false);
  assert.equal(dashboardFreshness('2026-10-26T11:59:00Z', now, true).stale, true);
  assert.equal(dashboardFreshness('2026-10-26T11:55:00Z', now).stale, true);
  assert.equal(dashboardFreshness(null, now).stale, true);
});

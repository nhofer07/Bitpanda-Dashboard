import test from 'node:test';
import assert from 'node:assert/strict';
import { localPortfolioPreview } from '../local-preview.js';
const saved = { loadedAt: '2026-10-02T16:48:07.208Z', calculationVersion: 12, openPositions: [{assetKey:'BTC'}], portfolio: {totalValue:100} };
const options = { enabled:true, calculationVersion:12, now:Date.parse('2026-10-06T12:00:00Z') };
test('local preview keeps original values and timestamps and explicitly marks them as saved', () => {
 const preview = localPortfolioPreview(saved, options);
 assert.equal(preview.loadedAt, saved.loadedAt);
 assert.deepEqual(preview.portfolio, saved.portfolio);
 assert.equal(preview.cache.status, 'local-preview');
 assert.ok(preview.cache.ageMs > 0);
 assert.match(preview.cache.warning, /gespeichertem Portfolio/);
 assert.equal(saved.cache, undefined);
});
test('preview is unavailable for hosted mode, missing data, or incompatible calculations', () => {
 assert.equal(localPortfolioPreview(saved, {...options, enabled:false}), null);
 assert.equal(localPortfolioPreview(null, options), null);
 assert.equal(localPortfolioPreview({...saved, loadedAt:'invalid'}, options), null);
 assert.equal(localPortfolioPreview({...saved, calculationVersion:11}, options), null);
});

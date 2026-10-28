import test from 'node:test';
import assert from 'node:assert/strict';
import { tradingBalances, quoteValidity, createAccountLoader } from '../src/components/tradingState.js';
test('missing balances stay unavailable and total balances never stand in for spendable funds', () => {
  assert.deepEqual(tradingBalances({}, 'btc'), { owned: null, available: null, availableEur: null });
  const resources = { currencies: { ok: true, data: [{ id: 'eur', symbol: 'EUR' }] }, portfolio: { ok: true, data: [{ currency_id: 'eur', balance: '100' }, { asset_id: 'btc', balance: '3', available_balance: { value: '1' } }] } };
  assert.deepEqual(tradingBalances(resources, 'btc'), { availableEur: null, owned: 3, available: 1 });
  resources.portfolio.data[0].available_balance = '0';
  assert.equal(tradingBalances(resources, 'btc').availableEur, 0);
});
test('quotes expire at the exact boundary and unknown expiration blocks execution', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const quote = { quote: { expires_at: '2026-10-26T12:00:10Z' } };
  assert.equal(quoteValidity(quote, now).seconds, 10);
  assert.equal(quoteValidity(quote, now + 10_000).expired, true);
  assert.equal(quoteValidity({}, now).expired, true);
});
test('forced account refresh waits for an in-flight read then fetches a new account', async () => {
  let finish; let calls = 0; let now = 0;
  const load = createAccountLoader(() => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ version: calls }); }, () => now);
  const original = load(); const forced = load(true);
  finish({ version: 1 });
  assert.equal((await original).version, 1);
  assert.equal((await forced).version, 2);
  assert.equal((await load()).version, 2);
  now = 31_000;
  assert.equal((await load()).version, 3);
});

test('trading uses the held asset ID rather than the first legacy listing with the same symbol', async () => {
  const { resolveTradingAsset } = await import('../src/components/tradingState.js');
  const assets = [{ id: 'legacy', symbol: 'CAT' }, { id: 'current', symbol: 'CAT' }];
  const portfolio = [{ asset_id: 'current', balance: { value: '.5' }, available_balance: { value: '.5' } }];
  const held = { reportedAssetId: 'current' };
  assert.equal(resolveTradingAsset(assets, { symbol: 'CAT', id: 'legacy' }, held, portfolio).id, 'current');
  assert.equal(tradingBalances({ portfolio: { ok: true, data: portfolio } }, 'current').available, .5);
  assert.equal(resolveTradingAsset(assets, { symbol: 'CAT' }, null, portfolio).id, 'current');
  assert.equal(resolveTradingAsset(assets, { symbol: 'CAT' }, null), null);
  assert.equal(resolveTradingAsset(assets, { symbol: 'CAT', id: 'unknown' }, null), null);
});

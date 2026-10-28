import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogCategory, enrichTradeAssetIdentity } from '../asset-identity.js';
const catalog = [
  { id: 'pi-token', symbol: 'PI', name: 'Pi Network', type: 'cryptocoin' },
  { id: 'pi-share', symbol: 'PI', name: 'Impinj', type: 'equity_security' },
  { id: 'index', symbol: 'BC8', name: 'Bitpanda Crypto Index 8', group: 'crypto_index' },
  { id: 'share', symbol: 'BC8', name: 'Bechtle', type: 'equity_security' }
];
test('operation asset IDs distinguish colliding stock and crypto symbols', () => {
  const trades = ['pi-token', 'pi-share', 'index', 'share'].map(id => ({ id, attributes: { cryptocoin_symbol: catalog.find(a => a.id === id).symbol } }));
  const operations = trades.map(t => ({ transactions: [{ asset_id: t.id, trade: { trade_id: t.id } }, { asset_id: 'settlement', trade: { trade_id: t.id } }] }));
  const result = enrichTradeAssetIdentity(trades, operations, catalog);
  assert.deepEqual(result.map(t => t.attributes.catalogAsset.name), catalog.map(a => a.name));
  assert.deepEqual(result.map(t => t.attributes.catalogAsset.category), ['crypto', 'stock', 'crypto', 'stock']);
  assert.equal(trades[0].attributes.catalogAsset, undefined);
});
test('an ambiguous or missing asset leg never guesses an instrument from its symbol', () => {
  const trade = { id: 'trade', attributes: { cryptocoin_symbol: 'PI' } };
  assert.equal(enrichTradeAssetIdentity([trade], [], catalog)[0], trade);
  assert.equal(enrichTradeAssetIdentity([trade], [{ transactions: catalog.slice(0, 2).map(a => ({ asset_id: a.id, trade: { trade_id: 'trade' } })) }], catalog)[0], trade);
  assert.equal(catalogCategory({ group: 'equity_etf', type: 'equity_security' }), 'etf');
});

test('server metadata preserves identified names and rejects a quote for another asset class', async () => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const context = vm.createContext({ catalogCategory, normalizeSymbol: value => String(value).toUpperCase() });
  vm.runInContext(source.slice(source.indexOf('function normalizeAssetName('), source.indexOf('function getTradeAmountAsset(')), context);
  vm.runInContext(source.slice(source.indexOf('function enrichAssetWithTickerMetadata('), source.indexOf('function rebuildProfitLossTopLists(')), context);
  const identified = enrichTradeAssetIdentity([{ id: 'pi', attributes: { cryptocoin_symbol: 'PI' } }], [{ transactions: [{ asset_id: 'pi-token', trade: { trade_id: 'pi' } }] }], catalog)[0];
  assert.equal(context.getAssetCategory(identified), 'crypto');
  const result = context.enrichAssetWithTickerMetadata({ assetKey: 'PI', displayName: 'Pi Network', metadataCategory: 'crypto' }, new Map([['PI', { name: 'Impinj', type: 'equity_security', price: 200, currency: 'EUR' }]]));
  assert.equal(result.displayName, 'Pi Network');
  assert.equal(result.category, 'crypto');
  assert.equal(result.currentPrice, null);
  const fallback = context.enrichAssetWithTickerMetadata({ assetKey: 'BC8' }, new Map([['BC8', { name: 'Bechtle', type: 'equity_security', price: 30 }]]));
  assert.equal(fallback.displayName, 'Bitpanda Crypto Index 8');
  assert.equal(fallback.category, 'crypto');
  assert.equal(fallback.currentPrice, null);
});

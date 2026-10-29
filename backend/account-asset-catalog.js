// Resolve only instruments referenced by this account, rather than downloading
// every tradeable Bitpanda asset before each cold dashboard refresh.
export function createAccountAssetCatalog(fetchAsset, { now = Date.now, concurrency = 6 } = {}) {
  const cached = new Map();
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  return {
    clear() { cached.clear(); },
    async load(operations = [], portfolio = [], trades = []) {
      const ids = new Set();
      const add = id => { if (uuid(id)) ids.add(id); };
      for (const row of portfolio) add(row.asset_id);
      for (const operation of operations) for (const tx of operation.transactions || []) {
        add(tx.asset_id); add(tx.asset_amount?.asset_id); add(tx.fee_amount?.asset_id);
      }
      for (const trade of trades) { add(trade.attributes?.asset_id); add(trade.attributes?.instrument_id); add(trade.attributes?.catalogAsset?.id); }
      const requested = [...ids], result = new Array(requested.length);
      let cursor = 0;
      async function worker() {
        while (cursor < requested.length) {
          const index = cursor++, id = requested[index];
          const existing = cached.get(id);
          if (existing && now() - existing.at < 3600_000) { result[index] = existing.value; continue; }
          const value = await fetchAsset(id);
          if (value && value.id !== id) throw new Error('Bitpanda liefert unpassende Asset-Stammdaten.');
          cached.set(id, { at: now(), value }); result[index] = value;
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, requested.length) }, worker));
      return result.filter(Boolean);
    }
  };
}

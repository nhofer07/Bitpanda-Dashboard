export function resolveTradingAsset(assets, asset, held, portfolio = []) {
  const id = held?.reportedAssetId || asset.reportedAssetId || asset.id || asset.assetId;
  if (id) return assets.find(item => item.id === id) || null;
  const candidates = assets.filter(item => asset.isin ? item.isin === asset.isin : String(item.symbol).toUpperCase() === String(asset.symbol).toUpperCase());
  const owned = candidates.filter(item => portfolio.some(row => row.asset_id === item.id));
  if (owned.length === 1) return owned[0];
  // Never choose arbitrarily between two instruments with the same symbol.
  return candidates.length === 1 ? candidates[0] : null;
}

export function balanceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'object' ? value.value : value;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function tradingBalances(resources, assetId) {
  const portfolio = resources.portfolio?.ok && Array.isArray(resources.portfolio.data) ? resources.portfolio.data : null;
  const euro = resources.currencies?.ok ? resources.currencies.data?.find(item => String(item.symbol).toUpperCase() === 'EUR') : null;
  const euroItem = euro && portfolio?.find(item => item.currency_id === euro.id && !item.asset_id);
  const position = assetId ? portfolio?.find(item => item.asset_id === assetId) : null;
  return {
    // No fallback from total balance: it can include reserved funds.
    availableEur: balanceValue(euroItem?.available_balance),
    owned: balanceValue(position?.balance),
    available: balanceValue(position?.available_balance)
  };
}

export function quoteValidity(quote, now = Date.now()) {
  const raw = quote?.quote?.expires_at ?? quote?.expires_at;
  const expiresAt = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
  const known = Number.isFinite(expiresAt);
  return { known, expired: !known || now >= expiresAt, seconds: known ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null };
}

export function createAccountLoader(request, now = Date.now) {
  let cached = null;
  let cachedAt = 0;
  let pending = null;
  return async function load(refresh = false) {
    // A forced read must not reuse an older in-flight request.
    if (refresh && pending) { try { await pending; } catch { /* Retry below. */ } }
    if (!refresh && cached && now() - cachedAt < 30_000) return cached;
    if (!pending) {
      pending = request().then(data => { cached = data; cachedAt = now(); return data; }).finally(() => { pending = null; });
    }
    return pending;
  };
}

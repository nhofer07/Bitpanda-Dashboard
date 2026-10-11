export function normalizeCatalog(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item.symbol || !item.name) continue;
    const group = String(item.group || '').toLowerCase();
    const type = String(item.type || '').toLowerCase();
    const category = group.includes('etf') || type.includes('etf') ? 'etf' : group.includes('stock') ? 'stock' : /coin|token|crypto/.test(group + ' ' + type) ? 'crypto' : /metal|commodity/.test(group + ' ' + type) ? 'metal' : /equity|security|stock/.test(type) ? 'stock' : 'other';
    const symbol = String(item.symbol).toUpperCase();
    const value = { symbol, name: item.name, isin: item.isin || '', category, buyActive: item.buy_active == null ? null : Boolean(item.buy_active), type };
    const previous = unique.get(symbol);
    if (!previous || (value.buyActive === true && previous.buyActive !== true) || (value.buyActive === previous.buyActive && type === 'equity_security')) unique.set(symbol, value);
  }
  return [...unique.values()];
}
export function searchCatalog(items, query, category = 'all') {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return [];
  const rank = item => item.symbol.toLowerCase() === clean || item.isin.toLowerCase() === clean ? 0 : item.name.toLowerCase() === clean ? 1 : item.symbol.toLowerCase().startsWith(clean) ? 2 : item.name.toLowerCase().startsWith(clean) ? 3 : 4;
  return items.filter(item => (category === 'all' || item.category === category) && [item.symbol,item.name,item.isin].some(value => value.toLowerCase().includes(clean)))
    .sort((a,b) => rank(a) - rank(b) || Number(b.buyActive) - Number(a.buyActive) || a.name.localeCompare(b.name));
}
export async function loadAssetCatalog(apiKey, fetchImpl = fetch) {
  const items = [];
  const cursors = new Set();
  let cursor = '';
  for (let page = 0; page < 150; page++) {
    const url = new URL('https://developer.bitpanda.com/v1/ticker');
    url.search = new URLSearchParams({ page_size: '500', ...(cursor ? { cursor } : {}) });
    const response = await fetchImpl(url, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 429 ? 'Bitpanda-Abfragelimit erreicht. Bitte die Suche später erneut versuchen.' : response.status === 401 ? 'Der Bitpanda-Schlüssel benötigt die Berechtigung Trading für die Asset-Suche.' : 'Der Bitpanda-Assetkatalog konnte nicht geladen werden.');
    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error('Bitpanda hat einen ungültigen Assetkatalog geliefert.');
    items.push(...data.data);
    if (!data.has_next_page) return normalizeCatalog(items);
    if (!data.next_cursor || cursors.has(data.next_cursor)) throw new Error('Der Bitpanda-Assetkatalog konnte nicht vollständig geladen werden.');
    cursor = data.next_cursor; cursors.add(cursor);
  }
  throw new Error('Der Bitpanda-Assetkatalog überschreitet die unterstützte Größe.');
}

const DAY = 86400000;
export const HISTORY_RANGES = { '1d': 1, '1w': 7, '1mo': 31, '6mo': 184, '1y': 366, '5y': 1827, '10y': 3653, max: null };
const INTRADAY_RANGES = {
  '1d': { interval: '5m', yahooRange: '1d' },
  '1w': { interval: '15m', yahooRange: '5d' }
};
// Prefer EUR-listed instruments for the dashboard.  McDonald's is traded in
// the US as MCD, but Yahoo's Xetra listing is MDO.DE and already reports EUR.
// Using the EUR listing keeps the quote cards and every chart on one currency
// and avoids mixing a delayed FX conversion with the displayed price.
const ALIASES = { SPYY: 'SPYY.DE', FB: 'META', MCD: 'MDO.DE', RDSA: 'SHEL', RHM: 'RHM.DE', XAU: 'GC=F' };
const COINS = { VSN: 'vision-3' };
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const fxCache = new Map();
export function resolveMarketSymbol(symbol, category, name = '') {
  const normalized = String(symbol).trim().toUpperCase();
  if (category === 'crypto') return /-(EUR|USD)$/.test(normalized) ? normalized : `${normalized}-EUR`;
  // Bitpanda listings can use an internal or venue-specific symbol. Resolve
  // McDonald's by its company name too, so Yahoo search cannot pick the
  // similarly named Japanese McDonald's Holdings listing (~€10/share).
  if (/\bmcdonald/i.test(String(name))) return 'MDO.DE';
  return ALIASES[normalized] || normalized.replace(/-US$/, '');
}
export function extractHistory(result) {
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return (result?.timestamp || []).flatMap((timestamp, index) => Number.isFinite(timestamp) && typeof closes[index] === 'number' && Number.isFinite(closes[index]) && closes[index] > 0
    ? [{ date: new Date(timestamp * 1000).toISOString(), close: closes[index] }] : []).sort((a,b) => a.date.localeCompare(b.date));
}
export function latestIntradaySession(history) {
  const byDay = new Map();
  for (const point of history) {
    const day = point.date.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(point);
  }
  const sessions = [...byDay.values()];
  const latest = sessions.at(-1) || [];
  // At market open, retain the first new quote instead of selecting yesterday.
  // The preceding close supplies a baseline until the second bar arrives.
  return latest.length === 1 && sessions.length > 1
    ? [sessions.at(-2).at(-1), ...latest]
    : latest;
}
export function convertHistoryToEur(history, rawCurrency, rates = {}) {
  const minorUnit = rawCurrency === 'GBp' || rawCurrency === 'GBX' ? .01 : rawCurrency === 'ZAc' ? .01 : 1;
  const currency = rawCurrency === 'GBp' || rawCurrency === 'GBX' ? 'GBP' : rawCurrency === 'ZAc' ? 'ZAR' : rawCurrency.toUpperCase();
  if (currency === 'EUR') return history;
  const sorted = Object.entries(rates).filter(([,rate]) => Number.isFinite(rate.EUR) && rate.EUR > 0).sort(([a],[b]) => a.localeCompare(b));
  let index = -1;
  return history.flatMap(point => {
    const day = point.date.slice(0,10);
    while (index + 1 < sorted.length && sorted[index + 1][0] <= day) index++;
    // Use only an already published rate, including weekends; never a future rate.
    if (index < 0 || Date.parse(day) - Date.parse(sorted[index][0]) > 7 * DAY) return [];
    return [{ date: point.date, close: point.close * minorUnit * sorted[index][1].EUR }];
  });
}
export function normalizeMarketUnit(history, symbol) {
  if (String(symbol).trim().toUpperCase() !== 'XAU') return history;
  return history.map(point => ({ ...point, close: point.close / GRAMS_PER_TROY_OUNCE }));
}
async function jsonRequest(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Kursdatenquelle nicht verfügbar (HTTP ${response.status}).`);
  return response.json();
}
function nameTokens(value) {
  const ignored = new Set(['ag','sa','se','inc','ltd','plc','corp','corporation','company','class','aktie','stock','etf','the']);
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]{3,}/g)?.filter(token => !ignored.has(token)) || [];
}
export function selectYahooSearchMatch(quotes, { name, category }) {
  const wanted = new Set(nameTokens(name));
  const allowedTypes = category === 'crypto' ? new Set(['CRYPTOCURRENCY']) : category === 'etf' ? new Set(['ETF']) : category === 'metal' ? new Set(['FUTURE']) : new Set(['EQUITY']);
  return (quotes || []).map(quote => {
    if (!quote?.symbol || !allowedTypes.has(String(quote.quoteType || '').toUpperCase())) return null;
    const candidate = new Set(nameTokens(`${quote.longname || ''} ${quote.shortname || ''}`));
    const matches = [...wanted].filter(token => candidate.has(token)).length;
    if (!matches) return null;
    const eurBonus = String(quote.currency || '').toUpperCase() === 'EUR' ? 2 : 0;
    return { symbol: quote.symbol, score: matches * 10 + eurBonus };
  }).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.symbol || '';
}
async function discoverYahooSymbol({ symbol, name, category, fetchImpl }) {
  if (!name) return '';
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.search = new URLSearchParams({ q: name, quotesCount: '12', newsCount: '0' });
  try {
    const data = await jsonRequest(url, fetchImpl);
    return selectYahooSearchMatch(data.quotes, { name, category });
  } catch { return ''; }
}
export async function loadMarketHistory({ symbol, name = '', category = 'other', range = '1y', fetchImpl = fetch, now = Date.now() }) {
  if (!Object.hasOwn(HISTORY_RANGES, range)) throw new Error('Ungültiger Zeitraum.');
  const interval = INTRADAY_RANGES[range]?.interval || '1d';
  const extendedHours = Boolean(INTRADAY_RANGES[range]) && !['crypto', 'metal'].includes(category);
  if (category === 'crypto' && COINS[symbol]) {
    const days = Math.min(HISTORY_RANGES[range] || 365, 365);
    const url = new URL(`https://api.coingecko.com/api/v3/coins/${COINS[symbol]}/market_chart`);
    const params = { vs_currency: 'eur', days: String(days) };
    if (!INTRADAY_RANGES[range]) params.interval = 'daily';
    url.search = new URLSearchParams(params);
    const data = await jsonRequest(url, fetchImpl);
    const history = (data.prices || []).filter(([stamp, price]) => Number.isFinite(stamp) && Number.isFinite(price) && price > 0).map(([stamp, close]) => ({ date: new Date(stamp).toISOString(), close }));
    if (history.length < 2) throw new Error('Für dieses Asset sind derzeit nicht genügend historische Kurse verfügbar.');
    return { symbol, range, interval, currency: 'EUR', sourceCurrency: 'EUR', history, source: 'CoinGecko', note: ['5y','10y','max'].includes(range) ? 'Diese Datenquelle liefert ohne zusätzlichen API-Key höchstens die letzten 365 Tage. Angezeigt wird die verfügbare Historie.' : '' };
  }
  let yahooSymbol = resolveMarketSymbol(symbol, category, name);
  let result;
  let usedClosedMarketFallback = false;
  const yahooRanges = range === '1d' ? ['1d', '5d'] : [INTRADAY_RANGES[range]?.yahooRange];
  async function fetchYahooChart(candidate) {
    let best = null;
    for (const yahooRange of yahooRanges) {
      for (const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
        try {
          const url = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(candidate)}`);
          url.search = INTRADAY_RANGES[range]
            ? new URLSearchParams({ interval, range: yahooRange, ...(extendedHours ? { includePrePost: 'true' } : {}) })
            : new URLSearchParams({ interval, period1: String(range === 'max' ? 0 : Math.floor((now - HISTORY_RANGES[range] * DAY) / 1000)), period2: String(Math.floor(now / 1000)) });
          const candidateResult = (await jsonRequest(url, fetchImpl))?.chart?.result?.[0];
          const providerName = `${candidateResult?.meta?.longName || ''} ${candidateResult?.meta?.shortName || ''}`;
          const expectedTokens = nameTokens(name);
          const providerTokens = new Set(nameTokens(providerName));
          const nameMatches = !name || category === 'crypto' || !providerTokens.size || expectedTokens.some(token => providerTokens.has(token));
          const points = extractHistory(candidateResult);
          if (points.length >= 2 && nameMatches && typeof candidateResult?.meta?.currency === 'string' && /^[A-Za-z]{3}$/.test(candidateResult.meta.currency)) {
            const loaded = { result: candidateResult, fallback: range === '1d' && yahooRange === '5d' };
            const lastTime = Date.parse(points.at(-1).date);
            if (!best || lastTime > Date.parse(extractHistory(best.result).at(-1).date)) best = loaded;
            // A newer quote in the provider metadata means the bars lag behind.
            // Try the other host/range before settling for an older session.
            const quoteTime = Number(candidateResult.meta?.regularMarketTime) * 1000;
            if (range !== '1d' || !Number.isFinite(quoteTime) || quoteTime - lastTime <= 30 * 60 * 1000) return best;
          }
        } catch { /* Another host, range, or discovered listing may recover the request. */ }
      }
    }
    return best;
  }
  let loaded = await fetchYahooChart(yahooSymbol);
  const fixedListing = yahooSymbol === 'MDO.DE';
  if (!loaded && !fixedListing) {
    const discovered = await discoverYahooSymbol({ symbol, name, category, fetchImpl });
    if (discovered && discovered !== yahooSymbol) {
      yahooSymbol = discovered;
      loaded = await fetchYahooChart(yahooSymbol);
    }
  }
  if (loaded) {
    result = loaded.result;
    usedClosedMarketFallback = loaded.fallback;
  }
  let history = extractHistory(result);
  if (usedClosedMarketFallback) history = latestIntradaySession(history);
  if (history.length < 2) throw new Error(`Für ${symbol} liefert die Kursdatenquelle derzeit keine ausreichende Historie. Der aktuelle Bitpanda-Kurs kann trotzdem verfügbar sein.`);
  const sourceCurrency = result.meta?.currency;
  if (!sourceCurrency) throw new Error('Die Kursdatenquelle meldet keine Währung. Eine sichere EUR-Umrechnung ist nicht möglich.');
  const originalCount = history.length;
  if (sourceCurrency !== 'EUR') {
    const currency = ['GBp','GBX'].includes(sourceCurrency) ? 'GBP' : sourceCurrency === 'ZAc' ? 'ZAR' : sourceCurrency.toUpperCase();
    const start = new Date(Math.max(Date.parse(history[0].date) - 7 * DAY, Date.parse('1999-01-04'))).toISOString().slice(0,10);
    const end = history.at(-1).date.slice(0,10);
    if (start > end) throw new Error('Für diesen Zeitraum sind keine historischen EUR-Wechselkurse verfügbar.');
    const cacheKey = `${currency}:${start}:${end}`;
    let rates;
    const cached = fxCache.get(cacheKey);
    if (fetchImpl === fetch && cached && now - cached.time < 3600000) rates = cached.rates;
    else {
      const url = new URL(`https://api.frankfurter.app/${start}..${end}`);
      url.search = new URLSearchParams({ from: currency, to: 'EUR' });
      try { rates = (await jsonRequest(url, fetchImpl)).rates; }
      catch { throw new Error(`Historische ${currency}/EUR-Wechselkurse konnten nicht geladen werden. Bitte erneut versuchen.`); }
      if (!rates || typeof rates !== 'object') throw new Error('Historische EUR-Wechselkurse fehlen.');
      if (fetchImpl === fetch) {
        if (fxCache.size >= 40) fxCache.delete(fxCache.keys().next().value);
        fxCache.set(cacheKey, { time: now, rates });
      }
    }
    history = convertHistoryToEur(history, sourceCurrency, rates);
    if (history.length < 2) throw new Error('Für diesen Zeitraum sind keine passenden EUR-Wechselkurse verfügbar.');
  }
  history = normalizeMarketUnit(history, symbol);
  const truncated = history.length < originalCount;
  // Keep actual dates and endpoint values when reducing long series for display.
  const stride = Math.max(1, Math.ceil(history.length / 1500));
  history = history.filter((_, index, all) => index % stride === 0 || index === all.length - 1);
  const unit = String(symbol).trim().toUpperCase() === 'XAU' ? 'g' : null;
  return { symbol, resolvedSymbol: yahooSymbol, range, interval, extendedHours, sampled: stride > 1, currency: 'EUR', unit, sourceCurrency, history,
    source: sourceCurrency === 'EUR' ? 'Yahoo Finance' : 'Yahoo Finance · historische EUR-Wechselkurse: Frankfurter / EZB',
    note: [
      extendedHours ? 'Inklusive verfügbarer Vor- und Nachbörsenkurse; diese können vom regulären Börsenkurs abweichen.' : '',
      unit === 'g' ? 'Goldverlauf in EUR je Gramm; die Marktdatenquelle liefert ursprünglich je Feinunze.' : '',
      truncated ? 'Der Verlauf ist auf Zeitpunkte mit verfügbaren historischen EUR-Wechselkursen begrenzt.' : ''
    ].filter(Boolean).join(' ') };
}

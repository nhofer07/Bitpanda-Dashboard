import { loadMarketHistory } from './market-history.js';

// Same public OHLC feed used by bitpanda.com asset price pages.
const periods = { '1d': 'day', '1w': 'week', '1mo': 'month', '6mo': '6m', '1y': 'year', '5y': '5y' };
async function request(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Bitpanda-Kursverlauf nicht verfügbar (HTTP ${response.status}).`);
  return response.json();
}
export async function loadBitpandaChart(options) {
  if (!periods[options.range] && !['10y', 'max'].includes(options.range)) throw new Error('Dieser Zeitraum wird vom Bitpanda-Chart nicht unterstützt.');
  const longRange = ['10y', 'max'].includes(options.range);
  try {
    if (longRange) return await loadLongHistory(options);
    return await loadOriginalChart(options);
  } catch (primaryError) {
    try {
      if (!longRange) {
        const result = await loadMarketHistory(options);
        return { ...result, note: `Bitpanda liefert für dieses Asset keine verwendbare Historie. Ersatzquelle: ${result.source}. ${result.note || ''}` };
      }
      const result = await loadOriginalChart({ ...options, range: '5y' });
      return { ...result, range: options.range, note: `Die längere Markthistorie ist derzeit nicht verfügbar. Angezeigt wird die verfügbare Bitpanda-Historie bis zu fünf Jahren. ${result.note}` };
    } catch {
      throw new Error(`Für ${options.symbol} ist derzeit bei keiner Kursquelle eine verlässliche EUR-Historie verfügbar. Bitte später erneut versuchen.`);
    }
  }
}
async function loadLongHistory(options) {
  const result = await loadMarketHistory(options);
  return { ...result, note: `Für diesen langen Zeitraum wird die verfügbare Historie von ${result.source} verwendet. ${result.note || ''}` };
}
async function loadOriginalChart({ symbol, name = '', category, range, fetchImpl = fetch }) {
  if (!periods[range]) throw new Error('Dieser Zeitraum wird vom Bitpanda-Chart nicht unterstützt.');
  const catalog = await request(`https://api.bitpanda.com/v3/assets?${new URLSearchParams({ q: symbol.replace(/-US$/i, ''), page_size: '100' })}`, fetchImpl);
  const groups = { crypto: ['coin', 'cryptocoin'], stock: ['stock', 'equity_stock'], etf: ['etf'], metal: ['metal'] };
  const matches = (catalog.data || []).map(row => row.attributes).filter(row => row?.symbol?.toUpperCase() === symbol.replace(/-US$/i, '').toUpperCase());
  const categorized = groups[category] ? matches.filter(row => groups[category].includes(row.group)) : matches;
  const candidates = categorized.length ? categorized : matches;
  if (candidates.length !== 1 || !candidates[0].pid) throw new Error('Kein eindeutiger Bitpanda-Kursverlauf für dieses Asset verfügbar.');
  const result = await request(`https://api.bitpanda.com/v3/ohlc/${encodeURIComponent(candidates[0].pid)}/EUR/${periods[range]}`, fetchImpl);
  let history = (result.data || []).flatMap(row => {
    const value = row.attributes;
    const stamp = Date.parse(value?.time?.date_iso8601);
    const close = Number(value?.close);
    return Number.isFinite(stamp) && Number.isFinite(close) && close > 0 ? [{ date: new Date(stamp).toISOString(), close }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  history = [...new Map(history.map(point => [point.date, point])).values()];
  if (range === '6mo' && history.length) {
    const cutoff = Date.parse(history.at(-1).date) - 184 * 86400000;
    history = history.filter(point => Date.parse(point.date) >= cutoff);
  }
  if (history.length < 2) throw new Error('Bitpanda liefert für diesen Zeitraum keine ausreichende Kurshistorie.');
  return { symbol, range, history, currency: 'EUR', sourceCurrency: 'EUR', source: 'Bitpanda · Original-Kursdaten', interval: ['1d', '1w'].includes(range) ? 'intraday' : '1d', unit: category === 'metal' ? 'g' : undefined, note: 'Kursanzeige und tatsächlicher Ausführungspreis können durch Spread und Gebühren abweichen.' };
}

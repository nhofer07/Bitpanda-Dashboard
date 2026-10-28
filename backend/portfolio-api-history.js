export const PORTFOLIO_TIMEFRAMES = { '1d': 'DAY', '1w': 'WEEK', '1m': 'MONTH', '6m': 'SIX_MONTH', '1y': 'YEAR' };
const finite = value => value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);

export function normalizePortfolioHistory(payload, { timeframe, eurCurrencyId, now = Date.now() }) {
  if (!Object.values(PORTFOLIO_TIMEFRAMES).includes(timeframe)) throw new Error('Ungültiger Portfolio-Zeitraum.');
  const rows = payload?.data?.datapoints;
  if (!eurCurrencyId || !Array.isArray(rows)) throw new Error('Bitpanda liefert keinen verwendbaren Portfolioverlauf.');
  const byTime = new Map();
  for (const row of rows) {
    const time = Date.parse(row.time);
    const value = finite(row.value?.value);
    if (!Number.isFinite(time) || time > now + 300_000 || value == null || value < 0 || row.value?.currency_id !== eurCurrencyId || row.value?.asset_id) {
      throw new Error('Der Bitpanda-Portfolioverlauf enthält ungültige Zeit- oder EUR-Werte.');
    }
    if (byTime.has(time) && byTime.get(time).totalValue !== value) throw new Error('Bitpanda liefert widersprüchliche Portfolio-Messpunkte.');
    byTime.set(time, { createdAt: new Date(time).toISOString(), totalValue: value });
  }
  const snapshots = [...byTime.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (snapshots.length < 2) throw new Error('Bitpanda liefert für diesen Zeitraum noch zu wenige Portfolio-Messpunkte.');
  const last = snapshots.at(-1).createdAt;
  const maxLag = { DAY: 45 * 60_000, WEEK: 3 * 3600_000, MONTH: 12 * 3600_000, SIX_MONTH: 48 * 3600_000, YEAR: 4 * 86400_000 }[timeframe];
  return { available: true, timeframe, snapshots, currency: 'EUR', source: 'Bitpanda · Portfolio-Historie', reportedReturnPercent: finite(payload.data.return_percentage), loadedAt: new Date(now).toISOString(), firstPointAt: snapshots[0].createdAt, lastPointAt: last, stale: now - Date.parse(last) > maxLag };
}

// Cache by timeframe, deduplicate reads, and invalidate in-flight requests when
// the account changes. A stale successful response may be displayed explicitly.
export function createPortfolioHistoryLoader(fetchHistory, { now = Date.now } = {}) {
  const cached = new Map(), pending = new Map();
  let generation = 0;
  return {
    clear() { generation++; cached.clear(); pending.clear(); },
    async load(timeframe, { refresh = false } = {}) {
      if (!Object.values(PORTFOLIO_TIMEFRAMES).includes(timeframe)) throw new Error('Ungültiger Portfolio-Zeitraum.');
      const previous = cached.get(timeframe);
      const ttl = timeframe === 'DAY' ? 60_000 : 300_000;
      if (!refresh && previous && now() - previous.at < ttl) return previous.value;
      if (pending.has(timeframe)) return pending.get(timeframe);
      const started = generation;
      const request = (async () => {
        try {
          const value = await Promise.resolve().then(() => fetchHistory(timeframe));
          if (started !== generation) throw new Error('Konto wurde während des Abrufs geändert.');
          cached.set(timeframe, { at: now(), value });
          return value;
        } catch (error) {
          if (started !== generation) throw new Error('Konto wurde während des Abrufs geändert.');
          if (previous) {
            const value = { ...previous.value, stale: true, warning: 'Bitpanda konnte den Verlauf nicht aktualisieren. Angezeigt wird der letzte erfolgreiche Abruf.' };
            cached.set(timeframe, { at: previous.at - ttl, value });
            return value;
          }
          throw error;
        } finally { if (started === generation) pending.delete(timeframe); }
      })();
      pending.set(timeframe, request);
      return request;
    }
  };
}

export function apiHistoryIsCurrent(history, now = Date.now()) {
  const last = Date.parse(history?.lastPointAt);
  return history?.available === true && history.timeframe === 'DAY' && !history.stale && Number.isFinite(last) && last <= now + 300_000 && now - last <= 45 * 60_000;
}

function viennaDay(date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date));
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Keep old history intact and one rolling daily archive point. Minute readings
// are only necessary while the official history is unavailable or stale.
export function archiveDailyPortfolioPoint(snapshots, point) {
  const day = viennaDay(point.createdAt);
  return [...snapshots.filter(old => old.recordingFrequency !== 'daily' || viennaDay(old.createdAt) !== day), { ...point, recordingFrequency: 'daily' }]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

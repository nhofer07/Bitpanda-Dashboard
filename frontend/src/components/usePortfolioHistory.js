import { useEffect, useState } from 'react';

export const API_PORTFOLIO_RANGES = [['1d', '1 Tag'], ['1w', '1 Woche'], ['1m', '1 Monat'], ['6m', '6 Monate'], ['1y', '1 Jahr']];
const timeframes = { '1d': 'DAY', '1w': 'WEEK', '1m': 'MONTH', '6m': 'SIX_MONTH', '1y': 'YEAR' };

export function usePortfolioHistory(range, refreshKey, initialHistory) {
  const [state, setState] = useState({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!timeframes[range]) return;
    let active = true, controller;
    async function load(refresh = false) {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setState(current => ({ ...current, [range]: { history: current[range]?.history || null, loading: true, error: '' } }));
      try {
        const response = await fetch(`/api/portfolio-history?range=${range}${refresh ? "&refresh=1" : ""}`, { signal: requestController.signal });
        const history = await response.json();
        if (!response.ok || !history.available || history.timeframe !== timeframes[range] || history.currency !== 'EUR' || !Array.isArray(history.snapshots) || history.snapshots.length < 2 || history.snapshots.some(point => !Number.isFinite(Date.parse(point.createdAt)) || typeof point.totalValue !== 'number' || !Number.isFinite(point.totalValue) || point.totalValue < 0)) throw new Error(history.error || 'Bitpanda-Portfoliohistorie ist derzeit nicht verfügbar.');
        if (active && !requestController.signal.aborted) setState(current => ({ ...current, [range]: { history, loading: false, error: '' } }));
      } catch (error) {
        if (!active || requestController.signal.aborted || error.name === 'AbortError') return;
        setState(current => ({ ...current, [range]: { history: current[range]?.history ? { ...current[range].history, stale: true } : null, loading: false, error: 'Bitpanda konnte den Portfolioverlauf nicht laden.' } }));
      }
    }
    load(retry > 0);
    const timer = setInterval(() => load(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('pageshow', onVisible); };
  }, [range, refreshKey, retry]);
  const selected = state[range];
  const history = selected?.history;
  const seeded = range === '1d' && initialHistory?.available && initialHistory.timeframe === 'DAY' ? initialHistory : null;
  return { history: history || (selected?.error ? (seeded ? { ...seeded, stale: true } : null) : seeded), loading: timeframes[range] && (!selected || selected.loading), error: selected?.error || '', retry: () => setRetry(value => value + 1) };
}

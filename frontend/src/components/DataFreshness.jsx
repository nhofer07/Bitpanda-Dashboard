import { useEffect, useState } from 'react';
import { dashboardFreshness } from './dashboardRefresh.js';
import { formatDateTime } from './formatters.js';

export default function DataFreshness({ loadedAt, error, onRefresh, refreshing, preview = false }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 10_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); window.removeEventListener('pageshow', update); };
  }, []);
  const status = dashboardFreshness(loadedAt, Math.max(now, Date.now()), Boolean(error) || preview);
  if (refreshing && !preview) status.label = 'Aktualisiere …';
  if (preview) status.label = 'Gespeicherte Vorschau';
  if (!loadedAt && !error) return null;
  return <div className={`data-freshness ${status.stale ? 'is-stale' : ''}`}>
    <div role="status"><span className="freshness-label"><span aria-hidden="true">{status.stale ? '!' : '✓'}</span>{status.label}</span><time dateTime={loadedAt} title="Letzter erfolgreicher Datenabruf">{formatDateTime(loadedAt)}</time>{error && <small>{error}</small>}</div>
    <button className="secondary-button refresh-button" disabled={refreshing} onClick={onRefresh} aria-label={status.stale ? 'Erneut laden' : 'Dashboard aktualisieren'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.7 7a7 7 0 0 1 11.5-2L20 8M4 16l2.8 3A7 7 0 0 0 18.3 17" /></svg><span>{refreshing ? 'Lädt …' : status.stale ? 'Erneut laden' : 'Aktualisieren'}</span></button>
  </div>;
}

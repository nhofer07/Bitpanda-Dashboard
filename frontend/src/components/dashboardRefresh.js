// Only the newest request may publish, including its loading and error state.
export function createLatestRequest() {
  let version = 0;
  let loadedAt = -Infinity;
  return {
    begin: () => ++version,
    current: token => token === version,
    accept(token, data) {
      if (token !== version) return false;
      const timestamp = Date.parse(data?.loadedAt);
      if (Number.isFinite(timestamp) && timestamp < loadedAt) return false;
      if (Number.isFinite(timestamp)) loadedAt = timestamp;
      return true;
    }
  };
}

export function dashboardFreshness(loadedAt, now, failed = false) {
  const time = Date.parse(loadedAt);
  if (!Number.isFinite(time)) return { stale: true, label: 'Datenstand unbekannt' };
  if (failed) return { stale: true, label: 'Aktualisierung fehlgeschlagen' };
  return now - time > 180_000
    ? { stale: true, label: 'Veralteter Datenstand' }
    : { stale: false, label: 'Daten aktuell' };
}

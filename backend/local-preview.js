export function localPortfolioPreview(cached, { enabled, calculationVersion, now = Date.now() }) {
  const loadedAt = Date.parse(cached?.loadedAt || '');
  if (!enabled || !Number.isFinite(loadedAt) || cached?.calculationVersion !== calculationVersion || !Array.isArray(cached.openPositions)) return null;
  return {
    ...cached,
    cache: {
      status: 'local-preview',
      ageMs: Math.max(0, now - loadedAt),
      warning: 'Lokale Vorschau mit gespeichertem Portfolio. Bitpanda konnte nicht aktualisiert werden. Bestände und Portfolio-Werte entsprechen dem angegebenen Datenstand; Marktcharts werden separat aktualisiert.'
    }
  };
}

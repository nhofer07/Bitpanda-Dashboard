const DAY = 86400000;
// Suspicion is not proof: isolated moves trigger an independent audit and are
// explicitly marked, never turned into interpolated or invented observations.
export function suspiciousPortfolioPoints(points = [], cashflows = []) {
  const intervals = points.slice(1).map((p, i) => p.time - points[i].time).filter(n => n > 0).sort((a,b) => a-b);
  const interval = intervals[Math.floor(intervals.length / 2)];
  if (!(interval >= DAY)) return [];
  return points.flatMap((p, i) => {
    const before = points[i-1], after = points[i+1];
    if (!before || !after || p.time - before.time !== interval || after.time - p.time !== interval || before.value <= 0 || after.value <= 0) return [];
    const low = Math.min(before.value, after.value), high = Math.max(before.value, after.value);
    if (high - low > Math.max(30, low * .1)) return [];
    if (p.value <= high + Math.max(100, high * .2) && p.value >= low - Math.max(100, low * .2)) return [];
    if (cashflows.some(f => f.time >= before.time && f.time <= after.time + interval && Math.abs(f.signedAmount || 0) > Math.max(50, low * .05))) return [];
    return [{ time: p.time, closeTime: p.time + interval, originalValue: p.value }];
  });
}
export function historicalHoldings(ledger, cutoff) {
  const wallets = new Map();
  for (const r of ledger || []) {
    if (!r.walletId || !r.unitId || !Number.isFinite(Date.parse(r.date))) continue;
    const key = `${r.walletId}:${r.unitId}`; if (!wallets.has(key)) wallets.set(key, []); wallets.get(key).push(r);
  }
  const holdings = new Map(), limitations = new Set();
  const firstTime = Math.min(...(ledger || []).map(r => Date.parse(r.date)).filter(Number.isFinite));
  if (cutoff < firstTime) return { available: false, reason: 'Der Zeitpunkt liegt vor der verfügbaren Buchungshistorie.' };
  if (!wallets.size) return { available: false, reason: 'Keine vollständigen historischen Buchungsbestände verfügbar.' };
  for (const rows of wallets.values()) {
    rows.sort((a,b) => Date.parse(a.date)-Date.parse(b.date) || (a.order ?? 0)-(b.order ?? 0));
    const first = rows[0], tolerance = first.symbol === 'EUR' ? .011 : 1e-7;
    if (first.balanceAfter == null || first.delta == null || Math.abs(first.balanceAfter - first.delta) > tolerance) limitations.add('Die Buchungshistorie enthält unbekannte Anfangsbestände.');
    const row = rows.filter(r => Date.parse(r.date) <= cutoff).at(-1); if (!row) continue;
    if (row.balanceAfter == null || row.balanceCheck === 'difference') { limitations.add('Ein historischer Wallet-Bestand ist unvollständig oder widersprüchlich.'); continue; }
    if (Math.abs(row.balanceAfter) < tolerance) continue;
    if (row.isDebt || /margin|credit|debt/i.test(row.wallet || '')) return { available: false, reason: 'Historische Hebel- oder Schuldposition benötigt eine eigene Bewertung.' };
    if (!row.symbol || row.balanceAfter < 0) return { available: false, reason: 'Historische Einheit konnte nicht sicher bewertet werden.' };
    const old = holdings.get(row.symbol) || { symbol: row.symbol, name: row.name, quantity: 0 };
    old.quantity += row.balanceAfter; holdings.set(row.symbol, old);
  }
  return { available: !limitations.size, holdings: [...holdings.values()], reason: [...limitations].join(' ') };
}
export async function auditHistoricalPortfolio({ snapshots, ledger, assets = [], loadedAt, cashflows = [], loadPrices }) {
  const points = snapshots.map(p => ({ time: Date.parse(p.createdAt), value: p.totalValue }));
  const suspects = suspiciousPortfolioPoints(points, cashflows).slice(0, 20), metadata = new Map(assets.map(a => [a.assetKey || a.symbol, a]));
  const prices = new Map();
  const plans = suspects.map(suspect => ({ ...suspect, position: historicalHoldings(ledger, suspect.closeTime) }));
  const needed = [...new Map(plans.flatMap(p => p.position.holdings || []).filter(h => h.symbol !== 'EUR').map(h => [h.symbol, h])).values()];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, needed.length) }, async () => {
    while (next < needed.length) {
      const h = needed[next++], meta = metadata.get(h.symbol);
      try { prices.set(h.symbol, await loadPrices({ symbol: h.symbol, name: meta?.displayName || meta?.name || h.name, category: meta?.category || 'other', range: '1y' })); } catch { prices.set(h.symbol, null); }
    }
  }));
  return { pending: false, checkedAt: new Date().toISOString(), checks: plans.map(plan => {
    if (!Number.isFinite(Date.parse(loadedAt)) || plan.closeTime > Date.parse(loadedAt)) return { ...plan, position: undefined, status: 'unverified', reason: !Number.isFinite(Date.parse(loadedAt)) ? 'Kein verifizierbarer gespeicherter Kontodatenstand verfügbar.' : 'Der Zeitabschnitt liegt nach dem letzten gespeicherten Kontodatenstand.' };
    if (!plan.position.available && !plan.position.holdings?.length) return { ...plan, position: undefined, status: 'unverified', reason: plan.position.reason };
    let total = 0; const missing = plan.position.available ? [] : [plan.position.reason], components = [];
    for (const holding of plan.position.holdings) {
      if (holding.symbol === 'EUR') { total += holding.quantity; components.push({ symbol: 'EUR', quantity: holding.quantity, value: holding.quantity }); continue; }
      const series = prices.get(holding.symbol);
      const quote = series?.currency === 'EUR' ? series.history?.filter(p => { const available = Math.floor(Date.parse(p.date) / DAY) * DAY + DAY; return available <= plan.closeTime && plan.closeTime - available <= 4 * DAY; }).at(-1) : null;
      if (!quote || !(quote.close > 0)) { missing.push(holding.symbol); continue; }
      const value = holding.quantity * quote.close; total += value; components.push({ symbol: holding.symbol, quantity: holding.quantity, price: quote.close, priceDate: quote.date, value, source: series.source });
    }
    const discrepancy = Math.abs(plan.originalValue - total), tolerance = Math.max(30, total * .05);
    return { time: plan.time, closeTime: plan.closeTime, originalValue: plan.originalValue, status: missing.length ? 'unverified' : discrepancy > tolerance ? 'contradicted' : 'confirmed', reconstructedValue: missing.length ? null : total, partialValue: total, missing, components, reason: missing.length ? `Nicht vollständig bewertbar: ${missing.join(', ')}.` : discrepancy > tolerance ? 'Buchungsbestände und historische Schlusskurse widersprechen dem Bitpanda-Punkt deutlich.' : 'Der Sprung ist durch historische Buchungsbestände und Kurse plausibel.' };
  }) };
}

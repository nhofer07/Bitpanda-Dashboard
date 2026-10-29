import SaleProfitPreview from "./SaleProfitPreview.jsx";
import PurchaseOutcomePreview from "./PurchaseOutcomePreview.jsx";
import TradingViewChart from "./TradingViewChart.jsx";
import AdaptiveTable from "./AdaptiveTable.jsx";
import { formatNumber as number, formatCurrency, formatPriceNumber, priceDigits, formatDateTime, numericValue } from "./formatters.js";
import PageIntro from "./PageIntro.jsx";
import LoadingState from "./LoadingState.jsx";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { notify, performAction, tradeFeedback } from "./actionFeedback.js";

const SavedDrawingManager = lazy(() => import('./SavedDrawingManager.jsx'));
const text = (value, fallback = "–") => ["string", "number"].includes(typeof value) ? String(value) : fallback;
const money = (value, currency = "EUR") => {
  if (numericValue(value) == null) return "–";
  if (currency === "EUR") return formatCurrency(value);
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "EUR";
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: safeCurrency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${number(value, 2)} ${safeCurrency}`; }
};
const fusionPrice = (value, currency = "EUR") => numericValue(value) == null ? "–" : `${formatPriceNumber(value, Math.max(4, priceDigits(value)))} ${currency === "EUR" ? "€" : currency}`;
const when = value => {
  if (!value) return "–";
  const normalized = typeof value === "number" && value < 1e12 ? value * 1000 : value;
  const date = new Date(normalized);
  return formatDateTime(date);
};
const array = (value, keys = []) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
};
const record = value => value?.data && !Array.isArray(value.data) ? value.data : value || {};
const pairName = item => text(item?.pair ?? item?.symbol ?? item?.name, "");
const quoteName = item => text(item?.quoteAsset ?? item?.quote_asset ?? item?.quote, "EUR");
const baseName = item => text(item?.baseAsset ?? item?.base_asset ?? item?.base, "Krypto");
const candleValue = item => Number(Array.isArray(item) ? item[4] : item?.close ?? item?.c ?? 0);
const candleTime = item => Array.isArray(item) ? item[0] : item?.timestamp ?? item?.time ?? item?.openTime;

async function api(url, options) {
  const response = await fetch(`/api${url}`, options);
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data?.error || "Fusion-Anfrage fehlgeschlagen.");
  return data;
}

export default function FusionView({ dashboardData }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [pair, setPair] = useState("BTC-EUR"); const [book, setBook] = useState(null); const [candles, setCandles] = useState([]);
  const [pairSearch, setPairSearch] = useState("BTC-EUR"); const [pairSearchOpen, setPairSearchOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [chartMode, setChartMode] = useState("tradingview");
  const [manageDrawings, setManageDrawings] = useState(false);
  const [candleInterval, setCandleInterval] = useState("1h");
  const [order, setOrder] = useState({ side: "buy", type: "market", mode: "amount", value: "", limitPrice: "" });
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const candleScope = useRef("");
  async function load({ strict = false } = {}) { setLoading(true); setError(""); try { const response = await api("/fusion/overview"); if (!response || typeof response !== "object") throw new Error("Fusion hat keine gültigen Kontodaten geliefert. Bitte den API-Key in den Einstellungen prüfen."); const next = { ...response, account: record(response?.account), balances: array(response?.balances, ["balances"]), pairs: array(response?.pairs, ["pairs"]), tickers: array(response?.tickers, ["tickers"]), orders: array(response?.orders, ["orders"]), trades: array(response?.trades, ["trades"]) }; setData(next); if (!next.pairs.some(item => pairName(item) === pair)) { const fallbackPair = pairName(next.pairs.find(item => quoteName(item) === "EUR")) || pairName(next.pairs[0]) || pair; setPair(fallbackPair); setPairSearch(fallbackPair); } } catch (e) { setError(e?.message || "Fusion konnte nicht geladen werden."); if (strict) throw e; } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const refresh = () => { if (!actionLock.current) void load(); };
    const timer = setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [pair]);
  useEffect(() => {
    if (!data || !pair) return;
    const controller = new AbortController();
    const scope = `${pair}:${candleInterval}`;
    if (candleScope.current !== scope) { candleScope.current = scope; setCandles([]); setBook(null); }
    Promise.all([api(`/fusion/orderbook/${encodeURIComponent(pair)}?depth=10`, { signal: controller.signal }), api(`/fusion/candles/${encodeURIComponent(pair)}?interval=${candleInterval}&limit=500`, { signal: controller.signal })]).then(([nextBook, nextCandles]) => {
      if (controller.signal.aborted) return;
      const normalizedBook = record(nextBook); setBook({ ...normalizedBook, bids: array(normalizedBook?.bids, ["buy", "buys"]), asks: array(normalizedBook?.asks, ["sell", "sells"]) }); setCandles(array(nextCandles, ["candles"]));
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [pair, data?.updatedAt, candleInterval]);
  const ticker = data?.tickers?.find(item => pairName(item) === pair); const selectedPair = data?.pairs?.find(item => pairName(item) === pair);
  const inputValue = Number(order.value || 0); const referencePrice = Number(order.type === "limit" ? order.limitPrice : ticker?.price || 0);
  const feeRateKnown = numericValue(data?.account?.currentTier?.fee ?? data?.account?.current_tier?.fee) != null;
  const rawFeeRate = Number(data?.account?.currentTier?.fee ?? data?.account?.current_tier?.fee ?? 0); const feeRate = rawFeeRate > .01 ? rawFeeRate / 100 : rawFeeRate;
  const estimatedOrderValue = order.mode === "amount" ? inputValue : inputValue * referencePrice;
  const estimatedFee = estimatedOrderValue * feeRate;
  const estimatedNetValue = order.side === "buy" && order.mode === "amount" ? Math.max(0, estimatedOrderValue - estimatedFee) : estimatedOrderValue;
  const estimatedQuantity = order.mode === "quantity" ? inputValue : referencePrice ? estimatedNetValue / referencePrice : 0;
  const chart = useMemo(() => { if (!candles.length) return null; const values = candles.map(candleValue).filter(Number.isFinite); if (!values.length) return null; const min = Math.min(...values), max = Math.max(...values), span = max - min || 1; const x = index => 76 + index / Math.max(1, values.length - 1) * 704; const y = value => 230 - (value - min) / span * 190; return { min, max, span, x, y, points: values.map((value, index) => `${x(index)},${y(value)}`).join(" ") }; }, [candles]);
  const selectedCandle = candles[hover] || candles[candles.length - 1];
  const quoteAsset = quoteName(selectedPair);
  const baseAsset = baseName(selectedPair);
  const held = dashboardData?.openPositions?.find(asset => asset.assetKey === baseAsset);
  const saleQuote = { quote: { quantity: estimatedQuantity, price: referencePrice, fee: feeRateKnown ? estimatedFee : null } };
  const filteredPairs = useMemo(() => {
    const query = pairSearch.trim().toUpperCase();
    return (data?.pairs || []).filter(item => {
      const searchable = `${pairName(item)} ${baseName(item)} ${quoteName(item)}`.toUpperCase();
      return !query || searchable.includes(query);
    }).slice(0, 12);
  }, [data?.pairs, pairSearch]);
  function selectPair(nextPair) { setPair(nextPair); setPairSearch(nextPair); setPairSearchOpen(false); setHover(null); }
  async function submit(event) {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError("");
    const body = { pair, side: order.side, type: order.type, confirmation: "FUSION HANDELN", [order.mode]: order.value, ...(order.type === "limit" ? { limitPrice: order.limitPrice } : {}) };
    try {
      await performAction({
        pending: `${order.side === "buy" ? "Kaufsorder" : "Verkaufsorder"} für ${pair} wird an Fusion gesendet …`,
        execute: () => api("/fusion/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        success: result => tradeFeedback(result, { fusion: true, side: body.side, asset: body.pair }),
        failure: "Fusion-Order konnte nicht bestätigt werden", uncertain: true,
        refresh: async () => { setOrder(current => ({ ...current, value: "" })); await load({ strict: true }); }
      });
    } finally { actionLock.current = false; setBusy(false); }
  }
  async function cancel(id) {
    if (actionLock.current) return;
    const confirmation = window.prompt("Zum Stornieren exakt ORDER STORNIEREN eingeben:");
    if (confirmation !== "ORDER STORNIEREN") { notify("Stornierung abgebrochen. Die Order wurde nicht geändert.", "warning"); return; }
    actionLock.current = true; setBusy(true); setError("");
    try {
      await performAction({ pending: "Fusion-Order wird storniert …", failure: "Stornierung konnte nicht bestätigt werden", uncertain: true,
        execute: () => api(`/fusion/orders/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) }),
        success: `Fusion-Order storniert. Order-ID: ${id}`, refresh: () => load({ strict: true }) });
    } finally { actionLock.current = false; setBusy(false); }
  }
  if (loading && !data) return <LoadingState>Fusion wird geladen …</LoadingState>;
  if (!data) return <div className="fusion-view"><PageIntro><div><p>Marktdaten, Kontostand und Orders erscheinen hier, sobald deine Fusion-Verbindung verfügbar ist.</p></div></PageIntro><div className="error-box" role="alert">{error || "Fusion ist nicht eingerichtet. Hinterlege den Fusion-Key in den Einstellungen."}</div><div><button className="secondary-button" onClick={() => load()}>Erneut prüfen</button></div></div>;
  const openOrders = (data.orders || []).filter(item => ["open", "new", "partially-filled", "partially_filled"].includes(String(item?.status || "").toLowerCase()));
  return <div className="fusion-view">
    <PageIntro><div><p>Aggregierte Liquidität, transparente Gebühren und direkte Orderverwaltung.</p></div><div className="hero-status"><span>Gebührenstufe {text(data.account?.currentTier?.name ?? data.account?.current_tier?.name)}</span><strong>{number(Number(data.account?.currentTier?.fee ?? data.account?.current_tier?.fee ?? 0) * 100, 3)} %</strong><small>30-Tage-Volumen {money(data.account?.tradedVolume30d ?? data.account?.traded_volume_30d)}</small></div></PageIntro>
    {error && <div className="error-box">{error}</div>}
    <section className="fusion-summary">{(data.balances || []).filter(item => Number(item?.available) || Number(item?.locked)).map((item, index) => <article className="metric-card" key={text(item?.symbol ?? item?.asset, String(index))}><span>{text(item?.symbol ?? item?.asset)}</span><strong>{number(item?.available)}</strong><small>{Number(item?.locked) ? `${number(item.locked)} reserviert` : "Verfügbar"}</small></article>)}</section>
    <section className="fusion-market-grid"><article className="table-card fusion-chart-card"><div className="section-heading"><div><h3>{pair}</h3><span>{chartMode === "fusion" ? `${candleInterval}-Kurse · Fusion-Marktdaten` : "TradingView · Referenzmarkt"}</span></div><div className="fusion-pair-search"><input type="search" value={pairSearch} placeholder="Krypto oder Paar suchen …" aria-label="Fusion-Handelspaar suchen" aria-expanded={pairSearchOpen} aria-controls="fusion-pair-results" onFocus={() => setPairSearchOpen(true)} onBlur={() => setPairSearchOpen(false)} onChange={event => { setPairSearch(event.target.value); setPairSearchOpen(true); }} onKeyDown={event => { if (event.key === "Enter" && filteredPairs[0]) { event.preventDefault(); selectPair(pairName(filteredPairs[0])); } else if (event.key === "Escape") { setPairSearch(pair); setPairSearchOpen(false); event.currentTarget.blur(); } }} />{pairSearchOpen && <div className="fusion-pair-results" id="fusion-pair-results" role="listbox">{filteredPairs.length ? filteredPairs.map((item, index) => { const name = pairName(item); return <button type="button" role="option" aria-selected={name === pair} key={name || index} onMouseDown={event => event.preventDefault()} onClick={() => selectPair(name)}><strong>{name || `Paar ${index + 1}`}</strong><span>{baseName(item)} / {quoteName(item)}</span></button>; }) : <p>Kein Handelspaar gefunden.</p>}</div>}</div></div><div className="fusion-chart-switch" role="group" aria-label="Chart-Darstellung"><button className="secondary-button" aria-pressed={chartMode === "fusion"} onClick={() => setChartMode("fusion")}>Fusion-Kurs</button><button className="secondary-button" aria-pressed={chartMode === "tradingview"} onClick={() => setChartMode("tradingview")}>TradingView</button></div>{chartMode === "tradingview" ? <TradingViewChart key={pair} pair={pair} /> : <>{chart && <><div className="history-summary fusion-history-summary"><strong>{fusionPrice(candleValue(selectedCandle), quoteAsset)} <small>· {when(candleTime(selectedCandle))}</small></strong></div><svg viewBox="0 0 800 280" className="history-svg fusion-chart" role="img" aria-label={`Kursverlauf ${pair} in ${quoteAsset}`} onPointerLeave={() => setHover(null)} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const targetX = (event.clientX - rect.left) / rect.width * 800; let closest = 0; candles.forEach((_, index) => { if (Math.abs(chart.x(index) - targetX) < Math.abs(chart.x(closest) - targetX)) closest = index; }); setHover(closest); }}>{[0, .5, 1].map(fraction => <g key={fraction}><line x1="76" x2="780" y1={40 + fraction * 190} y2={40 + fraction * 190} /><text x="66" y={44 + fraction * 190} textAnchor="end">{fusionPrice(chart.min + (1 - fraction) * chart.span, quoteAsset)}</text></g>)}<polyline points={chart.points} />{hover !== null && selectedCandle && <g className="fusion-chart-hover"><line x1={chart.x(hover)} x2={chart.x(hover)} y1="30" y2="235" /><circle cx={chart.x(hover)} cy={chart.y(candleValue(selectedCandle))} r="5" /></g>}</svg><label className="history-slider">Datenpunkt ansehen<input type="range" min="0" max={Math.max(0, candles.length - 1)} value={hover ?? candles.length - 1} onChange={event => setHover(Number(event.target.value))} aria-valuetext={`${when(candleTime(selectedCandle))}: ${fusionPrice(candleValue(selectedCandle), quoteAsset)} ${quoteAsset}`} /></label></>}{!chart && <p className="category-empty">Keine Kursdaten für dieses Handelspaar verfügbar.</p>}</>}<details className="legacy-drawing-management" onToggle={event => setManageDrawings(event.currentTarget.open)}><summary>Bisherige gespeicherte Markierungen verwalten</summary>{manageDrawings && <Suspense fallback={<LoadingState compact>Markierungen werden geladen …</LoadingState>}><SavedDrawingManager key={pair} pair={pair} /></Suspense>}</details><div className="fusion-market-stats"><span>24h Hoch <b>{fusionPrice(ticker?.high, quoteAsset)}</b></span><span>24h Tief <b>{fusionPrice(ticker?.low, quoteAsset)}</b></span><span>Volumen <b>{number(ticker?.volume, 2)}</b></span></div></article>
    <article className="table-card fusion-orderbook"><div className="section-heading"><div><h3>Orderbuch</h3><span>Top 10 Preisstufen</span></div></div><div className="fusion-book-columns"><div><strong>Kaufangebote</strong>{(book?.bids || []).map((row, i) => <span key={i}><b>{fusionPrice(Array.isArray(row) ? row[0] : row?.price, quoteAsset)}</b>{number(Array.isArray(row) ? row[1] : row?.quantity ?? row?.amount)}</span>)}</div><div><strong>Verkaufsangebote</strong>{(book?.asks || []).map((row, i) => <span key={i}><b>{fusionPrice(Array.isArray(row) ? row[0] : row?.price, quoteAsset)}</b>{number(Array.isArray(row) ? row[1] : row?.quantity ?? row?.amount)}</span>)}</div></div></article></section>
    <section className="fusion-trading-grid"><article className="table-card fusion-ticket"><div className="section-heading"><div><h3>Order aufgeben</h3><span>{selectedPair?.minOrderAmount || selectedPair?.min_order_amount ? `Minimum ${number(selectedPair.minOrderAmount ?? selectedPair.min_order_amount)} ${quoteAsset}` : "Markt- oder Limit-Order"}</span></div></div><p className="source-note">Fusion-Datenstand: {when(data.updatedAt)} · Ausführung kann vom angezeigten Marktpreis abweichen.</p><form onSubmit={submit}><fieldset className="action-fieldset" disabled={busy}><div className="form-row"><label>Richtung<select value={order.side} onChange={e => setOrder({ ...order, side: e.target.value })}><option value="buy">Kaufen</option><option value="sell">Verkaufen</option></select></label><label>Ordertyp<select value={order.type} onChange={e => setOrder({ ...order, type: e.target.value })}><option value="market">Market</option><option value="limit">Limit</option></select></label></div><div className="form-row"><label>Angabe<select value={order.mode} onChange={e => setOrder({ ...order, mode: e.target.value })}><option value="amount">{quoteAsset}-Betrag</option><option value="quantity">{baseAsset}-Menge</option></select></label><label>Wert<input inputMode="decimal" value={order.value} onChange={e => setOrder({ ...order, value: e.target.value.replace(",", ".") })} required /></label></div>{order.type === "limit" && <label>Limitpreis<input inputMode="decimal" value={order.limitPrice} onChange={e => setOrder({ ...order, limitPrice: e.target.value.replace(",", ".") })} required /></label>}{inputValue > 0 && referencePrice > 0 && <div className="fusion-cost-preview"><div className="unit-price-field"><span>{order.side === "buy" ? "Kaufpreis" : "Verkaufspreis"} pro {baseAsset}</span><strong>{fusionPrice(referencePrice, quoteAsset)}</strong></div><div><span>Handelswert</span><strong>{money(estimatedOrderValue, quoteAsset)}</strong></div><div className="fee-field"><span>Geschätzte Gebühr ({number(feeRate * 100, 3)} %)</span><strong>{money(estimatedFee, quoteAsset)}</strong></div><div><span>{order.side === "buy" ? "Du kaufst ungefähr" : "Voraussichtliche Auszahlung"}</span><strong>{order.side === "buy" ? `${number(estimatedQuantity)} ${baseAsset}` : money(Math.max(0, estimatedOrderValue - estimatedFee), quoteAsset)}</strong></div><small>{order.type === "limit" ? "Der angezeigte Kaufpreis ist dein Limitpreis." : "Der angezeigte Marktpreis kann sich bis zur Ausführung noch leicht verändern."} Die endgültige Gebühr und Ausführung stehen nach dem Trade fest.</small></div>}{order.side === "sell" && inputValue > 0 && referencePrice > 0 && <>{quoteAsset === "EUR" ? <><SaleProfitPreview quote={saleQuote} held={held} category="crypto" estimated /><p className="source-note">Einstand aus dem gesamten Bitpanda-Bestand, anteilig nach Menge. Kein eigener Fusion-Einstand und keine Ausführungsgarantie.</p></> : <p className="source-note">Die Gewinnvorschau benötigt EUR-Handelswerte. Für dieses Paar wird keine ungesicherte Umrechnung vorgenommen.</p>}</>}{order.side === "buy" && inputValue > 0 && referencePrice > 0 && <PurchaseOutcomePreview key={`${pair}:${order.mode}`} quantity={estimatedQuantity} price={referencePrice} fee={estimatedFee} totalCost={estimatedOrderValue + (order.mode === "quantity" ? estimatedFee : 0)} estimatedSellFee={feeRateKnown ? estimatedQuantity * referencePrice * feeRate : null} sellFeeRate={feeRateKnown ? feeRate : null} category="crypto" currency={quoteAsset} />}<button className="danger-button" disabled={busy || inputValue <= 0 || referencePrice <= 0}>{busy ? "Order wird gesendet …" : order.side === "buy" ? "Jetzt verbindlich kaufen" : "Jetzt verbindlich verkaufen"}</button></fieldset></form></article>
    <article className="table-card fusion-orders"><div className="section-heading"><div><h3>Offene Orders</h3><span>{openOrders.length} aktiv</span></div></div>{openOrders.length ? openOrders.map((item, index) => <div className="fusion-order-row" key={text(item?.id, String(index))}><div><strong>{text(item?.side)} {pairName(item)}</strong><span>{text(item?.type)} · {number(item?.quantity || item?.amount)}</span></div><button onClick={() => cancel(item?.id)} disabled={busy || !item?.id}>Stornieren</button></div>) : <p className="muted fusion-empty">Keine offenen Orders.</p>}</article></section>
    <section className="table-card"><div className="section-heading"><div><h3>Ausgeführte Trades</h3><span>Die letzten {data.trades?.length || 0} Ausführungen</span></div></div><div className="fusion-table-wrap"><AdaptiveTable className="clean-table"><thead><tr><th>Zeit</th><th>Paar</th><th>Seite</th><th>Preis</th><th>Betrag</th><th>Gebühr</th></tr></thead><tbody>{(data.trades || []).map((item, index) => <tr key={text(item?.id, String(index))}><td>{when(item?.executedAt ?? item?.executed_at)}</td><td>{pairName(item)}</td><td>{text(item?.side)}</td><td>{fusionPrice(item?.price, quoteName(item))}</td><td>{number(item?.amount)}</td><td>{number(item?.fee?.amount ?? item?.fee)} {text(item?.fee?.symbol, "")}</td></tr>)}</tbody></AdaptiveTable></div>{!data.trades.length && <p className="category-empty">Noch keine ausgeführten Trades.</p>}</section>
  </div>;
}

import SectionShortcuts from "./SectionShortcuts.jsx";
import AdaptiveTable from "./AdaptiveTable.jsx";
import { formatPrice, formatCurrency as money, formatDateTime } from "./formatters.js";
import PageIntro from "./PageIntro.jsx";
import LoadingState from "./LoadingState.jsx";
import { useEffect, useMemo, useState } from "react";
import { PortfolioComparison } from "./AccountDataComponents.jsx";
import AssetDetailView from "./AssetDetailView.jsx";
import MarketHistoryChart from "./MarketHistoryChart.jsx";
import AssetActionsPanel from "./AssetActionsPanel.jsx";
import { addMarketWatchlistItem, readMarketWatchlist, writeMarketWatchlist } from "./marketWatchlist.js";

const categoryLabel = value => ({ stock: "Aktie", etf: "ETF", crypto: "Krypto", metal: "Edelmetall" }[value] || "Sonstiges");
const title = asset => asset.displayName || asset.name || asset.assetKey;
const marketAsset = asset => ({ id: asset.reportedAssetId || asset.assetId, isin: asset.isin, symbol: asset.assetKey, name: title(asset), category: asset.category || "other" });

export default function AssetsView({ data, loading, error, selectedAssetKey, selectedAssetData, assetNavigation, onSelectAsset, onTradeCompleted }) {
  const assets = useMemo(() => [...(data?.openPositions || [])].sort((a,b) => title(a).localeCompare(title(b))), [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [searchResult, setSearchResult] = useState({ items: [], total: 0 });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const [watchlist, setWatchlist] = useState(readMarketWatchlist);
  useEffect(() => {
    const controller = new AbortController();
    const clean = query.trim();
    setSearchResult({ items: [], total: 0 }); setSearchError("");
    if (clean.length < 2) { setSearchLoading(false); return () => controller.abort(); }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: clean, category });
        const response = await fetch(`/api/public-assets/search?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Suche nicht verfügbar.");
        if (!controller.signal.aborted) setSearchResult(result);
      } catch (err) { if (!controller.signal.aborted) setSearchError(err.message); }
      finally { if (!controller.signal.aborted) setSearchLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, category, searchRetry]);
  useEffect(() => {
    if (!selectedAssetKey || !assetNavigation) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(assetNavigation?.target === "chart" ? "asset-market-chart" : "asset-market-details");
      if (assetNavigation?.target === "chart") target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedAssetKey, assetNavigation]);
  const visible = assets.filter(asset => (category === "all" || (asset.category || "other") === category) && `${title(asset)} ${asset.assetKey}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedPosition = assets.find(asset => asset.assetKey === selectedAssetKey) || (data?.profitLoss?.assets || []).find(asset => asset.assetKey === selectedAssetKey);
  const requested = selectedAssetData || selectedPosition;
  const displayed = requested ? (requested.symbol ? requested : marketAsset(requested)) : selectedAssetKey ? { symbol: selectedAssetKey, name: selectedAssetKey, category: "other" } : assets[0] ? marketAsset(assets[0]) : null;
  const held = displayed && assets.find(asset => asset.assetKey === displayed.symbol);
  const position = held || (selectedAssetData?.trades ? selectedAssetData : null) || (displayed && (data?.profitLoss?.assets || []).find(asset => asset.assetKey === displayed.symbol));
  function addToWatchlist(asset) {
    setWatchlist(current => {
      const next = addMarketWatchlistItem(current, asset);
      writeMarketWatchlist(next);
      return next;
    });
  }
  function removeFromWatchlist(symbol) {
    setWatchlist(current => {
      const next = current.filter(item => item.symbol !== symbol);
      writeMarketWatchlist(next);
      return next;
    });
  }
  return <div className="assets-view">
    <PageIntro><div><p>Deine Assets und der gesamte Bitpanda-Katalog an einem Ort.</p></div><div className="hero-status"><span>Im Portfolio</span><strong>{assets.length}</strong></div></PageIntro>
    <div className="view-panel"><input className="search-input" aria-label="Alle Assets durchsuchen" placeholder="Alle Assets suchen: Name oder Symbol …" value={query} onChange={event => setQuery(event.target.value)} /><select className="cashflow-select" aria-label="Anlageklasse" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Alle Anlageklassen</option>{["stock", "etf", "crypto", "metal", "other"].map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></div>
    {query.trim().length >= 2 ? <section className="table-card asset-search-section">
      <div className="section-heading"><h3>Suchergebnisse · Bitpanda</h3><span>{searchLoading ? "Sucht …" : `${searchResult.total} Treffer`}</span></div>
      {searchLoading && <LoadingState compact>Assetkatalog wird durchsucht …</LoadingState>}
      {searchError && <div className="error-box" role="alert">{searchError} <button className="secondary-button" onClick={() => setSearchRetry(value => value + 1)}>Erneut versuchen</button></div>}
      {!searchLoading && !searchError && <div className="asset-search-grid">{searchResult.items.map(item => <button className={`asset-search-result ${displayed?.symbol === item.symbol ? "selected" : ""}`} aria-pressed={displayed?.symbol === item.symbol} key={item.id} onClick={() => onSelectAsset(item)}><span className="asset-search-result-heading"><strong>{item.name}</strong><b>{item.price == null ? "Kurs nicht verfügbar" : formatPrice(item.price)}</b></span><span>{item.symbol} · {categoryLabel(item.category)}</span>{item.isin && <small>ISIN {item.isin}</small>}<small>{assets.some(asset => asset.assetKey === item.symbol) ? "Im Portfolio" : "Nicht im Portfolio"}{item.buyActive === false ? " · Kauf derzeit nicht verfügbar" : ""}</small><b>Chart, Details & Handel anzeigen ↓</b></button>)}</div>}
      {!searchLoading && !searchError && searchResult.total === 0 && <p>Keine passenden Assets im Bitpanda-Katalog gefunden.</p>}
      {searchResult.total > searchResult.items.length && <p>Die ersten {searchResult.items.length} Treffer werden angezeigt. Grenze die Suche mit Name, Symbol oder Anlageklasse ein.</p>}
    </section> : <p className="source-note">Ab zwei Zeichen suchst du auch nach Assets, die du noch nicht besitzt.</p>}
    {loading && <LoadingState>Portfolio wird geladen …</LoadingState>}
    {error && <div className="error-box">{error}</div>}
    {!loading && !error && <section className="table-card"><div className="section-heading"><h3>Meine Assets</h3><span>{visible.length} Positionen</span></div><div className="assets-table-scroll"><AdaptiveTable className="clean-table mobile-asset-table"><thead><tr><th>Asset</th><th>Aktueller Wert</th><th>Aktionen</th></tr></thead><tbody>{visible.map(asset => <tr key={asset.assetKey} className={displayed?.symbol === asset.assetKey ? "selected-asset-row" : undefined}><td><button className="asset-name-link" onClick={() => onSelectAsset(asset)}>{title(asset)}</button><small className="asset-cell-note">{asset.assetKey} · {categoryLabel(asset.category)}</small></td><td>{money(asset.currentValue)}</td><td><div className="asset-row-actions"><button className="secondary-button" onClick={() => onSelectAsset(asset)}>Chart & Details anzeigen</button></div></td></tr>)}</tbody></AdaptiveTable></div>{!visible.length && <p className="assets-empty">{assets.length ? "Keine passenden Positionen im Portfolio. Die allgemeine Asset-Suche bleibt verfügbar." : "Noch keine Positionen im Portfolio. Über die Suche kannst du trotzdem Assets ansehen."}</p>}</section>}
    {displayed ? <AssetMarketPanel data={data} onSelectAsset={onSelectAsset} key={`${displayed.symbol}:${displayed.category}`} asset={displayed} held={held} position={position} watched={watchlist.some(item => item.symbol === displayed.symbol)} onAddWatch={addToWatchlist} onRemoveWatch={removeFromWatchlist} onTradeCompleted={onTradeCompleted} /> : <section className="table-card asset-search-section"><h3>Asset für den Chart auswählen</h3><p>Suche nach einem Asset und wähle einen Treffer aus. Dafür ist keine eigene Position erforderlich.</p></section>}
  </div>;
}

function AssetMarketPanel({ data, onSelectAsset, asset, held, position, watched, onAddWatch, onRemoveWatch, onTradeCompleted }) {
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/market/quotes?items=${encodeURIComponent(JSON.stringify([{ ...asset, isPortfolio: true }]))}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      const item = result.items?.[0];
      if (!response.ok || !item || item.error) throw new Error(item?.error || result.error || "Aktueller Kurs nicht verfügbar.");
      if (!controller.signal.aborted) setQuote(item);
    }).catch(error => { if (!controller.signal.aborted) setQuoteError(error.message); });
    return () => controller.abort();
  }, [asset.symbol, asset.category]);
  const accountQuote = held?.priceSource === "Bitpanda Portfolio API" && held.currentPrice != null ? { price: held.currentPrice, source: held.priceSource, updatedAt: held.priceUpdatedAt } : quote;
  const comparison = data?.accountInsights?.portfolio?.some(row => row.symbol === asset.symbol) && <details className="page-disclosure asset-comparison"><summary>Bitpanda-Werte für {asset.name} mit dem Dashboard vergleichen</summary><PortfolioComparison data={data} selectedSymbol={asset.symbol} onSelectAsset={onSelectAsset} /></details>;
  return <section id="asset-market-details" className="asset-market-panel" aria-label={`Kursdetails ${asset.name}`}>
    <div className="table-card asset-search-section"><div className="section-heading"><div><span className="eyebrow">{held ? "Im Portfolio" : position ? "Abgeschlossene Position" : "Marktdaten · Nicht im Portfolio"}</span><h3>{asset.name}</h3><p>{asset.symbol} · {categoryLabel(asset.category)}{asset.isin ? ` · ISIN ${asset.isin}` : ""}</p></div><div className="asset-market-summary"><span>Aktueller Kurs</span><h3>{accountQuote ? formatPrice(accountQuote.price) : quoteError ? "Nicht verfügbar" : "Lädt …"}</h3><button className="secondary-button" onClick={() => watched ? onRemoveWatch(asset.symbol) : onAddWatch(asset)}>{watched ? "Von Watchlist entfernen" : "Zur Watchlist hinzufügen"}</button></div></div>{accountQuote && <p className="source-note">{accountQuote.source} · Abruf: {formatDateTime(accountQuote.updatedAt)}</p>}{quoteError && <p role="status">{quoteError}</p>}</div>
    <SectionShortcuts label={`Bereiche für ${asset.name}`} items={[{ id: 'asset-market-chart', label: 'Kursverlauf' }, ...(position ? [{ id: 'asset-position', label: 'Deine Position' }] : []), { id: 'asset-trading', label: 'Kaufen & verkaufen' }]} />
    <div id="asset-market-chart" tabIndex={-1} aria-label={`Kurschart ${asset.name}`}><MarketHistoryChart asset={{ ...asset, chartSource: "bitpanda" }} trades={position?.trades || []} /></div>
    <div id="asset-trading" tabIndex={-1}><AssetActionsPanel asset={asset} held={held} currentPrice={accountQuote?.price ?? asset.price ?? held?.currentPrice} onTradeCompleted={onTradeCompleted} /></div>
    {position ? <div id="asset-position" tabIndex={-1}><AssetDetailView asset={position} embedded>{comparison}</AssetDetailView></div> : comparison}
  </section>;
}

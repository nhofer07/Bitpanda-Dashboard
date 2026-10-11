import MarketHistoryChart from "./MarketHistoryChart.jsx";
import { useEffect, useMemo, useState } from "react";
import { addMarketWatchlistItem, readMarketWatchlist, writeMarketWatchlist } from "./marketWatchlist.js";

const eur = value => `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const marketMoney = (value, currency = "EUR") => new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const percent = value => value == null ? "–" : `${Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const categoryLabel = value => ({ stock: "Aktie", etf: "ETF", crypto: "Krypto" }[value] || "Asset");
const time = value => value ? new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–";

function portfolioAssets(data) {
  const items = new Map();
  // Die Watchlist soll das aktuelle Depot spiegeln, nicht jede jemals
  // gehandelte Position aus der Gewinn-/Verlust-Historie.
  for (const asset of data?.openPositions || []) {
    const symbol = String(asset.assetKey || asset.underlyingSymbol || "").toUpperCase();
    if (!symbol || symbol === "BCPEUR") continue;
    items.set(symbol, {
      symbol,
      name: asset.displayName || asset.name || symbol,
      category: asset.category || "other",
      portfolio: asset
    });
  }
  return [...items.values()];
}

export default function MarketAnalysisView({ dashboardData, loading: dashboardLoading }) {
  const [watchlist, setWatchlist] = useState(readMarketWatchlist);
  const [quotes, setQuotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [news, setNews] = useState([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [sort, setSort] = useState("change");
  const [newsFilter, setNewsFilter] = useState("all");
  const [visibleNewsCount, setVisibleNewsCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const portfolio = useMemo(() => portfolioAssets(dashboardData), [dashboardData]);
  const combined = useMemo(() => {
    const items = new Map(portfolio.map(item => [item.symbol, item]));
    for (const item of watchlist) items.set(item.symbol, { ...items.get(item.symbol), ...item });
    return [...items.values()];
  }, [portfolio, watchlist]);

  useEffect(() => {
    if (!combined.length) return;
    const controller = new AbortController();
    fetch(`/api/market/quotes?items=${encodeURIComponent(JSON.stringify(combined.map(({ symbol, category, name, portfolio }) => ({ symbol, category, name, isPortfolio: Boolean(portfolio) }))))}`, { signal: controller.signal })
      .then(response => response.json())
      .then(result => { if (result.error) throw new Error(result.error); setQuotes(result.items || []); })
      .catch(err => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [combined]);

  useEffect(() => {
    if (newsFilter === "watchlist") return;
    const topics = {
      all: "Aktien Kryptowährungen Wirtschaft",
      stock: "Aktien Börse Unternehmen",
      etf: "ETFs Fonds Index",
      crypto: "Kryptowährungen Bitcoin Ethereum",
      macro: "Wirtschaft Zinsen Inflation"
    };
    const endpoint = newsFilter === "all"
      ? "/api/market/news?scope=all"
      : `/api/market/news?q=${encodeURIComponent(topics[newsFilter] || topics.all)}`;
    fetch(endpoint)
      .then(response => response.json())
      .then(result => { if (result.error) throw new Error(result.error); setNews(result.items || []); })
      .catch(err => setError(current => current || err.message));
  }, [newsFilter]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 1) return setSearchResults([]);
    const timer = setTimeout(() => {
      fetch(`/api/market/search?q=${encodeURIComponent(clean)}`)
        .then(response => response.json()).then(result => setSearchResults(result.items || []))
        .catch(() => setSearchResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  async function chooseAsset(asset) {
    setSelected(asset);
    setNewsFilter("watchlist");
    setAnalysis(null);
    setVisibleNewsCount(6);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(asset.symbol)}&category=${encodeURIComponent(asset.category || "other")}&name=${encodeURIComponent(asset.name || "")}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analyse derzeit nicht verfügbar.");
      setAnalysis(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function addWatch(asset) {
    setWatchlist(current => {
      const next = addMarketWatchlistItem(current, asset);
      writeMarketWatchlist(next); return next;
    });
    setQuery(""); setSearchResults([]);
  }

  function removeWatch(symbol) {
    setWatchlist(current => { const next = current.filter(item => item.symbol !== symbol); writeMarketWatchlist(next); return next; });
  }

  const cards = combined.map(asset => ({ ...asset, quote: quotes.find(quote => quote.symbol === asset.symbol) }));
  const sorted = [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "category") return categoryLabel(a.category).localeCompare(categoryLabel(b.category));
    return Number(b.quote?.changePercent || 0) - Number(a.quote?.changePercent || 0);
  });
  const selectedPortfolio = selected && portfolio.find(item => item.symbol === selected.symbol)?.portfolio;
  const visibleNews = selected ? (analysis?.news || []) : news;
  const displayedNews = visibleNews.slice(0, visibleNewsCount);

  return <div className="market-analysis">
    <section className="hero-card market-hero">
      <div><div className="eyebrow">Research Cockpit</div><h1>Marktanalyse</h1><p>Vergleiche externe Analystenmeinungen, Kursziele, aktuelle Marktdaten und Nachrichten mit der transparent getrennten, regelbasierten Einschätzung des Dashboards.</p></div>
      <div className="hero-status"><span>Beobachtet</span><strong>{combined.length}</strong><small>{portfolio.length} aus deinem Portfolio</small></div>
    </section>

    <div className="info-box"><strong>Einordnung:</strong> „Analystenmeinung“ zeigt externe Finnhub-Daten. „Dashboard-Einschätzung“ wird aus festen Regeln berechnet. Beide können unvollständig oder falsch sein und sind keine Anlageberatung.</div>
    {error && <div className="error-box">{error}</div>}

    <section className="table-card watchlist-card">
      <div className="section-heading"><div><h3>Meine Watchlist</h3><span>Portfolio-Assets erscheinen automatisch und werden nicht lokal gespeichert.</span></div><select className="cashflow-select" value={sort} onChange={event => setSort(event.target.value)}><option value="change">Nach Tagesbewegung</option><option value="name">Nach Name</option><option value="category">Nach Anlageklasse</option></select></div>
      <div className="watchlist-add"><input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Symbol hinzufügen, z. B. META, BTC oder SPYY" />{searchResults.length > 0 && <div className="symbol-results">{searchResults.map(item => <button key={item.symbol} onClick={() => addWatch(item)}><span><strong>{item.symbol}</strong> · {item.name}</span><small>{categoryLabel(item.category)} · Hinzufügen</small></button>)}</div>}</div>
      {dashboardLoading ? <p className="muted">Portfolio wird geladen …</p> : <div className="watchlist-grid">{sorted.map(asset => <WatchCard key={asset.symbol} asset={asset} isSaved={watchlist.some(item => item.symbol === asset.symbol)} onChoose={chooseAsset} onRemove={removeWatch} />)}</div>}
      {!combined.length && <p className="muted">Füge ein Symbol hinzu oder lade dein Portfolio, um zu starten.</p>}
    </section>

    {selected && analysis && <section className="analysis-focus table-card"><div><span className="eyebrow">Ausgewählte Analyse</span><h2>{analysis.asset.name} <small>{analysis.asset.symbol}</small></h2><p>{categoryLabel(selected.category)} · Datenstand {time(analysis.asset.sourceUpdatedAt || analysis.updatedAt)}</p></div><div><strong>{marketMoney(analysis.asset.price, analysis.asset.currency)}</strong><span className={Number(analysis.asset.changePercent || 0) >= 0 ? "positive" : "negative"}>{percent(analysis.asset.changePercent)} heute</span></div></section>}

    <section className="analysis-layout">
      <div className="analysis-main">{selected && <MarketHistoryChart key={`${selected.symbol}:${selected.category}`} asset={selected} />}{analysis && <AnalystPanel analyst={analysis.analyst} currency={analysis.asset.currency} currentPrice={analysis.asset.price} />}<AnalysisPanel selected={selected} result={analysis} portfolio={selectedPortfolio} loading={loading} /></div>
      <section className="table-card market-news"><div className="section-heading"><div><h3>{selected ? `News zu ${selected.name}` : "Aktuelle Marktnews"}</h3><span>{selected ? `${visibleNews.length} Meldungen · neueste zuerst` : "Google News RSS · zuletzt geladen beim Seitenaufruf"}</span></div><div className="segmented-control market-news-filter">{!selected && <><button className={newsFilter === "all" ? "active" : ""} onClick={() => { setNewsFilter("all"); setVisibleNewsCount(6); }}>Alle</button><button className={newsFilter === "stock" ? "active" : ""} onClick={() => { setNewsFilter("stock"); setVisibleNewsCount(6); }}>Aktien</button><button className={newsFilter === "etf" ? "active" : ""} onClick={() => { setNewsFilter("etf"); setVisibleNewsCount(6); }}>ETFs</button><button className={newsFilter === "crypto" ? "active" : ""} onClick={() => { setNewsFilter("crypto"); setVisibleNewsCount(6); }}>Krypto</button><button className={newsFilter === "macro" ? "active" : ""} onClick={() => { setNewsFilter("macro"); setVisibleNewsCount(6); }}>Makro</button></>}</div></div><div className="news-impact-note">Automatische Einordnung anhand der Überschrift – keine Prognose der tatsächlichen Kursreaktion.</div><div className="news-list">{displayedNews.map((item, index) => <a key={`${item.url}-${index}`} className="news-item" href={item.url} target="_blank" rel="noreferrer"><span>{item.source} · {time(item.publishedAt)}</span><strong>{item.title}</strong><small><b className={`news-impact ${item.impact || "neutral"}`}>{item.impactLabel || "Neutral"}</b>Originalquelle öffnen ↗</small></a>)}{!visibleNews.length && <p className="muted news-empty">Noch keine Nachrichten verfügbar.</p>}</div>{visibleNewsCount < visibleNews.length && <button className="secondary-button older-news-button" onClick={() => setVisibleNewsCount(count => count + 6)}>Ältere News anzeigen ({visibleNews.length - visibleNewsCount})</button>}</section>
    </section>
  </div>;
}

function WatchCard({ asset, isSaved, onChoose, onRemove }) {
  const quote = asset.quote;
  const change = Number(quote?.changePercent || 0);
  return <article className="watch-card"><button className="watch-card-main" onClick={() => onChoose(asset)}><span className="pill category-pill">{categoryLabel(asset.category)}</span><strong>{asset.name}</strong><small>{asset.symbol}{asset.portfolio ? " · Im Portfolio" : ""}</small><b>{!quote ? "Kurs wird geladen …" : quote.error ? "Kurs nicht verfügbar" : `${marketMoney(quote.price, quote.currency)} · ${percent(change)}`}</b>{quote && !quote.error && <em className={change > 1 ? "positive" : change < -1 ? "negative" : "muted"}>{change > 1 ? "Kurzfristig positiv" : change < -1 ? "Kurzfristig negativ" : "Kurzfristig neutral"}</em>}{Number(quote?.volatility || 0) >= 4 && <i>Erhöhte Volatilität</i>}</button>{isSaved && <button className="watch-remove" onClick={() => onRemove(asset.symbol)} aria-label={`${asset.symbol} entfernen`}>×</button>}</article>;
}

function AnalysisPanel({ selected, result, portfolio, loading }) {
  if (!selected) return <section className="table-card analysis-empty"><h3>Asset auswählen</h3><p>Wähle ein Portfolio-Asset oder einen Eintrag aus deiner Watchlist, um aktuelle Nachrichten und eine regelbasierte Dateneinschätzung zu sehen.</p></section>;
  if (loading) return <section className="table-card analysis-empty"><h3>Analyse wird geladen …</h3><p>Kursdaten und Nachrichten werden abgefragt.</p></section>;
  if (!result) return <section className="table-card analysis-empty"><h3>Analyse nicht verfügbar</h3><p>Bitte später erneut versuchen.</p></section>;
  const { asset, analysis } = result;
  const change = Number(asset.changePercent || 0);
  const sourceTime = asset.sourceUpdatedAt || result.updatedAt;
  const stale = sourceTime && Date.now() - new Date(sourceTime).getTime() > 48 * 60 * 60 * 1000;
  return <section className="table-card analysis-card"><div className="section-heading"><div><span className="eyebrow">Dashboard-Einschätzung</span><h3>Regelbasierte Analyse</h3></div><strong className={change >= 0 ? "positive" : "negative"}>{percent(change)} heute</strong></div>{stale && <div className="market-stale">Achtung: Der letzte verfügbare Kurs ist älter als 48 Stunden. Die Einschätzung kann dadurch veraltet sein.</div>}<div className={`analysis-tendency ${analysis.tendency}`}><strong>Aktuelle Tendenz: {analysis.tendency}</strong><span>{analysis.tendency === "positiv" ? "Kursdaten sprechen aktuell eher dafür." : analysis.tendency === "negativ" ? "Kursdaten sprechen aktuell eher dagegen." : "Kursdaten liefern aktuell keine klare Richtung."}</span></div><p className="analysis-summary">{analysis.summary}</p><div className="analysis-reasons"><strong>Berechnungsgründe</strong>{analysis.reasons.map(reason => <span key={reason}>• {reason}</span>)}</div><div className="outlook-grid"><div><strong>Nächste Monate</strong><p>{analysis.outlook.months}</p></div><div><strong>Nächste Jahre</strong><p>{analysis.outlook.years}</p></div></div>{portfolio && <div className="portfolio-context"><span>Im Portfolio</span><div><small>Investiert</small><strong>{eur(portfolio.costBasis)}</strong></div><div><small>Aktueller Wert</small><strong>{portfolio.currentValue == null ? "–" : eur(portfolio.currentValue)}</strong></div><div><small>Realisiert</small><strong>{eur(portfolio.realizedProfit)}</strong></div><div><small>Unrealisiert</small><strong>{portfolio.unrealizedProfit == null ? "–" : eur(portfolio.unrealizedProfit)}</strong></div></div>}<div className="insight-columns"><div><h4>Chancen</h4>{analysis.opportunities.map(item => <p key={item}>• {item}</p>)}</div><div><h4>Risiken</h4>{analysis.risks.map(item => <p key={item}>• {item}</p>)}</div></div><h4>Szenarien</h4><div className="scenario-grid">{analysis.scenarios.map(item => <div key={item.label} className={`scenario ${item.tone}`}><strong>{item.label}</strong><p>{item.text}</p></div>)}</div><small className="source-note">Datenquellen: {result.sources.join(" · ")} · Letzter Kurs: {time(sourceTime)} · Abruf: {time(result.updatedAt)} · Regelbasierte Orientierung, keine Anlageberatung.</small></section>;
}

function AnalystPanel({ analyst }) {
  if (!analyst?.available) return <div className="analyst-panel unavailable"><strong>Analystenkonsens</strong><p>{analyst?.message || "Derzeit keine Analystendaten verfügbar."}</p></div>;
  const c = analyst.consensus || {};
  const buy = Number(c.strongBuy || 0) + Number(c.buy || 0);
  const hold = Number(c.hold || 0);
  const sell = Number(c.sell || 0) + Number(c.strongSell || 0);
  const total = buy + hold + sell;

  return <section className="table-card analyst-panel analyst-primary">
    <div className="analyst-heading">
      <div><span className="eyebrow">Externe Analystenmeinung</span><h3>Kaufen, halten oder verkaufen</h3><small>{analyst.source} · Berichtszeitraum {analyst.period || "–"}</small></div>
      <div className="analyst-verdict"><strong>{buy > sell && buy >= hold ? "Mehrheit positiv" : sell > buy && sell >= hold ? "Mehrheit negativ" : "Gemischtes Bild"}</strong><span>{total} Analystenstimmen</span></div>
    </div>

    <div className="analyst-section">
      <div className="analyst-counts"><span>Kaufen <b>{buy}</b><small>davon {Number(c.strongBuy || 0)} stark</small></span><span>Halten <b>{hold}</b></span><span>Verkaufen <b>{sell}</b><small>davon {Number(c.strongSell || 0)} stark</small></span></div>
      <div className="analyst-consensus-bar" aria-label={`${buy} Kauf-, ${hold} Halte- und ${sell} Verkaufsstimmen`}><i style={{ width: `${buy / total * 100}%` }} /><i style={{ width: `${hold / total * 100}%` }} /><i style={{ width: `${sell / total * 100}%` }} /></div>
    </div>
  </section>;
}

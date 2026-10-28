import AdaptiveTable from "./AdaptiveTable.jsx";
import { formatCurrency, formatNumber, formatPercent } from "./formatters.js";
import DataQuality from "./DataQuality.jsx";
import { positionDayChange as calculatePositionDayChange, usablePositionDayHistory } from "./positionDayChange.js";
import LoadingState from "./LoadingState.jsx";
import { useEffect, useRef, useState } from "react";
import { buildCashflowTotals } from "./helpers.js";
import useMarketHistoryRefresh from "./useMarketHistoryRefresh.js";
import { loadMarketHistorySnapshot, marketDateLabel } from "./marketHistory.js";
import PortfolioValueChart from "./PortfolioValueChart.jsx";
import { readMarketWatchlist, writeMarketWatchlist } from "./marketWatchlist.js";


function assetTitle(asset) {
  return asset?.displayName || asset?.name || asset?.assetKey || "-";
}

function assetSymbol(asset) {
  return asset?.assetKey || asset?.name || "-";
}

const ALLOCATION_COLORS = {
  stock: "#5bd7a2",
  crypto: "#70a7ff",
  etf: "#f3c969",
  metal: "#d8dde4",
  cash: "#9b7cff",
  other: "#8ea0ad"
};

const POSITION_CATEGORIES = [
  { key: "crypto", label: "Krypto" },
  { key: "etf", label: "ETFs" },
  { key: "stock", label: "Aktien" },
  { key: "metal", label: "Edelmetalle" },
  { key: "other", label: "Sonstige" }
];

function positionCategory(position) {
  return POSITION_CATEGORIES.some(category => category.key === position.category) ? position.category : "other";
}

function allocationColor(category) {
  return ALLOCATION_COLORS[category] || ALLOCATION_COLORS.other;
}

export default function PortfolioHome({ data, loading, error, onSelectAsset, cashflowOverrides = {} }) {
  const positionsRef = useRef(null);
  const [watchlist, setWatchlist] = useState(readMarketWatchlist);
  const [selectedPositionCategory, setSelectedPositionCategory] = useState("all");
  const portfolio = data?.portfolio || {};
  const liquidBalance = portfolio.liquidBalance || {};
  const positions = data?.openPositions || [];
  const positionGroups = POSITION_CATEGORIES.map(category => ({
    ...category,
    positions: positions.filter(position => positionCategory(position) === category.key)
  })).filter(group => group.positions.length)
    .map(group => ({
      ...group,
      totalValue: group.positions.reduce((total, position) => total + Number(position.currentValue || 0), 0)
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
  const activePositionCategory = positionGroups.some(group => group.key === selectedPositionCategory) ? selectedPositionCategory : "all";
  const profitAssets = data?.profitLoss?.assets || [];
  const allocation = buildAllocation(positions, liquidBalance, profitAssets);
  const marketHistoryRefreshKey = useMarketHistoryRefresh();
  const adjustedFiatNet = buildCashflowTotals(data?.transactions || [], cashflowOverrides).fiatNet;
  const accountReturn = portfolio.totalValue == null ? null : Number(portfolio.totalValue) - adjustedFiatNet;
  const accountReturnPercent = accountReturn != null && adjustedFiatNet > 0 ? accountReturn / adjustedFiatNet * 100 : null;
  const watchedAssets = watchlist.map(item => ({ ...item, assetKey: item.symbol, displayName: item.name }));

  function categoryNavigationProps(category) {
    const key = positionCategory({ category });
    if (category === "cash" || !positionGroups.some(group => group.key === key)) return {};
    const navigate = () => {
      setSelectedPositionCategory(key);
      positionsRef.current?.focus({ preventScroll: true });
      positionsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start"
      });
    };
    return {
      role: "button",
      tabIndex: 0,
      "aria-label": `${POSITION_CATEGORIES.find(group => group.key === key).label}: offene Positionen anzeigen`,
      "aria-controls": "open-positions",
      onClick: navigate,
      onKeyDown: event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate();
        }
      }
    };
  }

  function removeFromWatchlist(symbol) {
    setWatchlist(current => {
      const next = current.filter(item => item.symbol !== symbol);
      writeMarketWatchlist(next);
      return next;
    });
  }

  if (loading) return <LoadingState>Lade Portfolio …</LoadingState>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div className="portfolio-home">
      <section className="hero-card portfolio-hero">
        <div className="portfolio-balance">
          <div className="eyebrow">Dein Portfolio</div>
          <h2>{portfolio.totalValue == null ? "Nicht verfügbar" : formatCurrency(portfolio.totalValue)}</h2>
          <DataQuality kind={data?.cache?.status === "local-preview" ? "stale" : "calculated"}>Gesamtwert aus Bitpanda-Beständen</DataQuality>
          <p>Gesamtwert inklusive Fiat-Wallet und Cash Plus</p>
        </div>
        <div className="portfolio-balance-details">
          <div className="hero-status liquid-status">
            <span>Guthaben inkl. Cash Plus</span>
            <strong>{formatCurrency(liquidBalance.totalValue)}</strong>
            <small>Fiat {formatCurrency(liquidBalance.fiatValue)} · Cash Plus {formatCurrency(liquidBalance.cashPlusValue)}</small>
          </div>
          <div className="hero-status position-status">
            <span>Offene Positionen</span>
            <strong>{portfolio.openPositionCount || 0}</strong>
            <small>Assets in deinem Portfolio</small>
          </div>
        </div>

      </section>

      <div className="stats-grid portfolio-stats">
        <Metric title="Marktwert der Positionen" value={formatCurrency(portfolio.investedValue)} featured />
        <Metric
          title="Ergebnis gegenüber Netto-Einzahlungen"
          value={formatCurrency(accountReturn)}
          secondary={accountReturnPercent == null ? "Prozent nicht verfügbar" : `${formatPercent(accountReturnPercent)} der Netto-Einzahlungen`}
          tone={accountReturn >= 0 ? "positive" : "negative"}
          featured
        />
        <Metric
          title="Unrealisierter Gewinn / Verlust"
          value={formatCurrency(portfolio.unrealizedProfit)} quality={portfolio.unrealizedProfit == null ? "unknown" : "calculated"}
          secondary={formatPercent(portfolio.unrealizedProfitPercent)}
          tone={Number(portfolio.unrealizedProfit || 0) >= 0 ? "positive" : "negative"}
        />
        <Metric title="Netto-Einzahlungen" value={formatCurrency(adjustedFiatNet)} />
        <Metric title="Dividenden" value={formatCurrency(portfolio.dividends)} quality={portfolio.dividends == null ? "unknown" : "reported"} />
        <Metric title="Bezahlte KESt aus Verkäufen" value={data?.paidTax?.available ? formatCurrency(data.paidTax.salesPaid) : "Nicht verfügbar"} secondary="Alle Jahre · nach Erstattungen" quality={data?.paidTax?.available ? "reported" : "unknown"} />
      </div>

      <details className="portfolio-metric-help">
        <summary>Wie werden die Kennzahlen berechnet?</summary>
        <p>„Marktwert der Positionen“ ist der aktuelle Wert offener Positionen. „Unrealisierter Gewinn / Verlust“ ist aktueller Marktwert minus restliche Kostenbasis. „Fiat Netto“ ist Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten, gemäß deiner Buchungszuordnung. Rückerstattungen und ignorierte Buchungen sind darin nicht enthalten. „Ergebnis gegenüber Netto-Einzahlungen“ ist Gesamtwert minus Fiat Netto. Der Prozentwert bezieht sich auf die Netto-Einzahlungen; er ist keine zeitgewichtete Rendite.</p>
      </details>

      {data?.portfolioHistoryWarning && !data?.portfolioApiHistory?.available && <div className="warning-box" role="status">Chart-Aufzeichnung pausiert: {data.portfolioHistoryWarning} Der Verlauf zeigt die zuletzt vollständig erfassten Werte.</div>}
      <PortfolioValueChart initialHistory={data?.portfolioApiHistory} snapshots={data?.snapshots} currentValue={data?.portfolioHistoryWarning ? undefined : portfolio.totalValue} loadedAt={data?.loadedAt} historyStartedAt={data?.portfolioHistoryStartedAt} transactions={data?.transactions} cashflowOverrides={cashflowOverrides} />

      <section className="table-card snapshot-card allocation-card">
        <div className="section-heading">
          <h3>Allokation</h3>
          <span>{allocation.length} Kategorien</span>
        </div>
        <div className="allocation-layout">
          <div className="allocation-table-wrap">
            <AdaptiveTable className="clean-table compact allocation-table">
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th>Wert</th>
                  <th className="allocation-cost-basis-heading">Restliche Kostenbasis</th>
                  <th>Anteil</th>
                  <th>Unrealisiert</th>
                  <th>Realisiert</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map(item => (
                  <tr key={item.category} {...categoryNavigationProps(item.category)}>
                    <td>
                      <span className="allocation-label">
                        <span className="allocation-swatch" style={{ background: allocationColor(item.category) }} />
                        {item.categoryLabel}
                      </span>
                    </td>
                    <td>{formatCurrency(item.currentValue)}</td>
                    <td className={item.costBasis == null ? "muted" : undefined}>{item.costBasis == null ? "-" : formatCurrency(item.costBasis)}</td>
                    <td>{formatPercent(item.percent)}</td>
                    <td className={item.unrealizedProfit == null ? "muted" : Number(item.unrealizedProfit || 0) >= 0 ? "positive strong" : "negative strong"}>
                      {item.unrealizedProfit == null ? "-" : formatCurrency(item.unrealizedProfit)}
                    </td>
                    <td className={item.realizedProfit == null ? "muted" : Number(item.realizedProfit || 0) >= 0 ? "positive strong" : "negative strong"}>
                      {item.realizedProfit == null ? "-" : formatCurrency(item.realizedProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdaptiveTable>
          </div>
          <div className="allocation-mobile-list">
            {allocation.map(item => (
              <article key={item.category} className="allocation-mobile-card" {...categoryNavigationProps(item.category)}>
                <header>
                  <span className="allocation-label">
                    <span className="allocation-swatch" style={{ background: allocationColor(item.category) }} />
                    {item.categoryLabel}
                  </span>
                  <strong>{formatPercent(item.percent)}</strong>
                </header>
                <div>
                  <span><small>Wert</small><strong>{formatCurrency(item.currentValue)}</strong></span>
                  <span><small>Restliche Kostenbasis</small><strong className={item.costBasis == null ? "muted" : undefined}>{item.costBasis == null ? "–" : formatCurrency(item.costBasis)}</strong></span>
                  <span><small>Unrealisiert</small><strong className={item.unrealizedProfit == null ? "muted" : Number(item.unrealizedProfit || 0) >= 0 ? "positive" : "negative"}>{item.unrealizedProfit == null ? "–" : formatCurrency(item.unrealizedProfit)}</strong></span>
                  <span><small>Realisiert</small><strong className={item.realizedProfit == null ? "muted" : Number(item.realizedProfit || 0) >= 0 ? "positive" : "negative"}>{item.realizedProfit == null ? "–" : formatCurrency(item.realizedProfit)}</strong></span>
                </div>
              </article>
            ))}
          </div>
          <AllocationPie allocation={allocation} categoryNavigationProps={categoryNavigationProps} />
        </div>
      </section>

      <div className="overview-grid">
        <section className="top-card">
          <h3>Beste Position</h3>
          {portfolio.bestPosition ? (
            <AssetMini asset={portfolio.bestPosition} onSelectAsset={onSelectAsset} />
          ) : (
            <p className="muted">Keine Position vorhanden.</p>
          )}
        </section>

        <section className="top-card">
          <h3>Schwächste Position</h3>
          {portfolio.worstPosition ? (
            <AssetMini asset={portfolio.worstPosition} onSelectAsset={onSelectAsset} />
          ) : (
            <p className="muted">Keine Position vorhanden.</p>
          )}
        </section>
      </div>

      <section id="open-positions" ref={positionsRef} tabIndex={-1} aria-label="Offene Positionen" className="table-card portfolio-positions-card portfolio-positions-target">
        <div className="section-heading">
          <h3>Offene Positionen</h3>
          <span>{positions.length} Positionen</span>
        </div>
        <p className="portfolio-position-description">Marktwert und unrealisierte Ergebnisse auf einen Blick. Kostenbasis und weitere Kennzahlen findest du in den Positionsdetails.</p>
        {positions.length > 0 && <div className="position-category-filters" role="group" aria-label="Offene Positionen nach Anlageklasse filtern">
          {[{ key: "all", label: "Alle", positions }, ...positionGroups].map(group => (
            <button key={group.key} type="button" className="secondary-button position-category-filter" aria-pressed={activePositionCategory === group.key} onClick={() => setSelectedPositionCategory(group.key)}>
              {group.label} <span>{group.positions.length}</span>
            </button>
          ))}
        </div>}
        {(activePositionCategory === "all" ? [{ key: "all", label: "Alle Positionen", positions: [...positions].sort((a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0)) }] : positionGroups.filter(group => activePositionCategory === group.key)).map(group => (
          <section className="position-category-group" key={group.key} aria-label={group.label}>
            {group.key !== "all" && <div className="position-category-heading">
              <h4><span className="allocation-swatch" style={{ background: allocationColor(group.key) }} aria-hidden="true" />{group.label}</h4>
              <span>{group.positions.length} {group.positions.length === 1 ? "Position" : "Positionen"} · {formatCurrency(group.totalValue)}</span>
            </div>}
            <div className="position-card-grid">
              {group.positions.map(position => <PositionCard key={position.assetKey} position={position} onSelectAsset={onSelectAsset} marketHistoryRefreshKey={marketHistoryRefreshKey} />)}
            </div>
          </section>
        ))}
        {!positions.length && <p className="assets-empty">Keine offenen Positionen vorhanden.</p>}
      </section>

      <section className="table-card portfolio-positions-card portfolio-watchlist-card">
        <div className="section-heading">
          <div><h3>Watchlist</h3><span>Assets ohne offene Position beobachten</span></div>
          <span>{watchedAssets.length} Assets</span>
        </div>
        <div className="position-card-grid">
          {watchedAssets.map(asset => <PositionCard key={asset.assetKey} position={asset} onSelectAsset={onSelectAsset} marketHistoryRefreshKey={marketHistoryRefreshKey} watchlist onRemoveWatch={removeFromWatchlist} />)}
        </div>
        {!watchedAssets.length && <p className="assets-empty">Öffne ein Asset und wähle „Zur Watchlist hinzufügen“.</p>}
      </section>
    </div>
  );
}

function PositionCard({ position, onSelectAsset, marketHistoryRefreshKey, watchlist = false, onRemoveWatch }) {
  const [history, setHistory] = useState(null);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [dayHistory, setDayHistory] = useState(null);
  const [chartError, setChartError] = useState(false);
  useEffect(() => {
    let active = true;
    setHistory(null); setHistoryMeta(null); setChartError(false);
    loadMarketHistorySnapshot({ symbol: assetSymbol(position), name: assetTitle(position), category: position.category, chartSource: "bitpanda" }, "1d", marketHistoryRefreshKey).then(result => {
      if (active) {
        setHistory(result.history);
        setHistoryMeta({ currency: result.currency || "EUR", unit: result.unit || null, extendedHours: result.extendedHours || false });
      }
    }).catch(() => { if (active) setChartError(true); });
    return () => { active = false; };
  }, [position.assetKey, position.name, position.displayName, position.category, marketHistoryRefreshKey]);

  useEffect(() => {
    let active = true;
    setDayHistory(null);
    if (!watchlist && position.positionType !== "leverage") {
      loadMarketHistorySnapshot({ symbol: assetSymbol(position), name: assetTitle(position), category: position.category, chartSource: "bitpanda" }, "1w", marketHistoryRefreshKey)
        .then(result => { if (active && usablePositionDayHistory(result, position.category)) setDayHistory(result); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [position.assetKey, position.name, position.displayName, position.category, position.positionType, watchlist, marketHistoryRefreshKey]);

  const points = history || [];
  const prices = points.map(point => Number(point.close)).filter(Number.isFinite);
  const first = prices[0];
  const last = prices.at(-1);
  const watchPrice = last == null ? null : `${formatCurrency(last)}${historyMeta?.unit ? `/${historyMeta.unit}` : ""}`;
  const todayPercent = prices.length > 1 && first > 0 ? (last / first - 1) * 100 : null;
  const assetPriceChange = todayPercent == null ? null : last - first;
  const dayChange = calculatePositionDayChange(position, dayHistory?.history);
  const positionDayPercent = dayChange?.percent ?? null;
  const positionDayChange = dayChange?.amount ?? null;
  const positive = todayPercent == null ? Number(position.unrealizedProfit || 0) >= 0 : todayPercent >= 0;
  const marketDayLabel = marketDateLabel(points.at(-1)?.date);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const span = max - min || Math.max(Math.abs(max) * .01, 1);
  const line = prices.map((price, index) => `${prices.length === 1 ? 160 : index / (prices.length - 1) * 320},${92 - (price - min) / span * 80}`).join(" ");

  const openChart = () => onSelectAsset(position, { target: "chart" });

  return <article className="position-card">
    <div className="position-card-chart-link" role="button" tabIndex={0} aria-label={`Chart für ${assetTitle(position)} öffnen`} onClick={openChart} onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openChart();
      }
    }}>
    <header>
      <div className="position-card-identity"><span className="position-asset-mark" aria-hidden="true">{assetSymbol(position).slice(0, 2)}</span><div><strong title={assetTitle(position)}>{assetTitle(position)}</strong><small>{assetSymbol(position)} · {categoryName(position.category)}</small></div></div>
      <div className="position-card-value"><strong>{watchlist ? (chartError ? "–" : watchPrice || "Lädt …") : (position.currentValue == null ? "–" : formatCurrency(position.currentValue))}</strong><small>{watchlist ? "Aktueller Marktkurs" : position.currentPrice == null ? "Kurs –" : `${formatCurrency(position.currentPrice)} · ${position.priceSource === "Bitpanda Portfolio API" ? "Bitpanda-Portfolio" : "Ticker-Ersatz"}`}</small></div>
    </header>
    <div className="position-card-chart">
      {prices.length > 1 ? <svg viewBox="0 0 320 100" preserveAspectRatio="none" role="img" aria-label={`Kursverlauf ${assetTitle(position)} · ${marketDayLabel}`}><line x1="0" x2="320" y1="50" y2="50" /><polyline points={line} className={positive ? "positive-line" : "negative-line"} /></svg> : <div className="position-chart-placeholder">{chartError ? "Tageschart nicht verfügbar" : "Tageschart wird geladen …"}</div>}
    </div>
    <div className="position-card-today"><span>Asset-Kursänderung<small>{marketDayLabel} · pro Einheit</small></span><strong className={todayPercent == null ? "muted" : positive ? "positive" : "negative"}>{todayPercent == null ? "–" : <>{todayPercent >= 0 ? "+" : ""}{formatPercent(todayPercent)}{assetPriceChange != null && <small>{assetPriceChange >= 0 ? "+" : ""}{formatCurrency(assetPriceChange)}{historyMeta?.unit ? `/${historyMeta.unit}` : ""}</small>}</>}</strong></div>
    </div>
    {!watchlist && <dl className="position-card-summary">
      <div><dt>Unrealisiert</dt><dd className={position.unrealizedProfit == null ? "muted" : position.unrealizedProfit >= 0 ? "positive" : "negative"}>{formatCurrency(position.unrealizedProfit)}<small>{formatPercent(position.unrealizedProfitPercent)}</small></dd></div>
      <div><dt>Restmenge</dt><dd>{formatNumber(position.currentQuantity)}</dd></div>
    </dl>}
    <details className="position-card-details"><summary>{watchlist ? "Asset-Informationen" : "Positionsdetails"}</summary>
    {historyMeta?.extendedHours && <p className="data-note">Die Asset-Kursänderung berücksichtigt auch die Vor- und Nachbörse.</p>}
    {watchlist ? <dl><div><dt>Anlageklasse</dt><dd>{categoryName(position.category)}</dd></div><div><dt>Status</dt><dd>Watchlist</dd></div></dl> : <dl>
      <div><dt>Restmenge</dt><dd>{formatNumber(position.currentQuantity)}</dd></div>
      <div><dt>Positionsart</dt><dd>{position.positionType === "leverage" ? `Hebel · ${position.direction === "short" ? "Short" : "Long"}${position.leverage ? ` · ${formatNumber(position.leverage)}x` : ""}` : "Spot"}</dd></div>
      <div><dt title={position.positionSource}>Kostenbasis{position.reportedInvestedAmount != null ? " · Bitpanda" : " · Historie"}</dt><dd>{position.costBasis == null ? "–" : formatCurrency(position.costBasis)}</dd></div>
      <div><dt title="Verbleibende Kaufkosten einschließlich Kaufgebühren aus der Trade-Historie">Kaufkosten inkl. Gebühren</dt><dd>{position.historicalAcquisitionCost == null ? "–" : formatCurrency(position.historicalAcquisitionCost)}</dd></div>
      <div><dt>Realisierter Gewinn</dt><dd className={Number(position.realizedProfit || 0) >= 0 ? "positive" : "negative"}>{formatCurrency(position.realizedProfit)}</dd></div>
      <div><dt>Unrealisiert</dt><dd className={position.unrealizedProfit == null ? "muted" : Number(position.unrealizedProfit) >= 0 ? "positive" : "negative"}>{position.unrealizedProfit == null ? "–" : formatCurrency(position.unrealizedProfit)}<small>{formatPercent(position.unrealizedProfitPercent)}</small></dd></div>
      <div><dt title={position.averageEntrySource}>Ø Einstieg</dt><dd>{position.averageRemainingCost == null ? "–" : formatCurrency(position.averageRemainingCost)}</dd><DataQuality kind={position.averageRemainingCost == null ? "unknown" : position.averageEntrySource === "Bitpanda Portfolio API" ? "reported" : "estimated"} /></div>
      <div><dt>Bitpanda-Kurs · 24 h</dt><dd className={position.priceChangeDay == null ? "muted" : Number(position.priceChangeDay) >= 0 ? "positive" : "negative"}>{formatPercent(position.priceChangeDay)}</dd></div></dl>}
    {!watchlist && <div className="position-card-return">
      <span>Deine Positionsänderung · 24 h<small>Jetzt gegenüber vor 24 h · aktueller Bestand</small>{dayHistory && dayHistory.source !== "Bitpanda · Original-Kursdaten" && <small>Vergleichskurs: {dayHistory.resolvedSymbol || assetSymbol(position)} · {dayHistory.source} (EUR)</small>}</span>
      <strong className={positionDayChange == null ? "muted" : positionDayChange >= 0 ? "positive" : "negative"}>
        {positionDayChange == null ? "–" : `${positionDayChange >= 0 ? "+" : ""}${formatCurrency(positionDayChange)}`}
        <small>{positionDayPercent == null ? "–" : `${positionDayPercent >= 0 ? "+" : ""}${formatPercent(positionDayPercent)}`}</small>
      </strong>
    </div>}
    </details>
    {watchlist && <div className="position-card-actions"><button className="secondary-button" onClick={() => onRemoveWatch(position.assetKey)}>Entfernen</button></div>}
  </article>;
}

function categoryName(value) {
  return ({ stock: "Aktie", etf: "ETF", crypto: "Krypto", metal: "Edelmetall" })[value] || "Sonstiges";
}

function Metric({ title, value, secondary, tone, featured = false, quality = "calculated" }) {
  return (
    <div className={`metric-card${featured ? " metric-card-featured" : ""}`}>
      <span>{title}</span>
      <strong className={tone || ""}>{value}{secondary && <small className="metric-secondary">{secondary}</small>}</strong>
      <DataQuality kind={quality} />
    </div>
  );
}

function AssetMini({ asset, onSelectAsset }) {
  return (
    <button className="asset-mini" onClick={() => onSelectAsset(asset.assetKey)}>
      <span>
        <strong>{assetTitle(asset)}</strong>
        <small>{assetSymbol(asset)} · {formatCurrency(asset.currentValue)}</small>
      </span>
      <strong className={Number(asset.unrealizedProfit || 0) >= 0 ? "positive" : "negative"}>
        {formatCurrency(asset.unrealizedProfit)}
      </strong>
    </button>
  );
}

function AllocationPie({ allocation, categoryNavigationProps }) {
  const total = allocation.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  let cursor = 0;
  const gradient = total > 0
    ? allocation.map(item => {
      const start = cursor;
      const size = Number(item.currentValue || 0) / total * 100;
      cursor += size;
      return `${allocationColor(item.category)} ${start}% ${cursor}%`;
    }).join(", ")
    : `${ALLOCATION_COLORS.other} 0% 100%`;

  return (
    <div className="allocation-chart" aria-label="Portfolio-Verteilung">
      <div className="allocation-pie" style={{ background: `conic-gradient(from -90deg, ${gradient})` }}>
        <div>
          <span>Gesamt</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <div className="allocation-legend">
        {allocation.map(item => (
          <div key={item.category} {...categoryNavigationProps(item.category)}>
            <span className="allocation-swatch" style={{ background: allocationColor(item.category) }} />
            <span>{item.categoryLabel}</span>
            <strong>{formatPercent(item.percent)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildAllocation(positions, liquidBalance = {}, profitAssets = []) {
  const map = new Map();
  const realizedByCategory = new Map();

  for (const asset of profitAssets || []) {
    const category = asset.category || "other";
    const current = realizedByCategory.get(category) || {
      category,
      categoryLabel: asset.categoryLabel || "Sonstige",
      realizedProfit: 0
    };

    current.realizedProfit += Number(asset.realizedProfit || 0);
    realizedByCategory.set(category, current);
  }

  for (const position of positions) {
    const category = position.category || "other";
    const realizedCategory = realizedByCategory.get(category);
    const item = map.get(category) || {
      category,
      categoryLabel: position.categoryLabel || "Sonstige",
      currentValue: 0,
      costBasis: 0,
      unrealizedProfit: 0,
      realizedProfit: realizedCategory ? realizedCategory.realizedProfit : 0
    };

    item.currentValue += Number(position.currentValue || 0);
    item.costBasis += Number(position.costBasis || 0);
    item.unrealizedProfit += Number(position.unrealizedProfit || 0);
    item.realizedProfit = realizedCategory ? realizedCategory.realizedProfit : item.realizedProfit + Number(position.realizedProfit || 0);
    map.set(category, item);
  }

  const cashValue = Number(liquidBalance.totalValue || 0);

  if (cashValue > 0) {
    map.set("cash", {
      category: "cash",
      categoryLabel: "Cash",
      currentValue: cashValue,
      costBasis: null,
      unrealizedProfit: null,
      realizedProfit: null
    });
  }

  const total = Array.from(map.values()).reduce((sum, item) => sum + Number(item.currentValue || 0), 0);

  return Array.from(map.values())
    .map(item => ({
      ...item,
      percent: total > 0 ? item.currentValue / total * 100 : null
    }))
    .sort((a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0));
}

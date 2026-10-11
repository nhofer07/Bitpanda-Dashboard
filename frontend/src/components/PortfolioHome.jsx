import { useEffect, useState } from "react";
import { feeAdjustmentTotal, readProfitFeeAdjustments } from "./profitFeeAdjustments.js";
import { buildCashflowTotals } from "./helpers.js";
import useMarketHistoryRefresh from "./useMarketHistoryRefresh.js";
import { loadMarketHistorySnapshot, marketDateLabel } from "./marketHistory.js";
import PortfolioValueChart from "./PortfolioValueChart.jsx";
import { readMarketWatchlist, writeMarketWatchlist } from "./marketWatchlist.js";

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", {
    maximumFractionDigits: 8
  });
}

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("de-DE") : "-";
}

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

function allocationColor(category) {
  return ALLOCATION_COLORS[category] || ALLOCATION_COLORS.other;
}

export default function PortfolioHome({ data, loading, error, refreshing, onRefresh, onSelectAsset, cashflowOverrides = {} }) {
  const [watchlist, setWatchlist] = useState(readMarketWatchlist);
  const portfolio = data?.portfolio || {};
  const liquidBalance = portfolio.liquidBalance || {};
  const positions = data?.openPositions || [];
  const profitAssets = data?.profitLoss?.assets || [];
  // These optional entries are added on the profit/loss page. They live only
  // in this browser, so apply them here as well to keep both views identical.
  const feeAdjustments = readProfitFeeAdjustments().filter(entry => String(entry.assetKey || "").toUpperCase() !== "BCPEUR");
  const cache = data?.cache || {};
  const allocation = buildAllocation(positions, liquidBalance, profitAssets, feeAdjustments);
  const marketHistoryRefreshKey = useMarketHistoryRefresh();
  const adjustedFiatNet = buildCashflowTotals(data?.transactions || [], cashflowOverrides).fiatNet;
  const accountReturn = Number(portfolio.totalValue || 0) - adjustedFiatNet;
  const accountReturnPercent = adjustedFiatNet > 0 ? accountReturn / adjustedFiatNet * 100 : null;
  const watchedAssets = watchlist.map(item => ({ ...item, assetKey: item.symbol, displayName: item.name }));

  function removeFromWatchlist(symbol) {
    setWatchlist(current => {
      const next = current.filter(item => item.symbol !== symbol);
      writeMarketWatchlist(next);
      return next;
    });
  }

  if (loading) return <div className="loading-state">Lade Portfolio...</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div className="portfolio-home">
      <section className="hero-card portfolio-hero">
        <div className="portfolio-balance">
          <div className="eyebrow">Dein Portfolio</div>
          <h2>{formatCurrency(portfolio.totalValue)}</h2>
          <p>Gesamtwert inklusive Fiat-Wallet und Cash Plus</p>
        </div>
        <div className="portfolio-balance-details">
          <div className="hero-status liquid-status">
            <span>Verfügbares Guthaben</span>
            <strong>{formatCurrency(liquidBalance.totalValue)}</strong>
            <small>Fiat {formatCurrency(liquidBalance.fiatValue)} · Cash Plus {formatCurrency(liquidBalance.cashPlusValue)}</small>
          </div>
          <div className="hero-status position-status">
            <span>Offene Positionen</span>
            <strong>{portfolio.openPositionCount || 0}</strong>
            <small>Assets in deinem Portfolio</small>
          </div>
        </div>
        <div className="portfolio-sync">
          <div className="portfolio-sync-status">
            <span className={`portfolio-status-dot${cache.status === "local-preview" ? " is-preview" : ""}`} aria-hidden="true" />
            <span>{cache.status === "local-preview" ? "Lokale Vorschau" : "Datenstand"} · <time dateTime={data?.loadedAt}>{formatDate(data?.loadedAt)}</time></span>
          </div>
          <button className="secondary-button portfolio-refresh" onClick={onRefresh} disabled={refreshing}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.7 7a7 7 0 0 1 11.5-2L20 8M4 16l2.8 3A7 7 0 0 0 18.3 17" /></svg>
            {refreshing ? "Aktualisiere …" : "Aktualisieren"}
          </button>
        </div>
      </section>

      <details className="portfolio-metric-help">
        <summary>Wie werden die Kennzahlen berechnet?</summary>
        <p>„Investiert“ ist der aktuelle Marktwert offener Positionen. „Unrealisiert“ ist aktueller Marktwert minus restliche Kostenbasis. „Fiat Netto“ ist Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten, gemäß deiner Buchungszuordnung. Rückerstattungen und ignorierte Buchungen sind darin nicht enthalten. „Gesamtrendite“ ist Gesamtwert minus Fiat Netto; sie ist keine offizielle Bitpanda-Performancekennzahl.</p>
      </details>

      <div className="stats-grid portfolio-stats">
        <Metric title="Investiert" value={formatCurrency(portfolio.investedValue ?? portfolio.totalValue)} featured />
        <Metric
          title="Gesamtrendite"
          value={formatCurrency(accountReturn)}
          secondary={formatPercent(accountReturnPercent)}
          tone={accountReturn >= 0 ? "positive" : "negative"}
          featured
        />
        <Metric
          title="Unrealisiert"
          value={formatCurrency(portfolio.unrealizedProfit)}
          secondary={formatPercent(portfolio.unrealizedProfitPercent)}
          tone={Number(portfolio.unrealizedProfit || 0) >= 0 ? "positive" : "negative"}
        />
        <Metric title="Fiat Netto" value={formatCurrency(adjustedFiatNet)} />
        <Metric title="Dividenden" value={formatCurrency(portfolio.dividends)} />
      </div>

      {data?.portfolioHistoryWarning && <div className="warning-box" role="status">Chart-Aufzeichnung pausiert: {data.portfolioHistoryWarning} Der Verlauf zeigt die zuletzt vollständig erfassten Werte.</div>}
      <PortfolioValueChart snapshots={data?.snapshots} currentValue={data?.portfolioHistoryWarning ? undefined : portfolio.totalValue} loadedAt={data?.loadedAt} historyStartedAt={data?.portfolioHistoryStartedAt} transactions={data?.transactions} cashflowOverrides={cashflowOverrides} />

      <section className="table-card snapshot-card allocation-card">
        <div className="section-heading">
          <h3>Allokation</h3>
          <span>{allocation.length} Kategorien</span>
        </div>
        <div className="allocation-layout">
          <div className="allocation-table-wrap">
            <table className="clean-table compact allocation-table">
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
                  <tr key={item.category}>
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
            </table>
          </div>
          <div className="allocation-mobile-list">
            {allocation.map(item => (
              <article key={item.category} className="allocation-mobile-card">
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
          <AllocationPie allocation={allocation} />
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

      <section className="table-card portfolio-positions-card">
        <div className="section-heading">
          <h3>Offene Positionen</h3>
          <span>{positions.length} Positionen</span>
        </div>
        <p className="portfolio-position-description">Aktuelle Bestände aus Wallet und Trade-Historie. Unrealisiert ist der aktuelle Wert abzüglich der restlichen Kostenbasis; realisierte Ergebnisse stammen aus abgeschlossenen Verkäufen.</p>
        <div className="position-card-grid">
          {positions.map(position => <PositionCard key={position.assetKey} position={position} onSelectAsset={onSelectAsset} marketHistoryRefreshKey={marketHistoryRefreshKey} />)}
        </div>
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
  const [chartError, setChartError] = useState(false);
  useEffect(() => {
    let active = true;
    setHistory(null); setHistoryMeta(null); setChartError(false);
    loadMarketHistorySnapshot({ symbol: assetSymbol(position), name: assetTitle(position), category: position.category }, "1d", marketHistoryRefreshKey).then(result => {
      if (active) {
        setHistory(result.history);
        setHistoryMeta({ currency: result.currency || "EUR", unit: result.unit || null, extendedHours: result.extendedHours || false });
      }
    }).catch(() => { if (active) setChartError(true); });
    return () => { active = false; };
  }, [position.assetKey, position.name, position.displayName, position.category, marketHistoryRefreshKey]);

  const points = history || [];
  const prices = points.map(point => Number(point.close)).filter(Number.isFinite);
  const first = prices[0];
  const last = prices.at(-1);
  const watchPrice = last == null ? null : `${formatCurrency(last)}${historyMeta?.unit ? `/${historyMeta.unit}` : ""}`;
  const todayPercent = first && last ? (last / first - 1) * 100 : null;
  const todayValueChange = watchlist || todayPercent == null || !Number.isFinite(Number(position.currentValue)) || 100 + todayPercent === 0
    ? null
    : Number(position.currentValue) * todayPercent / (100 + todayPercent);
  const positive = todayPercent == null ? Number(position.unrealizedProfit || 0) >= 0 : todayPercent >= 0;
  const marketDayLabel = marketDateLabel(points.at(-1)?.date);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const span = max - min || Math.max(Math.abs(max) * .01, 1);
  const line = prices.map((price, index) => `${prices.length === 1 ? 160 : index / (prices.length - 1) * 320},${92 - (price - min) / span * 80}`).join(" ");

  return <article className="position-card">
    <header>
      <div className="position-card-identity"><span className="position-asset-mark" aria-hidden="true">{assetSymbol(position).slice(0, 2)}</span><div><strong title={assetTitle(position)}>{assetTitle(position)}</strong><small>{assetSymbol(position)} · {categoryName(position.category)}</small></div></div>
      <div className="position-card-value"><strong>{watchlist ? (chartError ? "–" : watchPrice || "Lädt …") : (position.currentValue == null ? "–" : formatCurrency(position.currentValue))}</strong><small>{watchlist ? "Aktueller Marktkurs" : position.currentPrice == null ? "Kurs –" : formatCurrency(position.currentPrice)}</small></div>
    </header>
    <div className="position-card-chart">
      {prices.length > 1 ? <svg viewBox="0 0 320 100" preserveAspectRatio="none" role="img" aria-label={`Kursverlauf ${assetTitle(position)} · ${marketDayLabel}`}><line x1="0" x2="320" y1="50" y2="50" /><polyline points={line} className={positive ? "positive-line" : "negative-line"} /></svg> : <div className="position-chart-placeholder">{chartError ? "Tageschart nicht verfügbar" : "Tageschart wird geladen …"}</div>}
    </div>
    <div className="position-card-today"><span>{marketDayLabel}{historyMeta?.extendedHours && <small>inkl. Vor-/Nachbörse</small>}</span><strong className={todayPercent == null ? "muted" : positive ? "positive" : "negative"}>{todayPercent == null ? "–" : <>{todayPercent >= 0 ? "+" : ""}{formatPercent(todayPercent)}{todayValueChange != null && <small> · {todayValueChange >= 0 ? "+" : ""}{formatCurrency(todayValueChange)}</small>}</>}</strong></div>
    {watchlist ? <dl><div><dt>Anlageklasse</dt><dd>{categoryName(position.category)}</dd></div><div><dt>Status</dt><dd>Watchlist</dd></div></dl> : <dl><div><dt>Restmenge</dt><dd>{formatNumber(position.currentQuantity)}</dd></div>
      <div><dt>Unrealisiert</dt><dd className={position.unrealizedProfit == null ? "muted" : Number(position.unrealizedProfit) >= 0 ? "positive" : "negative"}>{position.unrealizedProfit == null ? "–" : formatCurrency(position.unrealizedProfit)}<small>{formatPercent(position.unrealizedProfitPercent)}</small></dd></div>
      <div><dt>Kostenbasis</dt><dd>{formatCurrency(position.costBasis)}</dd></div>
      <div><dt>Ø Einstieg</dt><dd>{formatCurrency(position.averageRemainingCost)}</dd></div>
      <div><dt>Realisierter Gewinn</dt><dd className={Number(position.realizedProfit || 0) >= 0 ? "positive" : "negative"}>{formatCurrency(position.realizedProfit)}</dd></div>
      <div><dt>Positionsart</dt><dd>{position.positionType === "leverage" ? `Hebel · ${position.direction === "short" ? "Short" : "Long"}${position.leverage ? ` · ${formatNumber(position.leverage)}x` : ""}` : "Spot"}</dd></div>
      <div><dt>Bitpanda-Kurs · 24 h</dt><dd className={position.priceChangeDay == null ? "muted" : Number(position.priceChangeDay) >= 0 ? "positive" : "negative"}>{formatPercent(position.priceChangeDay)}</dd></div></dl>}
    <div className="position-card-actions"><button className="secondary-button" onClick={() => onSelectAsset(position)}>Details ansehen <span aria-hidden="true">↗</span></button>{watchlist && <button className="secondary-button" onClick={() => onRemoveWatch(position.assetKey)}>Entfernen</button>}</div>
  </article>;
}

function categoryName(value) {
  return ({ stock: "Aktie", etf: "ETF", crypto: "Krypto", metal: "Edelmetall" })[value] || "Sonstiges";
}


function Metric({ title, value, secondary, tone, featured = false }) {
  return (
    <div className={`metric-card${featured ? " metric-card-featured" : ""}`}>
      <span>{title}</span>
      <strong className={tone || ""}>{value}{secondary && <small className="metric-secondary">{secondary}</small>}</strong>
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

function AllocationPie({ allocation }) {
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
          <div key={item.category}>
            <span className="allocation-swatch" style={{ background: allocationColor(item.category) }} />
            <span>{item.categoryLabel}</span>
            <strong>{formatPercent(item.percent)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildAllocation(positions, liquidBalance = {}, profitAssets = [], feeAdjustments = []) {
  const map = new Map();
  const realizedByCategory = new Map();

  for (const asset of profitAssets || []) {
    const category = asset.category || "other";
    const current = realizedByCategory.get(category) || {
      category,
      categoryLabel: asset.categoryLabel || "Sonstige",
      realizedProfit: 0
    };

    current.realizedProfit += Number(asset.realizedProfit || 0) - feeAdjustmentTotal(feeAdjustments, asset.assetKey);
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

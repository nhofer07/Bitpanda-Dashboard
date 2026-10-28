import SectionShortcuts from "./SectionShortcuts.jsx";
import AdaptiveTable from "./AdaptiveTable.jsx";
import { formatCurrency as eur, formatNumber as num, formatPercent as percent } from "./formatters.js";
import PageIntro from "./PageIntro.jsx";
import DataQuality from "./DataQuality.jsx";
import LoadingState from "./LoadingState.jsx";
import PageDescription from "./PageDescription.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { hideAssetKey, readHiddenAssets, showAssetKey, writeHiddenAssets } from "./savedAssetView.js";

import { getProfitValue, realizedTradingFees } from "./profitResults.js";

const dt = time => time?.date_iso8601 ? new Date(time.date_iso8601).toLocaleString("de-DE") : "-";
const categoryLabel = asset => asset.categoryLabel || "Sonstige";
const assetTitle = asset => asset.displayName || asset.name || asset.assetKey || "-";
const assetSymbol = asset => asset.assetKey || asset.name || "-";
const visibleCategory = item => (item.category || "other") !== "other";
const isCashPlusAsset = asset => String(asset?.assetKey || asset?.name || "").toUpperCase() === "BCPEUR";
const profitModes = {
  realized: { title: "Gewinn / Verlust aus Verkäufen · netto", column: "Verkäufe · netto" },
  unrealized: { title: "Unrealisierter Gewinn / Verlust", column: "Unrealisiert" },
  combined: { title: "Verkäufe netto + unrealisierter Gewinn / Verlust", column: "Gesamt" }
};

function calculateAssetNetResults(asset) {
  return {
    ...asset,
    // The backend reads the actual Bitpanda price/fee fields and is the single
    // source of truth for every view. Recalculating here caused stock values to
    // differ from the dashboard and the tax cockpit.
    trades: [...(asset.trades || [])],
    grossRealizedProfit: Number(asset.grossRealizedProfit || 0),
    realizedProfit: Number(asset.realizedProfit || 0),
    estimatedTax: Number(asset.estimatedTax || 0),
    tradingFees: Number(asset.tradingFees || 0)
  };
}

export default function ProfitLossView({ onSelectAsset, dashboardData }) {
  const [data, setData] = useState({ assets: [], top: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState("all");
  const [profitMode, setProfitMode] = useState("realized");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("default");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [hiddenAssets, setHiddenAssets] = useState(() => readHiddenAssets());

  useEffect(() => {
    let active = true;
    const apply = result => {
      if (!active) return;
      setData({ ...(result.profitLoss || {}), openPositions: result.openPositions || [], portfolio: result.portfolio || {}, dividends: result.dividends || [], paidTax: result.paidTax, accountInsights: result.accountInsights });
      setError(""); setLoading(false);
    };
    if (dashboardData) apply(dashboardData);
    else fetch("/api/dashboard-data").then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Fehler beim Laden");
      apply(result);
    }).catch(err => { if (active) { setError(err.message); setLoading(false); } });
    return () => { active = false; };
  }, [dashboardData]);

  function removeFromSavedView(assetKey) {
    setHiddenAssets(current => {
      const next = hideAssetKey(assetKey, current);
      writeHiddenAssets(next);
      if (open === assetKey) setOpen(null);
      return next;
    });
  }

  function addBackToSavedView(assetKey) {
    setHiddenAssets(current => {
      const next = showAssetKey(assetKey, current);
      writeHiddenAssets(next);
      return next;
    });
  }

  function resetSavedView() {
    setHiddenAssets([]);
    writeHiddenAssets([]);
  }

  const assets = (data.assets || []).filter(asset => !isCashPlusAsset(asset));
  const openPositionMap = useMemo(() => new Map((data.openPositions || []).map(position => [String(position.assetKey), position])), [data.openPositions]);
  const hiddenSet = useMemo(() => new Set(hiddenAssets.map(String)), [hiddenAssets]);
  const enrichedAssets = useMemo(() => assets.map(sourceAsset => {
    const asset = calculateAssetNetResults(sourceAsset);
    const openPosition = openPositionMap.get(String(asset.assetKey));

    return {
      ...asset,
      currentQuantity: openPosition?.currentQuantity ?? asset.currentQuantity,
      costBasis: openPosition ? openPosition.costBasis : asset.costBasis,
      averageRemainingCost: openPosition ? openPosition.averageRemainingCost : asset.averageRemainingCost,
      averageEntrySource: openPosition?.averageEntrySource,
      currentValue: openPosition?.currentValue ?? null,
      currentPrice: openPosition?.currentPrice ?? null,
      unrealizedProfit: Number(openPosition?.unrealizedProfit || 0),
      unrealizedProfitPercent: openPosition?.unrealizedProfitPercent ?? null,
      netRealizedProfit: Number(asset.realizedProfit || 0)
    };
  }), [assets, openPositionMap]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedAssets
      .filter(asset => mode === "all" || !hiddenSet.has(String(asset.assetKey)))
      .filter(asset => categoryFilter === "all" || (asset.category || "other") === categoryFilter)
      .filter(asset => !query || `${assetTitle(asset)} ${assetSymbol(asset)}`.toLowerCase().includes(query));
  }, [categoryFilter, enrichedAssets, hiddenSet, mode, search]);

  const sortedAssets = useMemo(() => {
    if (sortOrder === "default") return visible;
    return [...visible].sort((a, b) => {
      const aProfit = getProfitValue(a, profitMode);
      const bProfit = getProfitValue(b, profitMode);
      return sortOrder === "highest" ? bProfit - aProfit : aProfit - bProfit;
    });
  }, [profitMode, sortOrder, visible]);

  useEffect(() => { setPage(0); }, [search, mode, categoryFilter, sortOrder, profitMode]);
  const pageCount = Math.max(1, Math.ceil(sortedAssets.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedAssets = sortedAssets.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const incompleteAssets = new Set((data.warnings || []).map(warning => warning.asset));

  function changePage(next) {
    setPage(next);
    const target = document.getElementById('profit-assets');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  const hiddenCount = assets.filter(asset => hiddenSet.has(String(asset.assetKey))).length;
  const isCompleteView = visible.length === enrichedAssets.length;
  const generalTaxAdjustment = isCompleteView ? Number(data.unallocatedTaxAdjustment || 0) : 0;
  const totalProfit = visible.reduce((sum, asset) => sum + getProfitValue(asset, profitMode), 0) - (profitMode === "unrealized" ? 0 : generalTaxAdjustment);
  const totalGrossProfit = visible.reduce((sum, asset) => sum + Number(asset.grossRealizedProfit || 0), 0);
  const totalTradingFees = visible.reduce((sum, asset) => sum + Number(asset.tradingFees || 0), 0);
  const totalFinancingFees = visible.reduce((sum, asset) => sum + Number(asset.financingFees || 0), 0);
  const paidDividendTax = data.accountInsights?.available ? data.accountInsights.sourceTax?.totalPaid : null;
  const categorySummary = useMemo(() => buildCategorySummary(visible, profitMode).filter(visibleCategory), [profitMode, visible]);
  const ranking = useMemo(() => {
    const withProfit = visible.map(asset => ({
      ...asset,
      selectedProfit: getProfitValue(asset, profitMode)
    }));

    return {
      winners: withProfit
        .filter(asset => asset.selectedProfit > 0)
        .sort((a, b) => b.selectedProfit - a.selectedProfit)
        .slice(0, 8),
      losers: withProfit
        .filter(asset => asset.selectedProfit < 0)
        .sort((a, b) => a.selectedProfit - b.selectedProfit)
        .slice(0, 8)
    };
  }, [profitMode, visible]);
  const allCategorySummary = useMemo(() => buildCategorySummary(
    enrichedAssets.filter(asset => mode === "all" || !hiddenSet.has(String(asset.assetKey))),
    profitMode
  ).filter(visibleCategory), [enrichedAssets, hiddenSet, mode, profitMode]);

  if (loading) return <LoadingState>Gewinne und Verluste werden geladen …</LoadingState>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div className="profit-loss-view">
      <PageIntro>
        <div>

          <PageDescription summary="Realisierte Ergebnisse nach Gebühren und Steuern, aufgeteilt nach Asset und Anlageklasse.">
            Brutto G/V basiert auf den Fiat-Beträgen vor Kauf- und Verkaufsgebühren. Netto G/V berücksichtigt die ausgewiesenen Handelsgebühren und gebuchte KESt nach zugeordneten Erstattungen. Die gesamte bezahlte KESt enthält zusätzlich allgemeine Steuererstattungen und bezahlte Nachforderungen.
            Gebühren und bezahlte KESt stammen aus den Bitpanda-Buchungen. Kostenbasis und Gewinne werden daraus berechnet. Bezahlte KESt und Quellensteuer gelten für alle geladenen Jahre und Assets; die übrigen Kennzahlen folgen deiner Auswahl. Allgemeine Steuerkorrekturen sind im Gesamtergebnis aller Assets enthalten und werden keinem einzelnen Asset zugeteilt.
          </PageDescription>
        </div>
        <div className="hero-status">
          <span>{mode === "all" ? "Alle Assets" : "Gespeicherte Ansicht"}</span>
          <strong>{visible.length}</strong>
        </div>
      </PageIntro>

      <SectionShortcuts label="Bereiche der Gewinnauswertung" items={[{ id: 'profit-summary', label: 'Überblick' }, { id: 'profit-ranking', label: 'Gewinner & Verlierer' }, { id: 'profit-assets', label: 'Alle Assets' }]} />
      <div className="view-panel">
        <div className="segmented-control" aria-label="Ansicht umschalten">
          <button className={mode === "saved" ? "active" : ""} onClick={() => setMode("saved")}>Gespeicherte Ansicht</button>
          <button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>Alle Assets</button>
        </div>

        <div className="segmented-control" aria-label="Gewinnart umschalten">
          <button className={profitMode === "realized" ? "active" : ""} onClick={() => setProfitMode("realized")}>Realisiert</button>
          <button className={profitMode === "unrealized" ? "active" : ""} onClick={() => setProfitMode("unrealized")}>Unrealisiert</button>
          <button className={profitMode === "combined" ? "active" : ""} onClick={() => setProfitMode("combined")}>Gesamt</button>
        </div>

        <div className="segmented-control category-control" aria-label="Anlageklasse filtern">
          <button className={categoryFilter === "all" ? "active" : ""} onClick={() => setCategoryFilter("all")}>
            Alle
          </button>
          {allCategorySummary.map(item => (
            <button
              key={item.category}
              className={categoryFilter === item.category ? "active" : ""}
              onClick={() => setCategoryFilter(item.category)}
            >
              {item.categoryLabel}
              <span>{item.assetCount}</span>
            </button>
          ))}
        </div>

        <span className="view-context">{visible.length} Assets · {hiddenCount} ausgeblendet</span>
        <button className="secondary-button" onClick={resetSavedView} disabled={hiddenCount === 0}>
          Ansicht zurücksetzen
        </button>
      </div>



      <div id="profit-summary" tabIndex={-1} className="stats-grid profit-stats-grid">
        <Metric title={profitModes[profitMode].title} value={eur(totalProfit)} tone={totalProfit >= 0 ? "positive" : "negative"} />
        <Metric title="Gewinn / Verlust aus Verkäufen · brutto" value={eur(totalGrossProfit)} tone={totalGrossProfit >= 0 ? "positive" : "negative"} />
        <Metric title="Trading-Gebühren" value={eur(totalTradingFees)} />
        <Metric title="Hebel-Finanzierungskosten" value={eur(totalFinancingFees)} />
        <Metric title="Bezahlte KESt aus Verkäufen · gesamt" value={data.paidTax?.available ? eur(data.paidTax.salesPaid) : "Nicht verfügbar"} />
        <Metric title="Bezahlte Quellensteuer · gesamt" value={paidDividendTax == null ? "Nicht verfügbar" : eur(paidDividendTax)} />
      </div>

      {!data.paidTax?.available && <div className="info-box">{data.paidTax?.error || "Steuerbuchungen sind noch nicht verfügbar. Bitte Dashboard aktualisieren."} Gewinne enthalten solange keinen KESt-Abzug.</div>}

      {(data.warnings || []).length > 0 && <div className="warning-box">Vorläufige Ergebnisse · Kostenbasis teilweise unvollständig: {(data.warnings || []).map(w => w.asset).join(", ")}. Rewards, Transfers oder fehlende Käufe können die berechneten Gewinne beeinflussen. Gebuchte Gebühren und Steuern bleiben davon unabhängig.</div>}

      <CategoryOverview summary={categorySummary} mode={profitMode} />

      <div id="profit-ranking" tabIndex={-1}><Ranking items={ranking} mode={profitMode} /></div>

      <div id="profit-assets" tabIndex={-1} className="toolbar profit-assets-toolbar">
        <input
          className="search-input"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Asset suchen..."
        />
        <label className="profit-sort-control">
          <span>Sortierung</span>
          <select className="cashflow-select" value={sortOrder} onChange={event => setSortOrder(event.target.value)}>
            <option value="default">Standard</option>
            <option value="highest">Höchstes Ergebnis zuerst</option>
            <option value="lowest">Niedrigstes Ergebnis zuerst</option>
          </select>
        </label>
      </div>

      {mode === "saved" && hiddenCount > 0 && (
        <div className="info-box">
          In deiner gespeicherten Ansicht sind {hiddenCount} Assets ausgeblendet. Mit „Alle Assets“ kannst du sie trotzdem sehen und einzeln wieder hinzufügen.
        </div>
      )}

      <div className="mobile-profit-list">
        {pagedAssets.map(asset => {
          const result = getProfitValue(asset, profitMode);
          const hidden = hiddenSet.has(String(asset.assetKey));
          return <article className="mobile-profit-card" key={asset.assetKey}>
            <header><div><strong>{assetTitle(asset)}</strong><small>{assetSymbol(asset)} · {categoryLabel(asset)}</small>{incompleteAssets.has(asset.assetKey) && <small className="data-gap-label">Kostenbasis unvollständig</small>}</div><strong className={result >= 0 ? "positive" : "negative"}>{eur(result)}</strong></header>
            <small>{profitModes[profitMode].column} · <DataQuality /></small>
            <details><summary>Gebühren & weitere Werte</summary><dl>
              <div><dt>Verkäufe · brutto</dt><dd>{eur(asset.grossRealizedProfit)}</dd></div>
              <div><dt>Gebühren inkl. Finanzierung</dt><dd>{eur(Number(asset.tradingFees || 0) + Number(asset.financingFees || 0))}</dd></div>
              <div><dt>Gebuchte KESt</dt><dd>{eur(asset.estimatedTax)}</dd></div>
              <div><dt>Gekauft / verkauft</dt><dd>{eur(asset.totalBoughtFiat)} / {eur(asset.totalSoldFiat)}</dd></div>
              <div><dt>Restmenge</dt><dd>{num(asset.currentQuantity)}</dd></div>
            </dl></details>
            <footer><button className="secondary-button" onClick={() => onSelectAsset?.(asset)}>Asset-Details</button><button className="secondary-button" onClick={() => hidden ? addBackToSavedView(asset.assetKey) : removeFromSavedView(asset.assetKey)}>{hidden ? "Einblenden" : "Ausblenden"}</button></footer>
          </article>;
        })}
      </div>
      <div className="table-card profit-desktop-table">
        <AdaptiveTable className="clean-table">
          <thead>
            <tr>{["Asset", profitModes[profitMode].column, "Brutto G/V", "Gebühren", "KESt", "Gekauft", "Verkauft", "Restmenge", "Käufe", "Verkäufe", "Gespeicherte Ansicht", "Details"].map(header => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {pagedAssets.map(asset => {
              const profit = getProfitValue(asset, profitMode);
              const isOpen = open === asset.assetKey;
              const isHidden = hiddenSet.has(String(asset.assetKey));

              return (
                <React.Fragment key={asset.assetKey}>
                  <tr className={isHidden ? "muted-row" : ""}>
                    <td>
                      <strong>{assetTitle(asset)}</strong>
                      <small className="fee-detail-meta">{assetSymbol(asset)} · {categoryLabel(asset)}</small>
                      {incompleteAssets.has(asset.assetKey) && <small className="data-gap-label">Kostenbasis unvollständig</small>}
                    </td>
                    <td className={profit >= 0 ? "positive strong" : "negative strong"}>{eur(profit)}</td>
                    <td className={Number(asset.grossRealizedProfit || 0) >= 0 ? "positive" : "negative"}>{eur(asset.grossRealizedProfit)}</td>
                    <td>{eur(Number(asset.tradingFees || 0) + Number(asset.financingFees || 0))}</td>
                    <td>{eur(asset.estimatedTax)}</td>
                    <td>{eur(asset.totalBoughtFiat)}</td>
                    <td>{eur(asset.totalSoldFiat)}</td>
                    <td>{num(asset.currentQuantity)}</td>
                    <td>{asset.buyCount}</td>
                    <td>{asset.sellCount}</td>
                    <td>
                      {isHidden ? (
                        <button className="restore-button small-button" onClick={() => addBackToSavedView(asset.assetKey)}>
                          Wieder hinzufügen
                        </button>
                      ) : (
                        <button className="secondary-button small-button" onClick={() => removeFromSavedView(asset.assetKey)}>
                          Ausblenden
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="secondary-button small-button" onClick={() => onSelectAsset ? onSelectAsset(asset) : setOpen(isOpen ? null : asset.assetKey)}>
                        {onSelectAsset ? "Details" : isOpen ? "Schließen" : "Öffnen"}
                      </button>
                    </td>
                  </tr>
                  {!onSelectAsset && isOpen && (
                    <tr>
                      <td colSpan="12" className="details-row">
                        <Details asset={asset} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </AdaptiveTable>
      </div>

      {pageCount > 1 && <nav className="account-pagination profit-pagination" aria-label="Asset-Seiten">
        <span aria-live="polite">{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sortedAssets.length)} von {sortedAssets.length} Assets</span>
        <div><button className="secondary-button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Zurück</button><span>Seite {currentPage + 1} / {pageCount}</span><button className="secondary-button" disabled={currentPage >= pageCount - 1} onClick={() => changePage(currentPage + 1)}>Weiter</button></div>
      </nav>}

      {visible.length === 0 && (
        <div className="empty-state">
          <h2>Keine Assets in dieser Ansicht</h2>
          <p>Setze die gespeicherte Ansicht zurück oder wechsle auf „Alle Assets“.</p>
        </div>
      )}
    </div>
  );
}

function buildCategorySummary(assets, mode = "realized") {
  const map = new Map();

  for (const asset of assets) {
    const category = asset.category || "other";
    const item = map.get(category) || {
      category,
      categoryLabel: categoryLabel(asset),
      assetCount: 0,
      totalBoughtFiat: 0,
      realizedProfit: 0,
      grossRealizedProfit: 0,
      grossGains: 0,
      grossLosses: 0,
      tradingFees: 0,
      estimatedTax: 0,
      netRealizedProfit: 0,
      netGains: 0,
      netLosses: 0,
      unrealizedProfit: 0,
      currentValue: 0,
      costBasis: 0
    };

    item.assetCount += 1;
    item.realizedProfit += getProfitValue(asset, mode);
    item.totalBoughtFiat += Number(asset.totalBoughtFiat || 0);
    item.grossRealizedProfit += Number(asset.grossRealizedProfit || 0);
    item.grossGains += Math.max(0, Number(asset.grossRealizedProfit || 0));
    item.grossLosses += Math.min(0, Number(asset.grossRealizedProfit || 0));
    item.tradingFees += realizedTradingFees(asset);
    item.estimatedTax += Number(asset.estimatedTax || 0);
    const assetNetProfit = Number(asset.netRealizedProfit ?? asset.realizedProfit ?? 0);
    item.netRealizedProfit += assetNetProfit;
    item.netGains += Math.max(0, assetNetProfit);
    item.netLosses += Math.min(0, assetNetProfit);
    item.unrealizedProfit += Number(asset.unrealizedProfit || 0);
    item.currentValue += Number(asset.currentValue || 0);
    item.costBasis += Number(asset.costBasis || 0);
    map.set(category, item);
  }

  return Array.from(map.values()).sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel, "de"));
}

function CategoryOverview({ summary, mode }) {
  const [showGrossSplit, setShowGrossSplit] = useState(false);

  return (
    <div className="category-overview">
      <div className="section-heading flush-heading">
        <h3>Gewinn / Verlust nach Anlageklasse</h3>
        <div className="section-heading-actions">
          {mode === "realized" && <label className="toggle-row">
            <input type="checkbox" checked={showGrossSplit} onChange={event => setShowGrossSplit(event.target.checked)} />
            <span>Brutto aufteilen</span>
          </label>}
          <span>{summary.length} Kategorien</span>
        </div>
      </div>

      {summary.length === 0 ? (
        <p className="muted category-empty">Keine Kategorien in dieser Ansicht.</p>
      ) : (
        <div className="category-summary-grid">
          {summary.map(item => {
            const grossProfit = Number(item.grossRealizedProfit || 0);
            const grossGains = Number(item.grossGains || 0);
            const grossLosses = Number(item.grossLosses || 0);
            const fees = Number(item.tradingFees || 0);
            const tax = Number(item.estimatedTax || 0);
            const netProfit = Number(item.netRealizedProfit || 0);
            const netGains = Number(item.netGains || 0);
            const netLosses = Number(item.netLosses || 0);
            const unrealizedProfit = Number(item.unrealizedProfit || 0);
            const selectedProfit = Number(item.realizedProfit || 0);
            const bought = Number(item.totalBoughtFiat || 0);
            const basis = mode === "unrealized" ? Number(item.costBasis || 0) : bought;
            const selectedPercent = basis > 0 ? selectedProfit / basis * 100 : null;

            return (
              <div key={item.category} className="category-summary-card">
                <div className="category-summary-card__top">
                  <span>{item.categoryLabel}</span>
                  <strong>{item.assetCount}</strong>
                </div>
                <div className={selectedProfit >= 0 ? "positive category-profit" : "negative category-profit"}>
                  {eur(selectedProfit)}
                  {selectedPercent !== null && <small>{percent(selectedPercent)}</small>}
                </div>
                {mode === "unrealized" ? <>
                  <div className="detail-row"><span>Aktueller Wert</span><strong>{eur(item.currentValue)}</strong></div>
                  <div className="detail-row"><span>Restkostenbasis</span><strong>{eur(item.costBasis)}</strong></div>
                  <div className="detail-row"><span>Unrealisiert</span><strong className={unrealizedProfit >= 0 ? "positive" : "negative"}>{eur(unrealizedProfit)}</strong></div>
                </> : mode === "combined" ? <>
                  <div className="detail-row"><span>Netto realisiert</span><strong className={netProfit >= 0 ? "positive" : "negative"}>{eur(netProfit)}</strong></div>
                  <div className="detail-row"><span>Unrealisiert</span><strong className={unrealizedProfit >= 0 ? "positive" : "negative"}>{eur(unrealizedProfit)}</strong></div>
                  <div className="detail-row"><span>Gesamt G/V</span><strong className={selectedProfit >= 0 ? "positive" : "negative"}>{eur(selectedProfit)}</strong></div>
                </> : showGrossSplit ? (
                  <>
                    <div className="detail-row"><span>Brutto-Gewinne</span><strong className="positive">{eur(grossGains)}</strong></div>
                    <div className="detail-row"><span>Brutto-Verluste</span><strong className="negative">{eur(grossLosses)}</strong></div>
                  </>
                ) : (
                  <div className="detail-row"><span>Brutto G/V</span><strong className={grossProfit >= 0 ? "positive" : "negative"}>{eur(grossProfit)}</strong></div>
                )}
                {mode === "realized" && <><div className="detail-row"><span>Gebühren der Verkäufe inkl. Kaufanteil</span><strong>{eur(fees)}</strong></div>
                <div className="detail-row"><span>Gebuchte KESt</span><strong>{eur(tax)}</strong></div>
                {showGrossSplit ? (
                  <>
                    <div className="detail-row"><span>Netto-Gewinne</span><strong className="positive">{eur(netGains)}</strong></div>
                    <div className="detail-row"><span>Netto-Verluste</span><strong className="negative">{eur(netLosses)}</strong></div>
                  </>
                ) : (
                  <div className="detail-row"><span>Netto G/V</span><strong className={netProfit >= 0 ? "positive" : "negative"}>{eur(netProfit)}</strong></div>
                )}</>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Details({ asset }) {
  return (
    <div>
      <h3>Trade-Details: {assetTitle(asset)}</h3>
      <p className="muted">
        Symbol: {assetSymbol(asset)} · Restliche Kostenbasis: {asset.costBasis == null ? "–" : eur(asset.costBasis)} {asset.averageEntrySource === "Bitpanda Portfolio API" ? "(laut Bitpanda)" : "(aus Trade-Historie, ohne separat ausgewiesene Kaufgebühren)"} · Trading-Gebühren: {eur(asset.tradingFees)} · Automatische Finanzierungsgebühren: {eur(asset.financingFees)} · Gebuchte KESt: {eur(asset.estimatedTax)}
      </p>
      <div className="details-table-wrap">
        <AdaptiveTable className="clean-table compact">
          <thead>
            <tr>{["Datum", "Typ", "Menge", "Fiat", "Preis", "Brutto G/V", "Gebühr", "KESt", "Steuerquelle", "Netto G/V", "Monat", "Jahr"].map(header => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {(asset.trades || []).map(trade => {
              const profit = trade.realizedProfit;
              const grossProfit = trade.grossRealizedProfit;
              return (
                <tr key={trade.id}>
                  <td>{dt(trade.time)}</td>
                  <td>
                    <span className="trade-type">
                      {trade.type === "buy" ? "Kauf" : "Verkauf"}
                      {trade.isSavings && <span className="savings-marker" title="Sparplan-Ausführung">Sparplan</span>}
                    </span>
                  </td>
                  <td>{num(trade.quantity)}</td>
                  <td>{eur(trade.fiat)}</td>
                  <td>{trade.price || "-"}</td>
                  <td className={grossProfit == null ? "muted" : grossProfit >= 0 ? "positive" : "negative"}>{grossProfit == null ? "-" : eur(grossProfit)}</td>
                  <td>{eur(Number(trade.tradingFee || 0) + Number(trade.financingFee || 0))}{Number(trade.financingFee || 0) > 0 && <small className="trade-tax-source">davon {eur(trade.financingFee)} Hebel-Finanzierung · automatisch</small>}</td>
                  <td>{trade.type === "sell" && trade.taxSource === "bitpanda_bookings" ? eur(trade.estimatedTax) : "-"}</td>
                  <td>{trade.type === "sell" ? trade.taxSource === "bitpanda_bookings" ? "Bitpanda · nach Erstattung" : "Nicht verfügbar" : "-"}</td>
                  <td className={profit == null ? "muted" : profit >= 0 ? "positive strong" : "negative strong"}>{profit == null ? "-" : eur(profit)}</td>
                  <td>{trade.month || "-"}</td>
                  <td>{trade.year || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </AdaptiveTable>
      </div>

    </div>
  );
}

function Ranking({ items, mode }) {
  return (
    <div className="ranking-grid">
      <RankingTable title="Größte Gewinne" tone="positive" items={items.winners} mode={mode} />
      <RankingTable title="Größte Verluste" tone="negative" items={items.losers} mode={mode} />
    </div>
  );
}

function RankingTable({ title, tone, items, mode }) {
  return (
    <section className="table-card snapshot-card">
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{profitModes[mode].title}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted ranking-empty">Keine Einträge in dieser Ansicht.</p>
      ) : (
        <AdaptiveTable className="clean-table compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th>{profitModes[mode].column}</th>
              <th>Kategorie</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const profit = getProfitValue(item, mode);

              return (
                <tr key={item.assetKey}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{assetTitle(item)}</strong>
                    <div className="muted small">Symbol: {assetSymbol(item)}</div>
                  </td>
                  <td className={`${tone} strong`}>{eur(profit)}</td>
                  <td>{categoryLabel(item)}</td>
                </tr>
              );
            })}
          </tbody>
        </AdaptiveTable>
      )}
    </section>
  );
}

function Metric({ title, value, tone }) {
  return <div className="metric-card"><span>{title}</span><strong className={tone || ""}>{value}</strong>
      <DataQuality kind={value === "Nicht verfügbar" ? "unknown" : title.startsWith("Bezahlte") ? "reported" : "calculated"} /></div>;
}

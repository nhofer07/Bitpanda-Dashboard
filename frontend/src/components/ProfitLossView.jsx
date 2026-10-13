import PageDescription from "./PageDescription.jsx";
import React, { useEffect, useMemo, useState } from "react";
import { hideAssetKey, readHiddenAssets, showAssetKey, writeHiddenAssets } from "./savedAssetView.js";
import { feeAdjustmentTotal, readProfitFeeAdjustments, writeProfitFeeAdjustments } from "./profitFeeAdjustments.js";

import { getProfitValue, realizedTradingFees } from "./profitResults.js";

const eur = value => `${Number(value || 0).toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})} €`;
const num = value => Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 8 });
const percent = value => `${Number(value || 0).toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}%`;
const dt = time => time?.date_iso8601 ? new Date(time.date_iso8601).toLocaleString("de-DE") : "-";
const categoryLabel = asset => asset.categoryLabel || "Sonstige";
const assetTitle = asset => asset.displayName || asset.name || asset.assetKey || "-";
const assetSymbol = asset => asset.assetKey || asset.name || "-";
const visibleCategory = item => (item.category || "other") !== "other";
const isCashPlusAsset = asset => String(asset?.assetKey || asset?.name || "").toUpperCase() === "BCPEUR";
const profitModes = {
  realized: { title: "Netto realisiert", column: "Netto G/V" },
  unrealized: { title: "Unrealisiert", column: "Unrealisiert" },
  combined: { title: "Gesamt G/V", column: "Gesamt" }
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

export default function ProfitLossView({ onSelectAsset }) {
  const [data, setData] = useState({ assets: [], top: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState("all");
  const [profitMode, setProfitMode] = useState("realized");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("default");
  const [hiddenAssets, setHiddenAssets] = useState(() => readHiddenAssets());
  const [feeAdjustments, setFeeAdjustments] = useState(() => readProfitFeeAdjustments());

  useEffect(() => {
    fetch("/api/dashboard-data")
      .then(response => response.json().then(result => {
        if (!response.ok) throw new Error(result.error || "Fehler beim Laden");
        setData({
          ...(result.profitLoss || {}),
          openPositions: result.openPositions || [],
          portfolio: result.portfolio || {},
          dividends: result.dividends || [],
          paidTax: result.paidTax,
          accountInsights: result.accountInsights
        });
      }))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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

  function addFeeAdjustment({ assetKey, amount, note }) {
    const value = Math.max(0, Number(amount || 0));
    if (!assetKey || !value) return;
    setFeeAdjustments(current => {
      const next = [...current, { id: `${Date.now()}-${Math.random()}`, assetKey, amount: value, note: String(note || ""), createdAt: new Date().toISOString() }];
      writeProfitFeeAdjustments(next);
      return next;
    });
  }

  function removeFeeAdjustment(id) {
    setFeeAdjustments(current => {
      const next = current.filter(entry => entry.id !== id);
      writeProfitFeeAdjustments(next);
      return next;
    });
  }

  const assets = (data.assets || []).filter(asset => !isCashPlusAsset(asset));
  const effectiveFeeAdjustments = feeAdjustments.filter(entry => String(entry.assetKey || "").toUpperCase() !== "BCPEUR");
  const openPositionMap = useMemo(() => new Map((data.openPositions || []).map(position => [String(position.assetKey), position])), [data.openPositions]);
  const hiddenSet = useMemo(() => new Set(hiddenAssets.map(String)), [hiddenAssets]);
  const enrichedAssets = useMemo(() => assets.map(sourceAsset => {
    const asset = calculateAssetNetResults(sourceAsset);
    const openPosition = openPositionMap.get(String(asset.assetKey));

    return {
      ...asset,
      currentQuantity: openPosition?.currentQuantity ?? asset.currentQuantity,
      currentValue: openPosition?.currentValue ?? null,
      currentPrice: openPosition?.currentPrice ?? null,
      unrealizedProfit: Number(openPosition?.unrealizedProfit || 0),
      unrealizedProfitPercent: openPosition?.unrealizedProfitPercent ?? null,
      manualFees: feeAdjustmentTotal(effectiveFeeAdjustments, asset.assetKey),
      netRealizedProfit: Number(asset.realizedProfit || 0) - feeAdjustmentTotal(effectiveFeeAdjustments, asset.assetKey)
    };
  }), [assets, effectiveFeeAdjustments, openPositionMap]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedAssets
      .filter(asset => mode === "all" || !hiddenSet.has(String(asset.assetKey)))
      .filter(asset => categoryFilter === "all" || (asset.category || "other") === categoryFilter)
      .filter(asset => !query || JSON.stringify(asset).toLowerCase().includes(query));
  }, [categoryFilter, enrichedAssets, hiddenSet, mode, search]);

  const sortedAssets = useMemo(() => {
    if (sortOrder === "default") return visible;
    return [...visible].sort((a, b) => {
      const aProfit = getProfitValue(a, profitMode);
      const bProfit = getProfitValue(b, profitMode);
      return sortOrder === "highest" ? bProfit - aProfit : aProfit - bProfit;
    });
  }, [profitMode, sortOrder, visible]);

  const hiddenCount = assets.filter(asset => hiddenSet.has(String(asset.assetKey))).length;
  const unallocatedManualFees = effectiveFeeAdjustments
    .filter(entry => !enrichedAssets.some(asset => String(asset.assetKey) === String(entry.assetKey)))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.amount || 0)), 0);
  const isCompleteView = visible.length === enrichedAssets.length;
  const generalTaxAdjustment = isCompleteView ? Number(data.unallocatedTaxAdjustment || 0) : 0;
  const totalProfit = visible.reduce((sum, asset) => sum + getProfitValue(asset, profitMode), 0) - (profitMode === "unrealized" ? 0 : (isCompleteView ? unallocatedManualFees : 0) + generalTaxAdjustment);
  const totalGrossProfit = visible.reduce((sum, asset) => sum + Number(asset.grossRealizedProfit || 0), 0);
  const totalTradingFees = visible.reduce((sum, asset) => sum + Number(asset.tradingFees || 0), 0);
  const totalManualFees = visible.reduce((sum, asset) => sum + asset.manualFees, 0) + (isCompleteView ? unallocatedManualFees : 0);
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

  if (loading) return <h2>Lade Gewinne und Verluste...</h2>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      <section className="hero-card profit-hero">
        <div>
          <div className="eyebrow">Portfolio-Ansicht</div>
          <h1>Realisierte Gewinne / Verluste</h1>
          <PageDescription summary="Realisierte Ergebnisse nach Gebühren und Steuern, aufgeteilt nach Asset und Anlageklasse.">
            Brutto G/V basiert auf den Fiat-Beträgen vor Kauf- und Verkaufsgebühren. Netto G/V berücksichtigt die ausgewiesenen Handelsgebühren und gebuchte KESt nach zugeordneten Erstattungen. Die gesamte bezahlte KESt enthält zusätzlich allgemeine Steuererstattungen und bezahlte Nachforderungen.
          </PageDescription>
        </div>
        <div className="hero-status">
          <span>{mode === "all" ? "Alle Assets" : "Gespeicherte Ansicht"}</span>
          <strong>{visible.length}</strong>
        </div>
      </section>

      <div className="info-box">
        <strong>Datenbasis:</strong> Gebühren und bezahlte KESt stammen aus den Bitpanda-Buchungen. Kostenbasis und Gewinne werden daraus berechnet. Bezahlte KESt und Quellensteuer gelten für alle geladenen Jahre und Assets; die übrigen Kennzahlen folgen deiner Auswahl. Allgemeine Steuerkorrekturen sind im Gesamtergebnis aller Assets enthalten und werden keinem einzelnen Asset zugeteilt.
      </div>

      <div className="stats-grid profit-stats-grid">
        <Metric title={profitModes[profitMode].title} value={eur(totalProfit)} tone={totalProfit >= 0 ? "positive" : "negative"} />
        <Metric title="Brutto realisiert" value={eur(totalGrossProfit)} tone={totalGrossProfit >= 0 ? "positive" : "negative"} />
        <Metric title="Trading-Gebühren" value={eur(totalTradingFees)} />
        <Metric title="Eigene Finanzierungsgebühren" value={eur(totalManualFees)} />
        <Metric title="Bezahlte KESt aus Verkäufen · gesamt" value={data.paidTax?.available ? eur(data.paidTax.salesPaid) : "Nicht verfügbar"} />
        <Metric title="Bezahlte Quellensteuer · gesamt" value={paidDividendTax == null ? "Nicht verfügbar" : eur(paidDividendTax)} />
        <Metric title="Assets in Ansicht" value={visible.length} />
        <Metric title="Ausgeblendete Assets" value={hiddenCount} />
      </div>

      {!data.paidTax?.available && <div className="info-box">{data.paidTax?.error || "Steuerbuchungen sind noch nicht verfügbar. Bitte Dashboard aktualisieren."} Gewinne enthalten solange keinen KESt-Abzug.</div>}

      {(data.warnings || []).length > 0 && <div className="warning-box">Kostenbasis teilweise unvollständig: {(data.warnings || []).map(w => w.asset).join(", ")}. Rewards, Transfers oder fehlende Käufe können die berechneten Gewinne beeinflussen. Gebuchte Gebühren und Steuern bleiben davon unabhängig.</div>}

      <CategoryOverview summary={categorySummary} mode={profitMode} />



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

        <button className="secondary-button" onClick={resetSavedView} disabled={hiddenCount === 0}>
          Ansicht zurücksetzen
        </button>
      </div>

      <Ranking items={ranking} mode={profitMode} />

      <details className="page-disclosure">
        <summary>Eigene Finanzierungsgebühren verwalten</summary>
      <FeeAdjustmentPanel
        assets={[...enrichedAssets, ...(data.openPositions || []).filter(position => position.positionType === "leverage" && !isCashPlusAsset(position))]}
        entries={effectiveFeeAdjustments}
        onAdd={addFeeAdjustment}
        onRemove={removeFeeAdjustment}
      />
      </details>

      <div className="toolbar profit-assets-toolbar">
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
            <option value="highest">Höchster Preis zuerst</option>
            <option value="lowest">Niedrigster Preis zuerst</option>
          </select>
        </label>
      </div>

      {mode === "saved" && hiddenCount > 0 && (
        <div className="info-box">
          In deiner gespeicherten Ansicht sind {hiddenCount} Assets ausgeblendet. Mit „Alle Assets“ kannst du sie trotzdem sehen und einzeln wieder hinzufügen.
        </div>
      )}

      <div className="table-card">
        <table className="clean-table">
          <thead>
            <tr>{["Asset", profitModes[profitMode].column, "Brutto G/V", "Gebühren", "KESt", "Gekauft", "Verkauft", "Restmenge", "Käufe", "Verkäufe", "Gespeicherte Ansicht", "Details"].map(header => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {sortedAssets.map(asset => {
              const profit = getProfitValue(asset, profitMode);
              const isOpen = open === asset.assetKey;
              const isHidden = hiddenSet.has(String(asset.assetKey));

              return (
                <React.Fragment key={asset.assetKey}>
                  <tr className={isHidden ? "muted-row" : ""}>
                    <td>
                      <strong>{assetTitle(asset)}</strong>
                      <div><span className="pill category-pill">{categoryLabel(asset)}</span></div>
                      <div className="muted small">Symbol: {assetSymbol(asset)}</div>
                    </td>
                    <td className={profit >= 0 ? "positive strong" : "negative strong"}>{eur(profit)}</td>
                    <td className={Number(asset.grossRealizedProfit || 0) >= 0 ? "positive" : "negative"}>{eur(asset.grossRealizedProfit)}</td>
                    <td>{eur(Number(asset.tradingFees || 0) + Number(asset.manualFees || 0))}</td>
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
                        <button className="danger-button small-button" onClick={() => removeFromSavedView(asset.assetKey)}>
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
        </table>
      </div>

      {visible.length === 0 && (
        <div className="empty-state">
          <h2>Keine Assets in dieser Ansicht</h2>
          <p>Setze die gespeicherte Ansicht zurück oder wechsle auf „Alle Assets“.</p>
        </div>
      )}
    </div>
  );
}

function FeeAdjustmentPanel({ assets, entries, onAdd, onRemove }) {
  const [assetKey, setAssetKey] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const feeAssets = useMemo(() => {
    const unique = new Map();
    for (const asset of assets) {
      const key = String(asset.assetKey || asset.underlyingSymbol || asset.name || "");
      if (key && !unique.has(key)) unique.set(key, { key, label: `${assetTitle(asset)} (${key})` });
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [assets]);
  const matchingFeeAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return feeAssets.filter(asset => !query || `${asset.label} ${asset.key}`.toLowerCase().includes(query)).slice(0, 12);
  }, [assetSearch, feeAssets]);

  function selectFeeAsset(asset) {
    setAssetKey(asset.key);
    setAssetSearch(asset.label);
    setAssetSearchOpen(false);
  }

  function submit(event) {
    event.preventDefault();
    if (!assetKey) return;
    onAdd({ assetKey, amount, note });
    setAmount("");
    setNote("");
  }

  return (
    <section className="table-card fee-adjustment-card">
      <div className="section-heading">
        <div>
          <h3>Eigene Gebühren hinzufügen</h3>
          <span>z. B. Finanzierungsgebühren für Long-Positionen mit Hebel</span>
        </div>
        <span>{entries.length} Einträge</span>
      </div>
      <form className="fee-adjustment-form" onSubmit={submit}>
        <div className="fee-asset-search">
          <input className="table-input" type="search" value={assetSearch} placeholder="Position oder Asset suchen …" aria-label="Position oder Asset für Gebühr suchen" aria-expanded={assetSearchOpen} aria-controls="fee-asset-results" autoComplete="off" onFocus={() => setAssetSearchOpen(true)} onBlur={() => setAssetSearchOpen(false)} onChange={event => { setAssetSearch(event.target.value); setAssetKey(""); setAssetSearchOpen(true); }} onKeyDown={event => { if (event.key === "Enter" && matchingFeeAssets[0] && !assetKey) { event.preventDefault(); selectFeeAsset(matchingFeeAssets[0]); } else if (event.key === "Escape") { setAssetSearchOpen(false); event.currentTarget.blur(); } }} required />
          {assetSearchOpen && <div className="fee-asset-results" id="fee-asset-results" role="listbox">{matchingFeeAssets.length ? matchingFeeAssets.map(asset => <button type="button" role="option" aria-selected={asset.key === assetKey} key={asset.key} onMouseDown={event => event.preventDefault()} onClick={() => selectFeeAsset(asset)}><strong>{asset.label}</strong></button>) : <p>Kein passendes Asset gefunden.</p>}</div>}
        </div>
        <input className="table-input" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Gebühr in €" required />
        <input className="table-input" value={note} onChange={event => setNote(event.target.value)} placeholder="Notiz, z. B. Funding 01.–07.09." />
        <button className="primary-button" type="submit" disabled={!assetKey}>Gebühr hinzufügen</button>
      </form>
      {entries.length > 0 && (
        <div className="details-table-wrap">
          <table className="clean-table compact">
            <thead><tr><th>Asset</th><th>Notiz</th><th>Gebühr</th><th /></tr></thead>
            <tbody>{entries.map(entry => (
              <tr key={entry.id}>
                <td>{feeAssets.find(asset => asset.key === String(entry.assetKey))?.label || entry.assetKey}</td>
                <td>{entry.note || "-"}</td>
                <td className="strong">{eur(entry.amount)}</td>
                <td><button className="danger-button small-button" onClick={() => onRemove(entry.id)}>Entfernen</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
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
    item.tradingFees += realizedTradingFees(asset) + Number(asset.manualFees || 0);
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
        Symbol: {assetSymbol(asset)} · Restliche Kostenbasis: {eur(asset.costBasis)} (ohne bereits separat ausgewiesene Kaufgebühren) · Trading-Gebühren: {eur(asset.tradingFees)} · Eigene Finanzierungsgebühren: {eur(asset.manualFees)} · Gebuchte KESt: {eur(asset.estimatedTax)}
      </p>
      <div className="details-table-wrap">
        <table className="clean-table compact">
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
                  <td>{eur(trade.tradingFee)}</td>
                  <td>{trade.type === "sell" && trade.taxSource === "bitpanda_bookings" ? eur(trade.estimatedTax) : "-"}</td>
                  <td>{trade.type === "sell" ? trade.taxSource === "bitpanda_bookings" ? "Bitpanda · nach Erstattung" : "Nicht verfügbar" : "-"}</td>
                  <td className={profit == null ? "muted" : profit >= 0 ? "positive strong" : "negative strong"}>{profit == null ? "-" : eur(profit)}</td>
                  <td>{trade.month || "-"}</td>
                  <td>{trade.year || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <table className="clean-table compact">
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
        </table>
      )}
    </section>
  );
}

function Metric({ title, value, tone }) {
  return <div className="metric-card"><span>{title}</span><strong className={tone || ""}>{value}</strong></div>;
}

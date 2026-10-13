import { useEffect, useMemo, useState } from "react";

import { performAction } from "./actionFeedback.js";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 8 });
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function assetTitle(asset) {
  return asset?.displayName || asset?.name || asset?.assetKey || "-";
}

function assetSymbol(asset) {
  return asset?.assetKey || asset?.name || "-";
}

export default function AdjustmentsView() {
  const [dashboard, setDashboard] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [dashboardResponse, manualResponse] = await Promise.all([
        fetch("/api/dashboard-data"),
        fetch("/api/manual-positions")
      ]);
      const dashboardJson = await dashboardResponse.json();
      const manualJson = await manualResponse.json();
      if (!dashboardResponse.ok) throw new Error(dashboardJson.error || "Dashboard konnte nicht geladen werden");
      if (!manualResponse.ok) throw new Error(manualJson.error || "Positionen konnten nicht geladen werden");
      setDashboard(dashboardJson);
      setDrafts(manualJson.positions || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveManualPositions() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await performAction({ pending: "Positionskorrekturen werden gespeichert …", success: "Positionskorrekturen gespeichert und im Dashboard übernommen.",
        failure: "Positionskorrekturen konnten nicht gespeichert werden",
        execute: async () => {
          const response = await fetch("/api/manual-positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions: drafts }) });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
          setDrafts(json.manualPositions?.positions || {}); setDashboard(json.dashboard || dashboard);
          return json;
        }
      });
    } finally { setSaving(false); }
  }

  function defaultDraft(asset, current = {}) {
    const quantity = asset.currentQuantity ?? asset.quantity ?? 0;
    const averageEntry = asset.averageRemainingCost ?? (quantity > 0 ? Number(asset.costBasis || 0) / quantity : 0);
    return { quantity, averageEntry, note: "", mode: "override", enabled: false, ...current };
  }

  function updateDraft(asset, patch) {
    const symbol = assetSymbol(asset);
    setDrafts(current => ({
      ...current,
      [symbol]: { ...defaultDraft(asset, current[symbol]), ...patch }
    }));
  }

  const rows = useMemo(() => {
    const positions = new Map();
    for (const asset of dashboard?.profitLoss?.assets || []) positions.set(assetSymbol(asset), asset);
    for (const asset of dashboard?.openPositions || []) positions.set(assetSymbol(asset), asset);
    for (const reserved of dashboard?.reservedPositions || []) {
      const symbol = assetSymbol(reserved);
      if (!positions.has(symbol)) positions.set(symbol, { ...reserved, currentQuantity: reserved.quantity, positionSource: "Fusion Limit Order" });
    }
    return [...positions.values()]
      .filter(asset => `${assetTitle(asset)} ${assetSymbol(asset)}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => assetTitle(a).localeCompare(assetTitle(b)));
  }, [dashboard, search]);

  const activeCount = Object.values(drafts).filter(draft => draft.enabled === true).length;

  if (loading) return <div className="loading-state">Lade Positionen...</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      <section className="hero-card">
        <div>
          <div className="eyebrow">Manuelle Positionsverwaltung</div>
          <h2>Sonderfälle</h2>
          <p>Überschreibe Menge und durchschnittlichen Einstieg einzelner Assets, wenn die Bitpanda-Historie oder Wallet-Anzeige nicht passt.</p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={saveManualPositions} disabled={saving}>
            {saving ? "Speichere..." : "Änderungen speichern"}
          </button>
          <span>{activeCount} manuelle Überschreibungen</span>
        </div>
      </section>

      <div className="info-box">
        Aktiviere pro Asset „Manuell verwenden“ und speichere. Dann ersetzen Menge und Ø Einstieg die aus der Historie berechneten Werte. Mit Menge 0 kannst du eine Position ausblenden. Ohne Aktivierung bleibt alles unverändert.
      </div>

      <section className="table-card">
        <div className="section-heading adjustments-heading">
          <div><h3>Alle Assets</h3><span>{rows.length} Einträge</span></div>
          <input className="search-input compact-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Asset suchen..." />
        </div>
        <div className="details-table-wrap">
          <table className="clean-table adjustments-table">
            <thead>
              <tr><th>Asset</th><th>Aktuell berechnet</th><th>Manuelle Menge</th><th>Ø Einstieg</th><th>Notiz</th><th>Manuell verwenden</th></tr>
            </thead>
            <tbody>
              {rows.map(asset => {
                const symbol = assetSymbol(asset);
                const draft = defaultDraft(asset, drafts[symbol]);
                const active = draft.enabled === true;
                return (
                  <tr key={symbol}>
                    <td><strong>{assetTitle(asset)}</strong><div className="muted small">{symbol}{asset.positionSource ? ` · ${asset.positionSource}` : ""}</div></td>
                    <td><div>{formatNumber(asset.currentQuantity ?? asset.quantity)}</div><div className="muted small">Ø {formatCurrency(asset.averageRemainingCost)}</div></td>
                    <td><input className="table-input" type="number" step="any" min="0" value={draft.quantity} onChange={event => updateDraft(asset, { quantity: event.target.value, mode: "override" })} /></td>
                    <td><input className="table-input" type="number" step="any" min="0" value={draft.averageEntry} onChange={event => updateDraft(asset, { averageEntry: event.target.value, mode: "override" })} /></td>
                    <td><input className="table-input" value={draft.note} onChange={event => updateDraft(asset, { note: event.target.value })} placeholder="Optional" /></td>
                    <td><label className="toggle-row"><input type="checkbox" checked={active} onChange={event => updateDraft(asset, { enabled: event.target.checked, mode: "override" })} /><span className={active ? "positive strong" : "muted"}>{active ? "Aktiv" : "Inaktiv"}</span></label></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

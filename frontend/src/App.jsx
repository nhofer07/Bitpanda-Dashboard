import { subscribeDashboardUpdates } from "./components/dashboardEvents.js";
import PageIntro from "./components/PageIntro.jsx";
import { viewTitle, navigationGroup, VIEW_IDS } from "./components/navigationItems.js";
import DataFreshness from "./components/DataFreshness.jsx";
import { createLatestRequest } from "./components/dashboardRefresh.js";
import { createCashflowSync } from "./components/cashflowSync.js";
import LoadingState from "./components/LoadingState.jsx";
import PageDescription from "./components/PageDescription.jsx";
import ActionFeedback from "./components/ActionFeedback.jsx";
import { notify } from "./components/actionFeedback.js";
import { useCallback, useEffect, useRef, useState } from "react";
import SettingsView from "./components/SettingsView.jsx";
import AssetsView from "./components/AssetsView.jsx";
import Navigation from "./components/Navigation.jsx";
import PeriodOverview from "./components/PeriodOverview.jsx";
import ProfitLossView from "./components/ProfitLossView.jsx";
import PortfolioHome from "./components/PortfolioHome.jsx";
import PerformanceCalendar from "./components/PerformanceCalendar.jsx";
import TargetCalculator from "./components/TargetCalculator.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import SplitColumns from "./components/SplitColumns.jsx";
import TransactionsTable from "./components/TransactionsTable.jsx";
import AccountDataView from "./components/AccountDataView.jsx";
import FeesView from "./components/FeesView.jsx";
import TaxCockpitView from "./components/TaxCockpitView.jsx";
import MarketAnalysisView from "./components/MarketAnalysisView.jsx";
import FusionView from "./components/FusionView.jsx";
import InfoModal from "./components/InfoModal.jsx";
import { readCashflowOverrides } from "./components/cashflowOverrides.js";
import { readBrowserCredentials } from "./components/browserCredentials.js";

const APP_VIEW_STORAGE_KEY = "bitpanda-dashboard-active-view";
const APP_ASSET_STORAGE_KEY = "bitpanda-dashboard-selected-asset";
const RESTORABLE_VIEWS = new Set([...VIEW_IDS, "asset"]);

function readStoredView() {
  try {
    const hash = window.location.hash.slice(1);
    const stored = RESTORABLE_VIEWS.has(hash) ? hash : localStorage.getItem(APP_VIEW_STORAGE_KEY);
    return stored === "asset" ? "assets" : RESTORABLE_VIEWS.has(stored) ? stored : "home";
  } catch {
    return "home";
  }
}

function readStoredAssetKey() {
  try {
    return localStorage.getItem(APP_ASSET_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export default function App() {
  const [activeView, setActiveView] = useState(readStoredView);
  const [transactions, setTransactions] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState(readStoredAssetKey);
  const [selectedAssetData, setSelectedAssetData] = useState(null);
  const [assetNavigation, setAssetNavigation] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("split");
  const [cashflowOverrides, setCashflowOverrides] = useState(readCashflowOverrides);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const latestRequest = useRef(createLatestRequest());
  const hasDashboard = useRef(false);
  const configured = useRef(false);
  const transactionVersion = useRef(0);
  const cashflowSync = useRef(null);
  if (!cashflowSync.current) cashflowSync.current = createCashflowSync({
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    onChange: setCashflowOverrides,
    request: async (method, body) => {
      const response = await fetch("/api/cashflow-overrides", { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || "Cashflow-Zuordnungen konnten nicht synchronisiert werden."), { status: response.status, state: result.state });
      return result;
    }
  });

  useEffect(() => {
    async function initialize() {
      try {
        let response = await fetch("/api/settings");
        let status = await response.json();
        if (!response.ok) throw new Error(status.error || "Einstellungen konnten nicht geladen werden.");

        if (status.credentialsStorage === "memory" && (!status.bitpandaConfigured || !status.finnhubConfigured || !status.fusionConfigured)) {
          const stored = readBrowserCredentials();
          const credentials = {};
          if (!status.bitpandaConfigured && stored.bitpanda) credentials.bitpanda = stored.bitpanda;
          if (!status.finnhubConfigured && stored.finnhub) credentials.finnhub = stored.finnhub;
          if (!status.fusionConfigured && stored.fusion) credentials.fusion = stored.fusion;
          if (Object.keys(credentials).length) {
            response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
            status = await response.json();
            if (!response.ok) throw new Error(status.error || "Gespeicherte Browser-Keys konnten nicht aktiviert werden.");
          }
        }

        if (!status.bitpandaConfigured) {
          setActiveView("settings"); setLoading(false); setDashboardLoading(false);
        } else {
          configured.current = true;
          loadSavedCashflowOverrides();
          loadTransactions(); loadDashboardData();
        }
      } catch (err) {
        setRefreshError(err.message);
        setActiveView("settings"); setLoading(false); setDashboardLoading(false);
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    let refreshTimeout;
    const scheduleMinuteRefresh = () => {
      const delay = 60_000 - Date.now() % 60_000;
      refreshTimeout = window.setTimeout(() => {
        scheduleMinuteRefresh();
        if (configured.current) loadDashboardData({ silent: true, force: true });
      }, delay);
    };
    scheduleMinuteRefresh();
    const stopUpdates = subscribeDashboardUpdates(() => {
      if (configured.current) loadDashboardData({ silent: true });
    }, {
      onRefreshing: () => { if (configured.current) setRefreshing(true); },
      onFailed: () => { if (configured.current) { setRefreshing(false); setRefreshError("Automatische Aktualisierung fehlgeschlagen."); } }
    });

    const loadLatestWhenVisible = () => {
      if (configured.current && document.visibilityState === "visible") {
        loadDashboardData({ silent: true, force: true });
        loadSavedCashflowOverrides();
      }
    };
    document.addEventListener("visibilitychange", loadLatestWhenVisible);
    window.addEventListener("focus", loadLatestWhenVisible);
    window.addEventListener("pageshow", loadLatestWhenVisible);

    return () => {
      window.clearTimeout(refreshTimeout);
      stopUpdates();
      document.removeEventListener("visibilitychange", loadLatestWhenVisible);
      window.removeEventListener("focus", loadLatestWhenVisible);
      window.removeEventListener("pageshow", loadLatestWhenVisible);
    };
  }, []);

  useEffect(() => {
    const onBack = () => { const id = window.location.hash.slice(1); setAssetNavigation(null); setActiveView(RESTORABLE_VIEWS.has(id) ? (id === "asset" ? "assets" : id) : "home"); };
    window.addEventListener("popstate", onBack);
    window.addEventListener("hashchange", onBack);
    return () => { window.removeEventListener("popstate", onBack); window.removeEventListener("hashchange", onBack); };
  }, []);

  useEffect(() => {
    if (window.location.hash !== `#${activeView}`) window.history.replaceState({}, "", `#${activeView}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      localStorage.setItem(APP_VIEW_STORAGE_KEY, activeView);
    } catch {
      // Local storage is a convenience feature; the app should keep working without it.
    }
  }, [activeView]);

  useEffect(() => {
    try {
      if (selectedAssetKey) {
        localStorage.setItem(APP_ASSET_STORAGE_KEY, selectedAssetKey);
      } else {
        localStorage.removeItem(APP_ASSET_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [selectedAssetKey]);

  async function loadTransactions() {
    const version = ++transactionVersion.current;
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/transactions");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Laden");
      }

      if (version === transactionVersion.current) setTransactions(data);
    } catch (err) {
      if (version === transactionVersion.current) setError(err.message);
    } finally {
      if (version === transactionVersion.current) setLoading(false);
    }
  }

  async function loadDashboardData({ refresh = false, silent = false, force = false, feedback = true } = {}) {
    const token = latestRequest.current.begin();
    try {
      setRefreshing(true);
      if (!refresh && !silent) setDashboardLoading(true);

      const response = await fetch(`/api/dashboard-data${refresh || force ? "?refresh=1" : ""}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Laden");
      }

      if (!latestRequest.current.accept(token, data)) return false;
      hasDashboard.current = true;
      setDashboardError("");
      setRefreshError("");
      setDashboardData(data);
      if (refresh && feedback) notify(data.paidTax?.available ? "Dashboard aktualisiert. Bestände, Gebühren und Steuerbuchungen sind geladen." : "Dashboard aktualisiert. Steuerbuchungen sind noch nicht verfügbar.", data.paidTax?.available ? "success" : "warning");
      if (Array.isArray(data.transactions)) {
        transactionVersion.current++;
        setLoading(false);
        setError("");
        setTransactions(data.transactions);
      }
      return true;
    } catch (err) {
      if (!latestRequest.current.current(token)) return false;
      setRefreshError(err.message);
      if (!hasDashboard.current) setDashboardError(err.message);
      if (refresh && feedback) notify(`Aktualisieren fehlgeschlagen: ${err.message}`, "error");
      return false;
    } finally {
      if (latestRequest.current.current(token)) {
        setDashboardLoading(false);
        setRefreshing(false);
      }
    }
  }

  function openAsset(assetOrKey, options = {}) {
    const item = typeof assetOrKey === "object" ? assetOrKey : null;
    setSelectedAssetData(item);
    setSelectedAssetKey(item ? item.assetKey || item.symbol : assetOrKey);
    navigate("assets");
    setAssetNavigation({ target: options.target || "details" });
  }

  function navigate(viewId) {
    setAssetNavigation(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    const next = viewId === "open" ? "home" : viewId === "asset" ? "assets" : viewId;
    if (next !== activeView) window.history.pushState({}, "", `#${next}`);
    setActiveView(next);
  }

  async function updateCashflowOverride(transactionId, classification) {
    const feedbackId = notify("Cashflow-Zuordnung wird gespeichert …", "pending", "cashflow-save");
    try {
      await cashflowSync.current.update(transactionId, classification);
      notify("Cashflow-Zuordnung gespeichert.", "success", feedbackId);
    } catch (err) {
      notify(err.status === 409 ? err.message : err.localSaved ? "Nur in diesem Browser gespeichert. Die Synchronisierung wird beim nächsten Öffnen erneut versucht." : "Speichern fehlgeschlagen. Bitte erneut versuchen.", "warning", feedbackId);
    }
  }

  async function loadSavedCashflowOverrides() {
    try { await cashflowSync.current.load(); }
    catch (err) { notify(err.message || "Cashflow-Zuordnungen konnten nicht synchronisiert werden.", "warning", "cashflow-sync"); }
  }

  const visibleTransactions = transactions.filter((transaction) => {
    const text = JSON.stringify(transaction).toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <div className="app-shell dashboard-shell">
      <header className="app-header">
        <div>
          <span className="app-brand"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 17 6-7 4 4 6-9M14 5h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Bitpanda <b>Dashboard</b></span></span>
          <h1 className="mobile-page-title">{viewTitle(activeView)}</h1>
        </div>
        <div className="header-controls">
          <button
            className={`settings-toggle ${activeView === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
            aria-label="Einstellungen öffnen"
            aria-current={activeView === "settings" ? "page" : undefined}
            title="Einstellungen öffnen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
              <path d="m19.4 15 .05.04 1.12.87-1.1 1.9-1.32-.54a7.9 7.9 0 0 1-1.43.83l-.2 1.4h-2.2l-.2-1.4a7.9 7.9 0 0 1-1.44-.83l-1.31.54-1.1-1.9 1.12-.87a7.7 7.7 0 0 1 0-1.66l-1.12-.87 1.1-1.9 1.31.54a7.9 7.9 0 0 1 1.44-.83l.2-1.4h2.2l.2 1.4a7.9 7.9 0 0 1 1.43.83l1.32-.54 1.1 1.9-1.12.87a7.7 7.7 0 0 1 0 1.62Z" transform="translate(-1.4 -1.9)" />
            </svg>
            <span>Einstellungen</span>
          </button>
          <button
            className="info-toggle"
            onClick={() => setInfoOpen(true)}
            aria-label="Erklärung zur aktuellen Seite öffnen"
            title="Erklärung zur aktuellen Seite öffnen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7h.01" /></svg>
          </button>
        </div>
      </header>

      <Navigation activeView={activeView} setActiveView={navigate} />

      <main className="app-content" id="main-content">
      <div className="page-heading"><div className="desktop-page-title"><span className="eyebrow">{activeView === "home" ? "Dein Überblick" : navigationGroup(activeView)?.label || "Verbindungen & Zugang"}</span><h1>{viewTitle(activeView)}</h1></div>
      <DataFreshness loadedAt={dashboardData?.loadedAt} error={refreshError} preview={dashboardData?.cache?.status === "local-preview"} refreshing={refreshing} onRefresh={() => loadDashboardData({ refresh: true })} />
      </div>
      {dashboardData?.cache?.status === "local-preview" && <div className="warning-box" role="status">{dashboardData.cache.warning} Datenstand: {new Date(dashboardData.loadedAt).toLocaleString("de-AT")}. <button className="secondary-button" onClick={() => navigate("settings")}>API-Key prüfen</button></div>}
      {activeView === "settings" && <SettingsView onSaved={() => window.location.reload()} />}
      {activeView === "home" && (
        <PortfolioHome
          data={dashboardData}
          loading={dashboardLoading}
          error={dashboardError}
          refreshing={refreshing}
          onRefresh={() => loadDashboardData({ refresh: true })}
          onSelectAsset={openAsset}
          cashflowOverrides={cashflowOverrides}
        />
      )}

      {activeView === "assets" && <AssetsView data={dashboardData} loading={dashboardLoading} error={dashboardError} selectedAssetKey={selectedAssetKey} selectedAssetData={selectedAssetData} assetNavigation={assetNavigation} onSelectAsset={openAsset} onTradeCompleted={async () => { if (!await loadDashboardData({ refresh: true, feedback: false })) throw new Error("Bestände konnten nicht aktualisiert werden."); }} />}

      {activeView === "overview" && <PeriodOverview cashflowOverrides={cashflowOverrides} />}
      {activeView === "calendar" && <PerformanceCalendar data={dashboardData} loading={dashboardLoading} error={dashboardError} cashflowOverrides={cashflowOverrides} />}

      {activeView === "profits" && <ProfitLossView onSelectAsset={openAsset} dashboardData={dashboardData} />}

      {activeView === "calculator" && (
        <TargetCalculator
          data={dashboardData}
          loading={dashboardLoading}
          error={dashboardError}
        />
      )}

      {activeView === "tax" && <TaxCockpitView onSelectAsset={openAsset} dashboardData={dashboardData} />}
      {activeView === "account" && <AccountDataView data={dashboardData} loading={dashboardLoading} error={dashboardError} onSelectAsset={openAsset} />}
      {activeView === "fees" && <FeesView data={dashboardData} loading={dashboardLoading} error={dashboardError} onSelectAsset={openAsset} />}

      {activeView === "market" && <MarketAnalysisView dashboardData={dashboardData} loading={dashboardLoading} />}
      {activeView === "fusion" && <FusionView />}

      {activeView === "fiat" && (
        <>
          <PageIntro>
            <div>

              <PageDescription summary="Einzahlungen, Ausgaben und Transfers im Überblick. Passe die Zuordnung einzelner Buchungen bei Bedarf an.">
                Markiere jede Abbuchung als Ausgabe oder Transfer auf ein anderes Konto. Kartenzahlungen werden standardmäßig als Ausgabe erkannt; deine Auswahl wird dauerhaft gespeichert. Zahlungsweg und Sparplan-Markierung stammen aus den Buchungsdaten.
              </PageDescription>
            </div>
            <div className="hero-status">
              <span>Transaktionen</span>
              <strong>{visibleTransactions.length}</strong>
            </div>
          </PageIntro>

          {loading && <LoadingState>Lade Fiat-Wallet-Transaktionen …</LoadingState>}

          {error && <div className="error-box">{error}</div>}

          {!loading && !error && (
            <>
              <SummaryCards transactions={visibleTransactions} overrides={cashflowOverrides} />

              <div className="view-panel">
                <input
                  className="search-input"
                  aria-label="Cashflow durchsuchen"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Suche nach Status, Datum, Richtung..."
                />

                <div className="segmented-control" aria-label="Fiat Ansicht umschalten">
                  <button className={view === "split" ? "active" : ""} onClick={() => setView("split")}>
                    Spalten
                  </button>
                  <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
                    Tabelle
                  </button>
                </div>
              </div>

              {view === "split" ? (
                <SplitColumns transactions={visibleTransactions} overrides={cashflowOverrides} />
              ) : (
                <TransactionsTable
                  transactions={visibleTransactions}
                  overrides={cashflowOverrides}
                  onChangeClassification={updateCashflowOverride}
                />
              )}
            </>
          )}
        </>
      )}
      </main>
      {infoOpen && <InfoModal view={activeView} onClose={closeInfo} />}
      <ActionFeedback />
    </div>
  );
}

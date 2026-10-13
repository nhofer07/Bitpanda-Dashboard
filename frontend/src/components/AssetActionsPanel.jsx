import { useEffect, useMemo, useRef, useState } from "react";

import { performAction, tradeFeedback } from "./actionFeedback.js";

const number = value => Number(value || 0).toLocaleString("de-AT", { maximumFractionDigits: 8 });
const money = value => `${Number(value || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
let accountCache = null;
let accountPromise = null;

async function request(path, options) {
  const response = await fetch(`/api${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Bitpanda-Anfrage fehlgeschlagen.");
  return data;
}

async function loadAccount(refresh = false) {
  if (accountCache && !refresh) return accountCache;
  if (!accountPromise) accountPromise = request("/public-account").then(data => { accountCache = data; return data; }).finally(() => { accountPromise = null; });
  return accountPromise;
}

export default function AssetActionsPanel({ asset, held, currentPrice, onTradeCompleted }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [trade, setTrade] = useState({ side: "BUY", mode: "quantity", amount: "" });
  const [quote, setQuote] = useState(null);
  const [earn, setEarn] = useState({ configId: "", walletId: "", amount: "", confirmation: "" });

  useEffect(() => {
    let active = true;
    setAccount(null); setError(""); setQuote(null); setNotice("");
    loadAccount().then(data => { if (active) setAccount(data); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [asset.id, asset.symbol, asset.isin]);

  const resources = account?.resources || {};
  const assets = resources.assets?.ok ? resources.assets.data || [] : [];
  const currencies = resources.currencies?.ok ? resources.currencies.data || [] : [];
  const publicAsset = assets.find(item => item.id === asset.id) || assets.find(item => asset.isin && item.isin === asset.isin) || assets.find(item => String(item.symbol).toUpperCase() === String(asset.symbol).toUpperCase());
  const portfolioItem = (resources.portfolio?.ok ? resources.portfolio.data || [] : []).find(item => item.asset_id === publicAsset?.id);
  const euro = currencies.find(item => String(item.symbol).toUpperCase() === "EUR");
  const euroPortfolio = (resources.portfolio?.ok ? resources.portfolio.data || [] : []).find(item => item.currency_id === euro?.id && !item.asset_id);
  const availableEur = Number(euroPortfolio?.available_balance?.value ?? euroPortfolio?.available_balance ?? euroPortfolio?.balance?.value ?? euroPortfolio?.balance ?? 0);
  const ownedAmount = Number(portfolioItem?.balance?.value ?? portfolioItem?.balance ?? held?.currentQuantity ?? held?.walletBalance ?? 0);
  const earnConfigs = (resources.earnConfigs?.ok ? resources.earnConfigs.data || [] : []).filter(config => config.asset_id === publicAsset?.id && config.enabled && !config.soldout);
  const wallets = useMemo(() => {
    const operations = resources.operations?.ok ? resources.operations.data || [] : [];
    return [...new Map(operations.flatMap(op => op.transactions || []).filter(tx => tx.asset_id === publicAsset?.id && tx.wallet_id).map(tx => [tx.wallet_id, tx])).values()];
  }, [resources.operations, publicAsset?.id]);
  const canEarn = asset.category === "crypto" && ownedAmount > 0 && earnConfigs.length > 0;
  const selectedSideAvailable = trade.side === "BUY" ? publicAsset?.buy_active : publicAsset?.sell_active && ownedAmount > 0;
  const numericAmount = Number(String(trade.amount).replace(",", "."));
  const numericPrice = Number(currentPrice || 0);
  const estimatedEuroValue = trade.mode === "quantity" && numericAmount > 0 && numericPrice > 0 ? numericAmount * numericPrice : null;
  const estimatedQuantity = trade.mode === "notional" && numericAmount > 0 && numericPrice > 0 ? numericAmount / numericPrice : null;
  const quoteFee = Number(quote?.quote?.fee || quote?.ex_ante?.costs_and_charges?.total_costs?.amount || 0);
  const quoteQuantity = Number(quote?.quote?.quantity || 0);
  const quotePrice = Number(quote?.quote?.price || quote?.quote?.price_without_fee || 0);
  const quoteTotal = Number(quote?.quote?.notional || quote?.quote?.total || 0);
  const quoteAssetValue = quoteQuantity && quotePrice ? quoteQuantity * quotePrice : Math.max(0, quoteTotal - (trade.side === "BUY" ? quoteFee : 0));
  const assetUnit = asset.category === "stocks" || asset.category === "stock" ? "Aktie" : asset.category === "crypto" ? "Coin" : "Anteil";
  const bitpandaUnitPrice = Number(quotePrice || (quoteQuantity ? quoteAssetValue / quoteQuantity : 0));
  const effectiveUnitPrice = Number(quote?.quote?.price_with_fee || (quoteQuantity && quoteTotal ? quoteTotal / quoteQuantity : bitpandaUnitPrice));

  useEffect(() => {
    if (earnConfigs.length && !earnConfigs.some(config => config.id === earn.configId)) setEarn(current => ({ ...current, configId: earnConfigs[0].id, walletId: "" }));
  }, [publicAsset?.id, earnConfigs.length]);

  async function createQuote(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setQuote(null);
    try {
      if (!publicAsset?.id) throw new Error("Dieses Asset konnte nicht eindeutig der neuen Bitpanda API zugeordnet werden.");
      const result = await request("/trading/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: publicAsset.id, ...trade }) });
      setQuote(result); setNotice("Bitpanda-Preis geladen. Prüfe die Quote und bestätige anschließend den Kauf oder Verkauf.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function acceptQuote() {
    if (actionLock.current || !quote) return;
    actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await performAction({
        pending: `${trade.side === "BUY" ? "Kauf" : "Verkauf"} von ${publicAsset.symbol} wird an Bitpanda gesendet …`,
        execute: () => request(`/trading/quotes/${quote.quote_id}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "JETZT HANDELN" }) }),
        success: result => tradeFeedback(result, { side: trade.side, asset: publicAsset.symbol }),
        failure: "Handel konnte nicht bestätigt werden", uncertain: true,
        refresh: async () => { accountCache = null; setAccount(await loadAccount(true)); await onTradeCompleted?.(); }
      });
      // Never reuse a quote after an execution attempt, including a lost response.
      setQuote(null);
    } finally { actionLock.current = false; setBusy(false); }
  }

  async function submitEarn(event) {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await performAction({ pending: `${publicAsset.symbol} wird zu Earn hinzugefügt …`,
        execute: () => request("/earn/actions/stake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(earn) }),
        success: result => ({ kind: "success", message: `Earn-Anfrage für ${publicAsset.symbol} bestätigt · Status: ${result.status || "übermittelt"}.` }),
        failure: "Earn-Anfrage konnte nicht bestätigt werden", uncertain: true,
        refresh: async () => { setEarn(current => ({ ...current, amount: "", confirmation: "" })); accountCache = null; setAccount(await loadAccount(true)); }
      });
    } finally { actionLock.current = false; setBusy(false); }
  }

  function changeTrade(patch) { setQuote(null); setNotice(""); setTrade(current => ({ ...current, ...patch })); }

  return <section className="asset-actions" aria-label={`Handel und Earn für ${asset.name}`}>
    <div className="section-heading"><div><span className="eyebrow">Direkt beim Asset</span><h3>Kaufen, verkaufen{canEarn ? " oder Earn nutzen" : ""}</h3></div></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {notice && <div className="success-box" role="status">{notice}</div>}
    {!account && !error && <div className="loading-state">Handelsmöglichkeiten werden geladen …</div>}
    {account && !publicAsset && <div className="info-box">Dieses Asset kann derzeit nicht direkt über das Dashboard gehandelt werden.</div>}
    {publicAsset && <div className={`asset-action-grid ${canEarn ? "with-earn" : ""}`}>
      <article className="table-card action-card"><h4>{publicAsset.symbol} handeln</h4><p className="source-note">Abrechnung immer in EUR. Eine Quote führt noch keinen Trade aus.</p><form onSubmit={createQuote}><fieldset className="action-fieldset" disabled={busy}>
        <div className="form-row"><label>Aktion<select value={trade.side} onChange={e => changeTrade({ side: e.target.value })}><option value="BUY" disabled={!publicAsset.buy_active}>Kaufen</option><option value="SELL" disabled={!publicAsset.sell_active || ownedAmount <= 0}>Verkaufen</option></select></label><label>Angabe<select value={trade.mode} onChange={e => changeTrade({ mode: e.target.value })}><option value="notional">Euro-Betrag</option><option value="quantity">Stückzahl</option></select></label></div>
        <label>{trade.mode === "notional" ? "Betrag in EUR" : "Stückzahl"}<input required inputMode="decimal" value={trade.amount} onChange={e => changeTrade({ amount: e.target.value.replace(",", ".") })} /></label>
        {estimatedEuroValue != null && <div className="trade-estimate"><span>Marktpreis zur Orientierung</span><strong>{money(numericPrice)}</strong><small>{number(numericAmount)} Anteile ergeben am Markt ungefähr {money(estimatedEuroValue)}. Klicke auf „Bitpanda-Preis anfordern“, um vor dem Kauf deinen echten höheren Kaufpreis zu sehen.</small></div>}
        {estimatedQuantity != null && <div className="trade-estimate"><span>Marktpreis zur Orientierung</span><strong>{money(numericPrice)}</strong><small>Am Markt wären das ungefähr {number(estimatedQuantity)} {publicAsset.symbol}. Klicke auf „Bitpanda-Preis anfordern“, um vor dem Kauf deinen echten höheren Kaufpreis zu sehen.</small></div>}
        {ownedAmount > 0 && <small>Verfügbarer Bestand laut Portfolio: {number(ownedAmount)} {publicAsset.symbol}</small>}
        <button disabled={busy || !selectedSideAvailable}>{busy ? "Bitpanda-Preis wird geladen …" : "Bitpanda-Preis anfordern"}</button>
      </fieldset></form>
      {quote && <div className="quote-review"><h4>Dein echter Bitpanda-Preis</h4><p className="source-note">Diese Quote kommt direkt von Bitpanda. Erst der Button darunter führt den Kauf oder Verkauf aus.</p><dl className="trade-cost-breakdown"><div className="unit-price-field"><dt>{trade.side === "BUY" ? "Bitpanda-Kaufpreis" : "Bitpanda-Verkaufspreis"} pro {assetUnit}</dt><dd>{bitpandaUnitPrice ? money(bitpandaUnitPrice) : "–"}</dd></div><div><dt>{trade.side === "BUY" ? "Tatsächlicher Kaufwert" : "Verkaufswert"}</dt><dd>{money(quoteAssetValue)}</dd></div><div className="fee-field"><dt>Zusätzliche Gebühr</dt><dd>{money(quoteFee)}</dd></div><div><dt>{trade.side === "BUY" ? "Gesamtbelastung" : "Auszahlung"}</dt><dd>{quoteTotal ? money(quoteTotal) : "–"}</dd></div><div><dt>Du erhältst / verkaufst</dt><dd>{quoteQuantity ? `${number(quoteQuantity)} ${publicAsset.symbol}` : "–"}</dd></div><div><dt>Effektiver Preis pro {assetUnit} inkl. Gebühr</dt><dd>{effectiveUnitPrice ? money(effectiveUnitPrice) : "–"}</dd></div></dl>{quote.quote?.expires_at && <p className="source-note">Gültig bis {new Date(quote.quote.expires_at).toLocaleTimeString("de-AT")}.</p>}{(quote.warnings || []).map((warning, index) => <div className="warning-box compact" key={`${warning.code || "warning"}-${index}`}>{warning.message || warning.code}</div>)}<button className="danger-button" type="button" disabled={busy} onClick={acceptQuote}>{busy ? "Wird ausgeführt …" : trade.side === "BUY" ? "Jetzt verbindlich kaufen" : "Jetzt verbindlich verkaufen"}</button></div>}
      </article>
      <article className="table-card cash-availability-card"><span className="eyebrow">Zum Kaufen verfügbar</span><strong>{money(availableEur)}</strong><p>Verfügbares Guthaben in deiner normalen EUR-Wallet laut Bitpanda-Portfolio.</p>{availableEur <= 0 && <div className="info-box compact">Falls dein Geld in Cash Plus liegt, musst du es zuerst in der Bitpanda-App in die normale EUR-Wallet verschieben.</div>}</article>
      {canEarn && <article className="table-card action-card"><h4>{publicAsset.symbol} zu Earn hinzufügen</h4><p className="source-note">Nur verfügbar, weil du dieses Krypto-Asset besitzt und Bitpanda Earn dafür unterstützt.</p><form onSubmit={submitEarn}><fieldset className="action-fieldset" disabled={busy}>
        <label>Earn-Produkt<select value={earn.configId} onChange={e => setEarn({ ...earn, configId: e.target.value })}>{earnConfigs.map(config => <option key={config.id} value={config.id}>{number(config.annual_percentage_rate)} % p.a. · {config.mode}</option>)}</select></label>
        <label>Wallet<select required value={earn.walletId} onChange={e => setEarn({ ...earn, walletId: e.target.value })}><option value="">Wallet auswählen …</option>{wallets.map(wallet => <option key={wallet.wallet_id} value={wallet.wallet_id}>{publicAsset.symbol} · {wallet.wallet_id.slice(0, 8)}…</option>)}</select></label>
        <label>Menge<input required inputMode="decimal" value={earn.amount} onChange={e => setEarn({ ...earn, amount: e.target.value.replace(",", ".") })} /></label>
        <label><code>EARN BESTÄTIGEN</code> eingeben<input required value={earn.confirmation} onChange={e => setEarn({ ...earn, confirmation: e.target.value })} /></label>
        <button disabled={busy || earn.confirmation !== "EARN BESTÄTIGEN" || !wallets.length}>Zu Earn hinzufügen</button>
        {!wallets.length && <small>Für dieses Asset wurde in den geladenen Transaktionen noch keine Wallet-ID gefunden.</small>}
      </fieldset></form></article>}
    </div>}
  </section>;
}

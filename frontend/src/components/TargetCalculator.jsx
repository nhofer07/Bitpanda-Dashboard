import PageDescription from "./PageDescription.jsx";
import { useEffect, useMemo, useState } from "react";

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

function formatNumber(value, digits = 8) {
  return Number(value || 0).toLocaleString("de-DE", {
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function toInputValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return String(Number(value));
}

const KEST_RATE = 0.275;
const CALCULATOR_STORAGE_KEY = "bitpanda-dashboard-target-calculator";

const EMPTY_CALCULATOR_STATE = {
  query: "",
  selectedKey: "",
  investmentAmount: "",
  quantity: "",
  basisPrice: "",
  currentPrice: "",
  targetProfit: "",
  targetPriceInput: ""
};

function readStoredCalculatorState() {
  try {
    const stored = JSON.parse(localStorage.getItem(CALCULATOR_STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object") return EMPTY_CALCULATOR_STATE;

    return {
      query: String(stored.query || ""),
      selectedKey: String(stored.selectedKey || ""),
      investmentAmount: String(stored.investmentAmount || ""),
      quantity: String(stored.quantity || ""),
      basisPrice: String(stored.basisPrice || ""),
      currentPrice: String(stored.currentPrice || ""),
      targetProfit: String(stored.targetProfit || ""),
      targetPriceInput: String(stored.targetPriceInput || "")
    };
  } catch {
    return EMPTY_CALCULATOR_STATE;
  }
}

function taxOnProfit(value, taxable = true) {
  const profit = Number(value || 0);
  return taxable && profit > 0 ? profit * KEST_RATE : 0;
}

function afterTaxProfit(value, taxable = true) {
  const profit = Number(value || 0);
  return profit - taxOnProfit(profit, taxable);
}

function assetTitle(asset) {
  return asset?.displayName || asset?.name || asset?.assetKey || "-";
}

function assetSymbol(asset) {
  return asset?.assetKey || asset?.name || "-";
}

function latestTradePrice(asset) {
  const trade = (asset?.trades || []).find(item => item?.price || item?.fiat);
  const quantity = Number(trade?.quantity || 0);
  const fiat = Number(trade?.fiat || 0);
  const price = Number(trade?.price || 0);

  if (Number.isFinite(price) && price > 0) return price;
  if (quantity > 0 && fiat > 0) return fiat / quantity;
  return null;
}

export default function TargetCalculator({ data, loading, error }) {
  const storedCalculatorState = useMemo(readStoredCalculatorState, []);
  const assets = useMemo(() => {
    const openPositions = (data?.openPositions || []).map(asset => ({
      ...asset,
      calculatorSource: "open"
    }));
    const openSymbols = new Set(openPositions.map(asset => String(assetSymbol(asset))));
    const historyAssets = (data?.profitLoss?.assets || [])
      .filter(asset => !openSymbols.has(String(assetSymbol(asset))))
      .map(asset => ({
        ...asset,
        calculatorSource: "history",
        currentPrice: asset.currentPrice ?? latestTradePrice(asset),
        averageRemainingCost: asset.averageRemainingCost || latestTradePrice(asset)
      }));

    return [
      ...openPositions.sort((a, b) => assetTitle(a).localeCompare(assetTitle(b))),
      ...historyAssets.sort((a, b) => assetTitle(a).localeCompare(assetTitle(b)))
    ];
  }, [data]);
  const [query, setQuery] = useState(storedCalculatorState.query);
  const [selectedKey, setSelectedKey] = useState(storedCalculatorState.selectedKey);
  const [investmentAmount, setInvestmentAmount] = useState(storedCalculatorState.investmentAmount);
  const [quantity, setQuantity] = useState(storedCalculatorState.quantity);
  const [basisPrice, setBasisPrice] = useState(storedCalculatorState.basisPrice);
  const [currentPrice, setCurrentPrice] = useState(storedCalculatorState.currentPrice);
  const [targetProfit, setTargetProfit] = useState(storedCalculatorState.targetProfit);
  const [targetPriceInput, setTargetPriceInput] = useState(storedCalculatorState.targetPriceInput);

  const selectedAsset = assets.find(asset => String(asset.assetKey) === String(selectedKey)) || null;
  const isTaxableAsset = !selectedAsset || (selectedAsset.category || "").toLowerCase() !== "crypto";
  const effectiveTaxRate = isTaxableAsset ? KEST_RATE : 0;
  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? assets.filter(position => {
        const haystack = `${assetTitle(position)} ${assetSymbol(position)} ${position.categoryLabel || ""}`.toLowerCase();
        return haystack.includes(needle);
      })
      : assets;

    return visible.slice(0, 16);
  }, [assets, query]);

  const qty = Number(quantity);
  const basis = Number(basisPrice || currentPrice);
  const price = Number(currentPrice);
  const target = Number(targetProfit);
  const enteredTargetPrice = Number(targetPriceInput);
  const canCalculateBase = qty > 0 && Number.isFinite(basis) && basis >= 0 && Number.isFinite(price) && price >= 0;
  const canCalculateProfitTarget = canCalculateBase && targetProfit !== "" && Number.isFinite(target);
  const canCalculateEnteredTarget = canCalculateBase && Number.isFinite(enteredTargetPrice) && enteredTargetPrice >= 0 && targetPriceInput !== "";
  const targetMode = targetPriceInput !== "" ? "price" : targetProfit !== "" ? "profit" : "";
  const hasActiveTarget = canCalculateProfitTarget || canCalculateEnteredTarget;
  const currentValue = canCalculateBase ? qty * price : 0;
  const costBasis = qty > 0 && Number.isFinite(basis) && basis >= 0 ? qty * basis : 0;
  const currentProfit = canCalculateBase ? currentValue - costBasis : 0;
  const currentProfitAfterTax = canCalculateBase ? afterTaxProfit(currentProfit, isTaxableAsset) : 0;
  const requiredGrossProfit = canCalculateProfitTarget ? target > 0 ? target / (1 - effectiveTaxRate) : target : 0;
  const targetValueFromProfit = canCalculateProfitTarget ? costBasis + requiredGrossProfit : 0;
  const requiredTargetPrice = canCalculateProfitTarget ? targetValueFromProfit / qty : 0;
  const enteredTargetValue = canCalculateEnteredTarget ? qty * enteredTargetPrice : 0;
  const enteredTargetProfit = canCalculateEnteredTarget ? enteredTargetValue - costBasis : 0;
  const activeTargetPrice = canCalculateProfitTarget ? requiredTargetPrice : canCalculateEnteredTarget ? enteredTargetPrice : 0;
  const activeTargetValue = canCalculateProfitTarget ? targetValueFromProfit : enteredTargetValue;
  const activeTargetProfit = canCalculateProfitTarget ? requiredGrossProfit : enteredTargetProfit;
  const activeTargetTax = hasActiveTarget ? taxOnProfit(activeTargetProfit, isTaxableAsset) : 0;
  const activeTargetProfitAfterTax = hasActiveTarget ? afterTaxProfit(activeTargetProfit, isTaxableAsset) : 0;
  const priceDelta = hasActiveTarget ? activeTargetPrice - price : 0;
  const percentDelta = hasActiveTarget && price > 0 ? priceDelta / price * 100 : null;
  const remainingProfitAfterTax = canCalculateProfitTarget ? target - currentProfitAfterTax : 0;

  useEffect(() => {
    try {
      localStorage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify({
        query,
        selectedKey,
        investmentAmount,
        quantity,
        basisPrice,
        currentPrice,
        targetProfit,
        targetPriceInput
      }));
    } catch {
      // Local storage only restores convenience state.
    }
  }, [basisPrice, currentPrice, investmentAmount, quantity, query, selectedKey, targetPriceInput, targetProfit]);

  function selectAsset(asset) {
    const quantityValue = Number(asset.currentQuantity || 0);
    const selectedCurrentPrice = Number(asset.currentPrice || 0);
    const fallbackBasis = quantityValue > 0 ? Number(asset.costBasis || 0) / quantityValue : selectedCurrentPrice;

    setSelectedKey(asset.assetKey);
    setQuery(`${assetTitle(asset)} (${assetSymbol(asset)})`);
    setQuantity(quantityValue > 0 ? toInputValue(asset.currentQuantity) : "");
    setInvestmentAmount(quantityValue > 0 && selectedCurrentPrice > 0 ? toInputValue(quantityValue * selectedCurrentPrice) : "");
    setCurrentPrice(toInputValue(selectedCurrentPrice));
    setBasisPrice(toInputValue(quantityValue > 0 ? asset.averageRemainingCost ?? fallbackBasis : selectedCurrentPrice));
    // A selected portfolio asset starts at break-even, so the calculator shows
    // the price required to exit without a profit or loss immediately.
    setTargetProfit("0");
    setTargetPriceInput("");
  }

  function updateCurrentPrice(value) {
    setCurrentPrice(value);
    const nextPrice = Number(value);
    const selectedQuantity = Number(selectedAsset?.currentQuantity || 0);
    if ((!selectedAsset || selectedQuantity <= 0) && value !== "" && Number.isFinite(nextPrice) && nextPrice >= 0) {
      setBasisPrice(value);
    }
    if (investmentAmount !== "" && Number.isFinite(nextPrice) && nextPrice > 0) {
      setQuantity(toInputValue(Number(investmentAmount) / nextPrice));
    }
  }

  function updateInvestmentAmount(value) {
    setInvestmentAmount(value);
    const amount = Number(value);
    const nextPrice = Number(currentPrice);
    setQuantity(value !== "" && Number.isFinite(amount) && amount >= 0 && nextPrice > 0
      ? toInputValue(amount / nextPrice)
      : "");
  }

  function updateQuantity(value) {
    setQuantity(value);
    const nextQuantity = Number(value);
    const nextPrice = Number(currentPrice);
    setInvestmentAmount(value !== "" && Number.isFinite(nextQuantity) && nextQuantity >= 0 && nextPrice > 0
      ? toInputValue(nextQuantity * nextPrice)
      : "");
  }

  function updateTargetProfit(value) {
    setTargetProfit(value);
    if (value !== "") {
      setTargetPriceInput("");
    }
  }

  function updateTargetPrice(value) {
    setTargetPriceInput(value);
    if (value !== "") {
      setTargetProfit("");
    }
  }

  if (loading) return <div className="loading-state">Lade Rechner...</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      <section className="hero-card calculator-hero">
        <div>
          <div className="eyebrow">Zielkurs Rechner</div>
          <h2>Zielkurs berechnen</h2>
          <PageDescription summary="Wähle ein Asset und berechne den Kurs für deinen Zielgewinn oder den Gewinn bei einem Zielpreis.">
            Berechnet entweder den Kurs für deinen Zielgewinn oder den Gewinn, der bei deinem Zielpreis übrig bleibt. Der Rechner verwendet Kostenbasis und aktuellen Bitpanda-Kurs. Zukünftige Verkaufsgebühren, Spread und externe Steuern sind nicht enthalten. Für Krypto wird keine KESt gerechnet.
          </PageDescription>
        </div>
      </section>

      <div className="calculator-grid">
        <section className="table-card calculator-card">
          <div className="section-heading">
            <h3>Asset suchen</h3>
            <span>{assets.length} Assets</span>
          </div>
          <div className="asset-search-field">
            <input
              className="search-input"
              value={query}
              placeholder="Name oder Symbol suchen..."
              onChange={event => {
                setQuery(event.target.value);
                setSelectedKey("");
              }}
            />
            {query && (
              <button
                className="asset-search-clear"
                type="button"
                aria-label="Suche zurücksetzen"
                onClick={() => {
                  setQuery("");
                  setSelectedKey("");
                }}
              >
                x
              </button>
            )}
          </div>
          <div className="asset-search-results">
            {filteredAssets.map(asset => (
              <button
                key={asset.assetKey}
                className={String(selectedKey) === String(asset.assetKey) ? "asset-search-item active" : "asset-search-item"}
                onClick={() => selectAsset(asset)}
              >
                <span>
                  <strong>{assetTitle(asset)}</strong>
                  <small>
                    {assetSymbol(asset)} · {asset.categoryLabel || "Asset"} · {asset.calculatorSource === "open" ? "Offen" : "Historie"}
                  </small>
                </span>
                <strong>{asset.currentPrice == null ? "-" : formatCurrency(asset.currentPrice)}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="table-card calculator-card">
          <div className="section-heading">
            <h3>Eingaben</h3>
            <span>{selectedAsset ? assetSymbol(selectedAsset) : "Manuell"}</span>
          </div>
          <div className="calculator-form-grid">
            <label className="field-stack">
              <span>Investitionsbetrag (€)</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={investmentAmount}
                onChange={event => updateInvestmentAmount(event.target.value)}
                placeholder="z. B. 100"
              />
              <small>Alternative zur Anteilseingabe: Der Betrag wird zum aktuellen Kurs automatisch in Anteile umgerechnet.</small>
            </label>
            <label className="field-stack">
              <span>Anteile</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                step="any"
                value={quantity}
                onChange={event => updateQuantity(event.target.value)}
              />
            </label>
            <label className="field-stack">
              <span>Durchschnittlicher Einstieg</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                step="any"
                value={basisPrice}
                onChange={event => setBasisPrice(event.target.value)}
              />
            </label>
            <label className="field-stack">
              <span>Aktueller Kurs</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                step="any"
                value={currentPrice}
                onChange={event => updateCurrentPrice(event.target.value)}
              />
            </label>
            <label className="field-stack">
              <span>Zielgewinn</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                step="any"
                value={targetProfit}
                onChange={event => updateTargetProfit(event.target.value)}
              />
            </label>
            <label className="field-stack">
              <span>Zielpreis</span>
              <input
                className="search-input compact-input"
                type="number"
                inputMode="decimal"
                step="any"
                value={targetPriceInput}
                onChange={event => updateTargetPrice(event.target.value)}
              />
            </label>
          </div>
        </section>
      </div>

      <section className="stats-grid calculator-results">
        <Metric
          title={targetMode === "price" ? "Zielpreis" : "Zielkurs"}
          value={hasActiveTarget ? formatCurrency(activeTargetPrice) : "-"}
          tone={hasActiveTarget && priceDelta <= 0 ? "positive" : ""}
        />
        <Metric title="Aktueller Wert" value={canCalculateBase ? formatCurrency(currentValue) : "-"} />
        <Metric
          title={targetMode === "profit" ? "Zielgewinn brutto" : "Zielwert"}
          value={hasActiveTarget ? formatCurrency(targetMode === "profit" ? activeTargetProfit : activeTargetValue) : "-"}
          tone={targetMode === "profit" ? activeTargetProfit >= 0 ? "positive" : "negative" : ""}
        />
        <Metric
          title="Aktueller Gewinn"
          value={canCalculateBase ? formatCurrency(currentProfit) : "-"}
          tone={currentProfit >= 0 ? "positive" : "negative"}
        />
        <Metric
          title={targetMode === "price" ? "Gewinn brutto" : "Fehlender Netto-Gewinn"}
          value={hasActiveTarget ? formatCurrency(targetMode === "price" ? activeTargetProfit : remainingProfitAfterTax) : "-"}
          tone={targetMode === "price" ? activeTargetProfit >= 0 ? "positive" : "negative" : remainingProfitAfterTax <= 0 ? "positive" : "negative"}
        />
        <Metric
          title="Kursabstand"
          value={hasActiveTarget ? <>{formatCurrency(priceDelta)}{percentDelta === null ? "" : <span className="metric-secondary">({formatPercent(percentDelta)})</span>}</> : "-"}
          tone={hasActiveTarget && priceDelta <= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="table-card tax-card">
        <div className="section-heading">
          <h3>KESt Rechner</h3>
          <span>{`${(effectiveTaxRate * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`}</span>
        </div>
        <div className="tax-grid">
          <Metric
            title={targetMode === "profit" ? "KESt beim Zielkurs" : "KESt bei Zielpreis"}
            value={hasActiveTarget ? formatCurrency(activeTargetTax) : "-"}
            tone={activeTargetTax > 0 ? "negative" : ""}
          />
          <Metric
            title={targetMode === "profit" ? "Zielgewinn nach KESt" : "Gewinn bei Zielpreis nach KESt"}
            value={hasActiveTarget ? formatCurrency(activeTargetProfitAfterTax) : "-"}
            tone={hasActiveTarget ? activeTargetProfitAfterTax >= 0 ? "positive" : "negative" : ""}
          />
        </div>
      </section>


    </div>
  );
}

function Metric({ title, value, tone }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

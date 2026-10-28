import { formatCurrency } from "./formatters.js";
import PageIntro from "./PageIntro.jsx";
import LoadingState from "./LoadingState.jsx";
import PageDescription from "./PageDescription.jsx";
import { useEffect, useState } from "react";
import { amount, cashflowClass, defaultCashflowClass } from "./helpers.js";

function periodLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) return value || "–";
  return new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00`));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("de-DE") : "-";
}

function plural(count, singular, pluralLabel) {
  return Number(count || 0) === 1 ? singular : pluralLabel;
}

function periodResult(row) {
  return Number(row?.net || 0) + Number(row?.realizedProfit || 0) + Number(row?.dividends || 0);
}

function investmentResult(row) {
  return Number(row?.realizedProfit || 0) + Number(row?.dividends || 0);
}

function periodKeyFromTransaction(transaction, mode) {
  const dateValue =
    transaction.attributes?.time?.date_iso8601 ||
    transaction.attributes?.created_at ||
    transaction.created_at;

  if (!dateValue) return mode === "monthly" ? "Unbekannt" : "Unbekannt";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return mode === "monthly" ? "Unbekannt" : "Unbekannt";

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return mode === "monthly" ? `${year}-${month}` : year;
}

function buildAdjustedFiatPeriods(transactions, basePeriods, mode, overrides = {}) {
  const map = new Map();

  function ensure(period) {
    if (!map.has(period)) {
      map.set(period, {
        period,
        deposits: 0,
        withdrawals: 0,
        expenses: 0,
        transfers: 0,
        refunds: 0,
        refundedDeposits: 0,
        refundedWithdrawals: 0,
        dividends: 0,
        dividendGross: 0,
        dividendTax: 0,
        net: 0,
        count: 0,
        dividendCount: 0
      });
    }

    return map.get(period);
  }

  for (const item of basePeriods || []) {
    const period = ensure(item.period);
    period.dividends = item.dividends || 0;
    period.dividendGross = item.dividendGross || item.dividends || 0;
    period.dividendTax = item.dividendTax || 0;
    period.dividendCount = item.dividendCount || 0;
  }

  for (const transaction of transactions || []) {
    const classification = cashflowClass(transaction, overrides);
    const value = amount(transaction);
    const period = ensure(periodKeyFromTransaction(transaction, mode));
    const fallback = defaultCashflowClass(transaction);

    if (classification === "deposit") {
      period.deposits += value;
      period.net += value;
    } else if (classification === "expense" || classification === "withdrawal") {
      period.withdrawals += value;
      period.expenses += value;
      period.net -= value;
    } else if (classification === "transfer") {
      period.transfers += value;
      period.net -= value;
    } else if (classification === "refund") {
      if (["expense", "withdrawal", "transfer"].includes(fallback)) {
        period.refundedWithdrawals += value;
      } else {
        period.refundedDeposits += value;
      }
      period.refunds = Math.max(period.refundedDeposits, period.refundedWithdrawals);
    }

    if (classification !== "ignore") {
      period.count += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.period.localeCompare(a.period));
}

function mergePeriods(fiatPeriods, profitPeriods) {
  const map = new Map();

  for (const item of fiatPeriods || []) {
    map.set(item.period, {
      period: item.period,
      deposits: item.deposits || 0,
      withdrawals: item.withdrawals || 0,
      expenses: item.expenses || 0,
      transfers: item.transfers || 0,
      refunds: item.refunds || 0,
      dividends: item.dividends || 0,
      dividendGross: item.dividendGross || item.dividends || 0,
      dividendTax: item.dividendTax || 0,
      net: item.net || 0,
      transactionCount: item.count || 0,
      dividendCount: item.dividendCount || 0,
      realizedProfit: 0,
      grossRealizedProfit: 0,
      tradingFees: 0,
      estimatedTax: 0,
      sellCount: 0
    });
  }

  for (const item of profitPeriods || []) {
    if (!map.has(item.period)) {
      map.set(item.period, {
        period: item.period,
        deposits: 0,
        withdrawals: 0,
        expenses: 0,
        transfers: 0,
        refunds: 0,
        dividends: 0,
        dividendGross: 0,
        dividendTax: 0,
        net: 0,
        transactionCount: 0,
        dividendCount: 0,
        realizedProfit: 0,
        grossRealizedProfit: 0,
        tradingFees: 0,
        estimatedTax: 0,
        sellCount: 0
      });
    }

    const existing = map.get(item.period);
    existing.realizedProfit = item.realizedProfit || 0;
    existing.grossRealizedProfit = item.grossRealizedProfit || 0;
    existing.tradingFees = item.tradingFees || 0;
    existing.estimatedTax = item.estimatedTax || 0;
    existing.sellCount = item.sellCount || 0;
  }

  return Array.from(map.values()).sort((a, b) => b.period.localeCompare(a.period));
}

export default function PeriodOverview({ cashflowOverrides = {} }) {
  const [mode, setMode] = useState("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [showDividends, setShowDividends] = useState(false);
  const [showInvestmentResults, setShowInvestmentResults] = useState(false);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    try {
      setLoading(true);
      setError("");

      const [summaryResponse, transactionsResponse] = await Promise.all([
        fetch("/api/dashboard-summary"),
        fetch("/api/transactions")
      ]);
      const data = await summaryResponse.json();
      const transactionData = await transactionsResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(data.error || "Fehler beim Laden");
      }
      if (!transactionsResponse.ok) {
        throw new Error(transactionData.error || "Fehler beim Laden");
      }

      setSummary(data);
      setTransactions(transactionData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingState>Lade Übersicht …</LoadingState>;

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  const rows = mergePeriods(
    buildAdjustedFiatPeriods(transactions, summary?.fiat?.[mode], mode, cashflowOverrides),
    summary?.profitLoss?.[mode]
  );
  const dividendDetails = summary?.dividendDetails || [];
  const selected = rows.find(row => row.period === selectedPeriod) || rows[0] || null;
  const selectedDividendDetails = dividendDetails.filter(item => {
    const period = mode === "monthly" ? item.month : item.year;
    return selected && period === selected.period;
  });
  const selectedInvestmentResults = (summary?.profitLoss?.realizedTrades || []).filter(item => {
    const period = mode === "monthly" ? item.month : item.year;
    return selected && period === selected.period;
  });

  return (
    <div className="period-overview">
      <PageIntro>
        <div>

          <PageDescription summary="Einzahlungen, Ausgaben und Anlageergebnisse im Monats- und Jahresvergleich.">
            Netto ist Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten. Rückerstattungen werden separat ausgewiesen und sind nicht im Netto enthalten.
            „Anlageergebnis“ ist Netto G/V aus Verkäufen plus gebuchte Dividenden. Gewinn- und Steuerwerte werden in allen Ansichten einheitlich berechnet. Dividenden werden berücksichtigt, wenn sie in den Bitpanda-Buchungsdaten entsprechend ausgewiesen sind.
          </PageDescription>
        </div>
        <div className="hero-status">
          <span>{mode === "monthly" ? "Monate" : "Jahre"}</span>
          <strong>{rows.length}</strong>
        </div>
      </PageIntro>

      {!summary?.paidTax?.available && <div className="info-box">Steuerbuchungen sind nicht verfügbar. Die Ergebnisse enthalten solange keinen KESt-Abzug.</div>}

      <div className="view-panel compact-panel">
        <div className="segmented-control">
          <button className={mode === "monthly" ? "active" : ""} onClick={() => {
            setMode("monthly");
            setSelectedPeriod("");
            setShowDividends(false);
            setShowInvestmentResults(false);
          }}>
          Monate
          </button>
          <button className={mode === "yearly" ? "active" : ""} onClick={() => {
            setMode("yearly");
            setSelectedPeriod("");
            setShowDividends(false);
            setShowInvestmentResults(false);
          }}>
          Jahre
          </button>
        </div>
      </div>

      <div className="period-explorer">
        <section className="period-list-card">
          <div className="section-heading">
            <h3>{mode === "monthly" ? "Monate" : "Jahre"}</h3>
            <span>{rows.length} Zeiträume</span>
          </div>
          <div className="period-list">
            {rows.map(row => (
              <PeriodButton
                key={row.period}
                row={row}
                active={selected?.period === row.period}
                onClick={() => {
                  setSelectedPeriod(row.period);
                  setShowDividends(false);
                  setShowInvestmentResults(false);
                }}
              />
            ))}
          </div>
        </section>

        <section className="period-detail-card">
          <div className="section-heading">
            <h3>{selected ? periodLabel(selected.period) : "Kein Zeitraum"}</h3>
            <span>Details</span>
          </div>

          {selected ? (
            <>
              <div className="period-detail-grid">
                <Metric title="Einzahlungen" value={formatCurrency(selected.deposits)} tone="positive" />
                <Metric title="Echte Ausgaben" value={formatCurrency(selected.expenses)} tone="negative" />
                <Metric title="Transfers" value={formatCurrency(selected.transfers)} />
                <Metric title="Rückerstattungen" value={formatCurrency(selected.refunds)} tone="positive" />
                <Metric title="Netto-Einzahlungen" value={formatCurrency(selected.net)} tone={Number(selected.net || 0) >= 0 ? "positive" : "negative"} />
                <Metric title="Netto G/V nach KESt" value={formatCurrency(selected.realizedProfit)} tone={Number(selected.realizedProfit || 0) >= 0 ? "positive" : "negative"} />
                <Metric title="Anlageergebnis" value={formatCurrency(investmentResult(selected))} tone={investmentResult(selected) >= 0 ? "positive" : "negative"} />
                <Metric title="Dividenden netto" value={formatCurrency(selected.dividends)} tone={Number(selected.dividends || 0) >= 0 ? "positive" : "negative"} />
                <Metric title="Verkäufe" value={selected.sellCount} />
              </div>

              <div className="period-detail-breakdown">
                <DetailRow label="Brutto G/V" value={formatCurrency(selected.grossRealizedProfit)} tone={Number(selected.grossRealizedProfit || 0) >= 0 ? "positive" : "negative"} />
                <DetailRow label="Trading-Gebühren" value={formatCurrency(selected.tradingFees)} tone="negative" />
                <DetailRow label="Gebuchte KESt" value={summary?.paidTax?.available ? formatCurrency(selected.estimatedTax) : "Nicht verfügbar"} tone={Number(selected.estimatedTax || 0) < 0 ? "positive" : "negative"} />
                <DetailRow label="Dividenden brutto" value={formatCurrency(selected.dividendGross)} tone={Number(selected.dividendGross || 0) >= 0 ? "positive" : "negative"} />
                <DetailRow label="Quellensteuer" value={formatCurrency(selected.dividendTax)} tone={Number(selected.dividendTax || 0) < 0 ? "negative" : ""} />
                <DetailRow label="Dividendbuchungen" value={selected.dividendCount} />
                <DetailRow label="Fiat-Buchungen" value={selected.transactionCount} />
              </div>

              <div className="period-dividend-list">
                <div className="section-heading flush-heading">
                  <h3>Dividenden in diesem Zeitraum</h3>
                  <div className="section-heading-actions">
                    <span>{selectedDividendDetails.length} Buchungen</span>
                    {selectedDividendDetails.length > 0 && (
                      <button
                        className="secondary-button small-button"
                        onClick={() => setShowDividends(value => !value)}
                      >
                        {showDividends ? "Schließen" : "Öffnen"}
                      </button>
                    )}
                  </div>
                </div>
                {selectedDividendDetails.length === 0 ? (
                  <p className="muted period-empty">Keine Dividenden in diesem Zeitraum.</p>
                ) : showDividends ? (
                  selectedDividendDetails.map(item => {
                    const amount = Number(item.amount || 0);

                    return (
                      <div key={item.id} className="period-dividend-item">
                        <span>
                          <strong>{item.asset || item.source || "-"}</strong>
                          <small>{formatDate(item.date)} · {item.bookingType || "-"} · Netto {formatCurrency(item.amount)}{Number(item.fee || 0) > 0 ? ` · Bitpanda-Gebühr ${formatCurrency(item.fee)} · Brutto ${formatCurrency(item.grossAmount)}` : ""}</small>
                        </span>
                        <strong className={amount >= 0 ? "positive" : "negative"}>{formatCurrency(amount)}</strong>
                      </div>
                    );
                  })
                ) : null}
              </div>

              <div className="period-dividend-list">
                <div className="section-heading flush-heading">
                  <h3>Gewinne / Verluste aus Verkäufen</h3>
                  <div className="section-heading-actions">
                    <span>{selectedInvestmentResults.length} Verkäufe</span>
                    {selectedInvestmentResults.length > 0 && (
                      <button
                        className="secondary-button small-button"
                        onClick={() => setShowInvestmentResults(value => !value)}
                      >
                        {showInvestmentResults ? "Schließen" : "Öffnen"}
                      </button>
                    )}
                  </div>
                </div>
                {selectedInvestmentResults.length === 0 ? (
                  <p className="muted period-empty">Keine realisierten Gewinne oder Verluste in diesem Zeitraum.</p>
                ) : showInvestmentResults ? (
                  selectedInvestmentResults.map(item => {
                    const amount = Number(item.realizedProfit || 0);
                    return (
                      <div key={item.id} className="period-dividend-item">
                        <span>
                          <strong>{item.asset || item.assetKey || "-"}</strong>
                          <small>{formatDate(item.date)} · Brutto {formatCurrency(item.grossRealizedProfit)} · Gebühren {formatCurrency(item.tradingFee)} · {item.taxSource === "bitpanda_bookings" ? "Gebuchte KESt" : "KESt nicht verfügbar"} {formatCurrency(item.estimatedTax)}</small>
                        </span>
                        <strong className={amount >= 0 ? "positive" : "negative"}>{formatCurrency(amount)}</strong>
                      </div>
                    );
                  })
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted period-empty">Keine Daten gefunden.</p>
          )}
        </section>
      </div>

      {rows.length === 0 && (
        <div className="empty-state">
          <h2>Keine Daten gefunden</h2>
          <p>Es liegen fuer diesen Zeitraum noch keine passenden Eintraege vor.</p>
        </div>
      )}
    </div>
  );
}

function PeriodButton({ row, active, onClick }) {
  const result = periodResult(row);
  const investment = investmentResult(row);

  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <span>
        <strong>{periodLabel(row.period)}</strong>
        <small>
          {row.transactionCount} {plural(row.transactionCount, "Buchung", "Buchungen")} · {row.sellCount} {plural(row.sellCount, "Verkauf", "Verkäufe")}
        </small>
      </span>
      <span className="period-result">
        <small>Inkl. Cashflow</small>
        <strong className={result >= 0 ? "positive" : "negative"}>{formatCurrency(result)}</strong>
        <small>Anlageergebnis</small>
        <strong className={investment >= 0 ? "positive" : "negative"}>{formatCurrency(investment)}</strong>
      </span>
    </button>
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

function DetailRow({ label, value, tone }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

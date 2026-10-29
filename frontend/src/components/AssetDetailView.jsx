import AdaptiveTable from "./AdaptiveTable.jsx";
import DataNote from "./DataNote.jsx";
import { formatPrice, formatCurrency, formatNumber, formatPercent, formatDateTime } from "./formatters.js";
import DataQuality from "./DataQuality.jsx";
import MarketHistoryChart from "./MarketHistoryChart.jsx";

function formatDate(time) {
  const date = time?.date_iso8601 || time;
  return formatDateTime(date);
}

function assetTitle(asset) {
  return asset?.displayName || asset?.name || asset?.assetKey || "-";
}

function assetSymbol(asset) {
  return asset?.assetKey || asset?.name || "-";
}

export default function AssetDetailView({ asset, onBack, embedded = false, children }) {
  if (!asset) {
    return (
      <div className="empty-state">
        <h2>Asset nicht gefunden</h2>
        <p>Die Position ist im aktuellen Datenstand nicht mehr enthalten.</p>
        <button className="secondary-button" onClick={onBack}>Zurück</button>
      </div>
    );
  }

  const unrealizedProfit = asset.unrealizedProfit == null ? null : Number(asset.unrealizedProfit);
  const realizedProfit = asset.realizedProfit == null ? null : Number(asset.realizedProfit);

  return (
    <div className="asset-position-details">
      {!embedded && <section className="hero-card">
        <div>
          <div className="eyebrow">Asset Detail</div>
          <h2>{assetTitle(asset)}</h2>
          <p>
            Symbol: {assetSymbol(asset)}. „Unrealisiert“ ist der aktuelle Marktwert abzüglich der verbleibenden Kostenbasis; „Realisiert“ stammt aus vergangenen Verkäufen nach Gebühren und KESt.
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={onBack}>Zurück</button>
          <span>{asset.priceSource || "Preisquelle unbekannt"}</span>
        </div>
      </section>}

      {embedded && <h3>Deine Position · {assetTitle(asset)}</h3>}
      <DataNote> Wallet-Bestand und Trade-Historie kommen von Bitpanda. Bestand, investierter Betrag und Positionswert werden bevorzugt aus der Bitpanda-Portfolio-API übernommen. Realisierte Gewinne werden aus den Trades und gebuchten Gebühren und Steuern berechnet. Eine Ersatzbewertung ist als solche gekennzeichnet.
      </DataNote>

      <div className="stats-grid">
        <Metric title="Aktueller Wert" value={asset.currentValue == null ? "–" : formatCurrency(asset.currentValue)} secondary={<DataQuality kind={asset.currentValue == null ? "unknown" : asset.priceSource === "Bitpanda Portfolio API" ? "reported" : "estimated"} />} />
        <Metric title="Bestand" value={formatNumber(asset.currentQuantity)} />
        <Metric title="Aktueller Kurs" value={asset.currentPrice == null ? "-" : formatPrice(asset.currentPrice)} />
        <Metric
          title="Unrealisierter Gewinn / Verlust"
          value={unrealizedProfit == null ? "Nicht verfügbar" : `${formatCurrency(unrealizedProfit)} (${formatPercent(asset.unrealizedProfitPercent)})`}
          tone={unrealizedProfit >= 0 ? "positive" : "negative"}
        />
        <Metric
          title="Gewinn / Verlust aus Verkäufen"
          value={formatCurrency(realizedProfit)}
          tone={realizedProfit >= 0 ? "positive" : "negative"}
        />
        <Metric title="Ø Einstieg" value={asset.averageRemainingCost == null ? "–" : formatPrice(asset.averageRemainingCost)} secondary={<DataQuality kind={asset.averageRemainingCost == null ? "unknown" : asset.averageEntrySource === "Bitpanda Portfolio API" ? "reported" : "estimated"} />} />
      </div>

      {!embedded && <MarketHistoryChart asset={{ symbol: asset.assetKey || asset.name, name: assetTitle(asset), category: asset.category || "other", chartSource: "bitpanda" }} trades={asset.trades || []} />}

      <div className="overview-grid">
        <section className="top-card">
          <h3>Position</h3>
          <DetailRow label="Kostenbasis" value={formatCurrency(asset.costBasis)} />
          <DetailRow label="Gekauft" value={formatCurrency(asset.totalBoughtFiat)} />
          <DetailRow label="Verkauft" value={formatCurrency(asset.totalSoldFiat)} />
          <DetailRow label="Käufe" value={asset.buyCount} />
          <DetailRow label="Verkäufe" value={asset.sellCount} />
        </section>

        <section className="top-card">
          <h3>Wallet-Abgleich</h3>
          <DetailRow label="Wallet-Bestand" value={asset.walletBalance == null ? "-" : formatNumber(asset.walletBalance)} />
          <DetailRow label="Historien-Bestand" value={asset.reconstructedQuantity == null ? "-" : formatNumber(asset.reconstructedQuantity)} />
          <DetailRow label="Differenz" value={asset.quantityDifference == null ? "-" : formatNumber(asset.quantityDifference)} />
          <DetailRow label="Aktualisiert" value={formatDate(asset.priceUpdatedAt)} />
        </section>
      </div>

      {Number(asset.unmatchedSoldQuantity || 0) > 0.00000002 && <div className="warning-box">Für einen Teil der Verkäufe fehlt die Kaufkostenbasis in der Trade-Historie. Das berechnete Ergebnis kann durch Rewards, Transfers oder fehlende Käufe abweichen.</div>}
      {children}

      <section className="table-card">
        <div className="section-heading">
          <h3>Trade-Historie</h3>
          <span>{(asset.trades || []).length} Trades</span>
        </div>
        <div className="details-table-wrap trade-history-table-wrap">
        <AdaptiveTable className="clean-table compact">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Typ</th>
              <th>Menge</th>
              <th>Fiat</th>
              <th>Preis</th>
              <th>Gebühren inkl. Finanzierung</th>
              <th>KESt</th>
              <th>Gewinn / Verlust</th>
            </tr>
          </thead>
          <tbody>
            {(asset.trades || []).map(trade => {
              const profit = trade.realizedProfit;
              return (
                <tr key={trade.id}>
                  <td>{formatDate(trade.time)}</td>
                  <td>
                    <span className={trade.type === "buy" ? "pill pill-positive" : "pill pill-negative"}>
                      {trade.type === "buy" ? "Kauf" : "Verkauf"}
                    </span>
                  </td>
                  <td>{formatNumber(trade.quantity)}</td>
                  <td>{formatCurrency(trade.fiat)}</td>
                  <td>{formatPrice(trade.price)}</td>
                  <td>{trade.tradingFee == null && trade.financingFee == null ? "–" : formatCurrency(Number(trade.tradingFee || 0) + Number(trade.financingFee || 0))}</td>
                  <td>
                    {trade.type !== "sell" || trade.estimatedTax == null || trade.taxSource === "unavailable" ? "-" : <>
                      {formatCurrency(trade.estimatedTax)}
                      <small className="trade-tax-source">{trade.taxSource === "bitpanda_bookings" ? "Nach Erstattung" : "Nicht verfügbar"}</small>
                    </>}
                  </td>
                  <td className={profit == null ? "muted" : profit >= 0 ? "positive strong" : "negative strong"}>
                    {profit == null ? "-" : formatCurrency(profit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdaptiveTable>
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, tone, secondary }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong className={tone || ""}>{value}</strong>
      {secondary && <div className="metric-secondary">{secondary}</div>}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

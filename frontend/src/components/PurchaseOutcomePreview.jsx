import { useState } from 'react';
import SaleProfitPreview from './SaleProfitPreview.jsx';
import { formatPrice, numericValue } from './formatters.js';
export default function PurchaseOutcomePreview({ quantity, price, fee, totalCost, category, estimatedSellFee, sellFeeRate, currency = 'EUR' }) {
  const [target, setTarget] = useState('');
  const targetPrice = Number(target.replace(',', '.'));
  const cost = numericValue(totalCost), amount = numericValue(quantity), buyPrice = numericValue(price), buyFee = numericValue(fee);
  if (!(amount > 0) || !(buyPrice > 0) || cost == null || currency !== 'EUR') return null;
  const held = { currentQuantity: amount, costBasis: amount * buyPrice, historicalAcquisitionCost: cost, remainingFeeCostBasis: buyFee };
  return <section className="purchase-outcome-preview"><h4>Gewinn bei einem späteren Verkauf</h4><p className="source-note">Beim Kauf ist noch kein Gewinn realisiert. Gib einen möglichen Verkaufskurs ein, um die Rendite nach Kosten zu schätzen.</p><label className="settings-field"><span>Geplanter Verkaufskurs pro Einheit (EUR)</span><input aria-label="Geplanter Verkaufskurs" inputMode="decimal" onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} value={target} onChange={e => setTarget(e.target.value)} placeholder={formatPrice(buyPrice)} /></label>{targetPrice > 0 && estimatedSellFee != null && <><SaleProfitPreview quote={{ quote: { quantity: amount, price: targetPrice, fee: sellFeeRate != null ? amount * targetPrice * sellFeeRate : estimatedSellFee } }} held={held} category={category} estimated /><p className="source-note">Reines Szenario. Die Verkaufsgebühr ist mit dem aktuellen Gebührenansatz geschätzt; tatsächlicher Ausführungskurs, Gebühren und Steuerabzug können später abweichen.</p></>}</section>;
}

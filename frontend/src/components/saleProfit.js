const value = input => input !== null && input !== undefined && input !== '' && Number.isFinite(Number(input)) ? Number(input) : null;
const nonnegative = input => { const number = value(input); return number != null && number >= 0 ? number : null; };
export function saleProfit({ quote, held, category }) {
  const q = quote?.quote || {};
  const quantity = nonnegative(q.quantity);
  const price = nonnegative(q.price);
  const fee = nonnegative(q.fee);
  const effectivePrice = nonnegative(q.price_with_fee);
  const gross = quantity > 0 && price != null ? quantity * price : null;
  // price_with_fee is the effective execution price. Never subtract the fee twice.
  const proceeds = quantity > 0 && effectivePrice != null ? quantity * effectivePrice : gross != null && fee != null ? gross - fee : null;
  const owned = nonnegative(held?.currentQuantity);
  const share = owned > 0 && quantity > 0 && quantity <= owned + 1e-8 ? Math.min(1, quantity / owned) : null;
  const historyCost = nonnegative(held?.historicalAcquisitionCost);
  const basis = nonnegative(held?.costBasis);
  const buyFees = nonnegative(held?.remainingFeeCostBasis ?? held?.feeCostBasis);
  const historyQuantityMatches = held?.positionSource !== 'Bitpanda Portfolio API' || historyCost != null;
  const totalCost = historyCost ?? (historyQuantityMatches && basis != null && buyFees != null ? basis + buyFees : null);
  const acquisition = share != null && totalCost != null ? share * totalCost : null;
  // Crypto acquisition fees form part of acquisition cost; securities fees are
  // economic costs but do not reduce the standard Austrian taxable gain.
  const defaultTaxBasis = category === 'crypto' ? totalCost : ['stock', 'stocks', 'etf'].includes(category) ? basis : null;
  const taxBasis = share != null && defaultTaxBasis != null ? share * defaultTaxBasis : null;
  const estimatedTax = category === 'crypto' ? 0 : gross != null && taxBasis != null ? Math.round(Math.max(0, gross - taxBasis) * .275 * 100) / 100 : null;
  const netProceeds = proceeds != null && estimatedTax != null ? proceeds - estimatedTax : null;
  const netProfit = netProceeds != null && acquisition != null ? netProceeds - acquisition : null;
  const netProfitPercent = netProfit != null && acquisition > 0 ? netProfit / acquisition * 100 : null;
  return { quantity, gross, fee, proceeds, acquisition, taxBasis, estimatedTax, netProceeds, netProfit, netProfitPercent };
}

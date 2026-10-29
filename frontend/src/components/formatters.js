// One presentation contract for financial values. Missing data is not a zero.
export function numericValue(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function formatNumber(value, digits = 8) {
  const number = numericValue(value);
  return number == null ? '–' : number.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
export function formatCurrency(value) {
  const number = numericValue(value);
  return number == null ? '–' : `${(Math.abs(number) < 0.005 ? 0 : number).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
export function priceDigits(value) {
  const number = numericValue(value);
  if (number == null || number === 0) return 4;
  const absolute = Math.abs(number);
  return absolute < 0.01 ? Math.min(12, Math.max(4, Math.ceil(-Math.log10(absolute)) + 3)) : absolute < 10 ? 4 : 2;
}
export function formatPriceNumber(value, digits = priceDigits(value)) {
  const number = numericValue(value);
  return number == null ? '–' : number.toLocaleString('de-DE', { minimumFractionDigits: Math.min(digits, 4), maximumFractionDigits: digits });
}
export function formatPrice(value) {
  return numericValue(value) == null ? '–' : `${formatPriceNumber(value)} €`;
}
export function formatPercent(value) {
  const number = numericValue(value);
  return number == null ? '–' : `${(Math.abs(number) < 0.005 ? 0 : number).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}
export function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return !date || !Number.isFinite(date.getTime()) ? '–' : date.toLocaleString('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'short' });
}

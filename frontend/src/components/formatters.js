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
export function formatPercent(value) {
  const number = numericValue(value);
  return number == null ? '–' : `${(Math.abs(number) < 0.005 ? 0 : number).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}
export function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return !date || !Number.isFinite(date.getTime()) ? '–' : date.toLocaleString('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'short' });
}

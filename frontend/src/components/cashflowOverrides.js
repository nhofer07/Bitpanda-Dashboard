const CASHFLOW_OVERRIDES_KEY = "bitpanda-dashboard-cashflow-overrides";

export const CASHFLOW_OPTIONS = [
  { value: "deposit", label: "Einzahlung" },
  { value: "expense", label: "Ausgabe (z. B. Bitpanda Card)" },
  { value: "transfer", label: "Transfer auf anderes Konto" },
  { value: "withdrawal", label: "Auszahlung" },
  { value: "refund", label: "Rückerstattung" },
  { value: "ignore", label: "Ignorieren" }
];

export function readCashflowOverrides() {
  try {
    const stored = JSON.parse(localStorage.getItem(CASHFLOW_OVERRIDES_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

export function writeCashflowOverrides(overrides) {
  try {
    localStorage.setItem(CASHFLOW_OVERRIDES_KEY, JSON.stringify(overrides || {}));
  } catch {
    // Local corrections are a convenience feature; the app should keep running without storage.
  }
}

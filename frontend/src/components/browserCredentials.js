const STORAGE_KEY = "bitpanda-dashboard-browser-credentials";

function validCredential(value) {
  return typeof value === "string" && value.length <= 512 && !/[\r\n]/.test(value);
}

export function readBrowserCredentials() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      bitpanda: validCredential(stored.bitpanda) ? stored.bitpanda : "",
      finnhub: validCredential(stored.finnhub) ? stored.finnhub : "",
      fusion: validCredential(stored.fusion) ? stored.fusion : ""
    };
  } catch {
    return { bitpanda: "", finnhub: "", fusion: "" };
  }
}

export function updateBrowserCredentials(values) {
  const current = readBrowserCredentials();
  const next = { ...current };
  for (const key of ["bitpanda", "finnhub", "fusion"]) {
    if (values[key] !== undefined && validCredential(values[key])) next[key] = values[key];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The backend still keeps the credentials for the current container run.
  }
}

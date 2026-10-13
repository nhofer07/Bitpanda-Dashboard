// Fusion requests use numeric amounts and case-sensitive enums, unlike its responses.
// Contract: https://docs.fusion.bitpanda.com/create-order-4204526e0
export function buildFusionOrder(input = {}) {
  if (input.confirmation !== "FUSION HANDELN") throw new Error("Bitte die Fusion-Handelsbestätigung exakt eingeben.");
  const pair = String(input.pair || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}-[A-Z0-9]{1,10}$/.test(pair)) throw new Error("Ungültiges Fusion-Handelspaar.");
  const side = { buy: "Buy", sell: "Sell" }[String(input.side || "").toLowerCase()];
  const type = { market: "Market", limit: "Limit" }[String(input.type || "").toLowerCase()];
  if (!side || !type) throw new Error("Ungültige Order-Art.");
  const present = value => value !== undefined && value !== null && value !== "";
  if (present(input.amount) === present(input.quantity)) throw new Error("Bitte genau einen Betrag oder eine Menge angeben.");
  const decimal = (value, label) => {
    const raw = String(value ?? "").trim();
    const result = Number(raw);
    if (!/^\d+(?:\.\d{1,18})?$/.test(raw) || !Number.isFinite(result) || result <= 0) {
      throw new Error(`${label} muss eine positive Zahl sein.`);
    }
    return result;
  };
  const field = present(input.amount) ? "amount" : "quantity";
  const body = { pair, side, type, [field]: decimal(input[field], field === "amount" ? "Betrag" : "Menge") };
  if (type === "Limit") body.limitPrice = decimal(input.limitPrice, "Limitpreis");
  return body;
}

export function fusionErrorMessage(payload, status) {
  const messages = Array.isArray(payload?.errors) ? payload.errors.map(error => {
    const title = error?.title || error?.message || error?.code;
    return typeof title === "string" ? `${error.field ? `${error.field}: ` : ""}${title}` : "";
  }).filter(Boolean) : [];
  const fallback = [payload?.message, payload?.error, payload?.error?.message].find(value => typeof value === "string" && value);
  return `Bitpanda Fusion: ${messages.join("; ") || fallback || `HTTP ${status}`}`;
}

export async function requestFusion(endpoint, { apiKey, method = "GET", params = {}, body, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("Bitte zuerst den Fusion API-Key in den Einstellungen hinterlegen.");
    error.status = 401;
    throw error;
  }
  const url = new URL(`https://api.fusion.bitpanda.com/v1${endpoint}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const response = await fetchImpl(url, {
    method,
    headers: { "X-Api-Key": apiKey, "X-Client-Origin": "bitpanda-dashboard", Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
  if (!response.ok) {
    const error = new Error(fusionErrorMessage(payload, response.status));
    error.status = response.status;
    throw error;
  }
  return payload;
}

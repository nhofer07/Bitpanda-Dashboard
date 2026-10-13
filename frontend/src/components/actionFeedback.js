let notices = [];
let sequence = 0;
const listeners = new Set();
const publish = () => listeners.forEach(listener => listener());
export const feedbackSnapshot = () => notices;
export const subscribeFeedback = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function notify(message, kind = "success", id) {
  const key = id ?? ++sequence;
  notices = [...notices.filter(item => item.id !== key), { id: key, message, kind }].slice(-5);
  publish();
  return key;
}
export function dismissFeedback(id) { notices = notices.filter(item => item.id !== id); publish(); }

export function tradeFeedback(result, { fusion = false, side, asset }) {
  const data = result?.data || result;
  const id = fusion ? data?.id : data?.trade_id;
  if (!id) throw new Error("Keine Bestätigung mit Handels-ID erhalten. Prüfe den Transaktionsverlauf, bevor du es erneut versuchst.");
  const action = String(side).toLowerCase() === "buy" ? "Kauf" : "Verkauf";
  const status = String(data.status || "").toLowerCase();
  const suffix = `${asset} · ${fusion ? "Order-ID" : "Trade-ID"}: ${id}`;
  if (["rejected", "failed", "canceled", "cancelled"].includes(status)) return { kind: "error", message: `${action} ${status === "canceled" || status === "cancelled" ? "storniert" : "abgelehnt"}: ${suffix}.` };
  if (["filled", "executed", "completed", "finished"].includes(status)) return { kind: "success", message: `${action} ausgeführt: ${suffix}.` };
  if (["partially-filled", "partially_filled", "filled-and-canceled"].includes(status)) return { kind: "warning", message: `${action} teilweise ausgeführt: ${suffix}. Den verbleibenden Orderstatus findest du im Verlauf.` };
  return { kind: "success", message: fusion ? `${action === "Kauf" ? "Kauforder" : "Verkaufsorder"} angenommen: ${suffix}. Die Ausführung ist noch nicht bestätigt. Den aktuellen Status findest du im Orderverlauf.` : `${action} bestätigt: ${suffix}${status ? ` · Status: ${data.status}` : ""}.` };
}

// Refresh failures must never turn an accepted transaction into a failed trade.
export async function performAction({ pending, execute, success, refresh, failure = "Aktion fehlgeschlagen", uncertain = false }) {
  const id = notify(pending, "pending");
  let result;
  let confirmed = true;
  try {
    result = await execute();
    const feedback = typeof success === "function" ? success(result) : { kind: "success", message: success };
    confirmed = feedback.kind !== "error";
    notify(feedback.message, feedback.kind, id);
  } catch (error) {
    const message = `${failure}: ${error.message || "Unbekannter Fehler"}${uncertain ? " Prüfe bei einer fehlenden Bestätigung den Transaktionsverlauf, bevor du die Aktion erneut sendest." : ""}`;
    notify(message, "error", id);
    return { ok: false, error, message };
  }
  if (refresh && confirmed) {
    try { await refresh(result); }
    catch { notify("Die Aktion wurde bestätigt, aber die Ansicht konnte nicht aktualisiert werden. Bitte lade die Daten neu.", "warning"); }
  }
  return { ok: confirmed, result };
}

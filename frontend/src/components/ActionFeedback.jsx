import { useEffect, useSyncExternalStore } from "react";
import { dismissFeedback, feedbackSnapshot, notify, subscribeFeedback } from "./actionFeedback.js";

export default function ActionFeedback() {
  const notices = useSyncExternalStore(subscribeFeedback, feedbackSnapshot);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("dashboard-settings-saved")) {
        sessionStorage.removeItem("dashboard-settings-saved");
        notify("Einstellungen gespeichert. Die Verbindungen werden mit den neuen Einstellungen geladen.");
      }
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, []);
  return <aside className="action-feedback" aria-label="Rückmeldungen zu deinen Aktionen">
    {notices.map(item => <div key={item.id} className={`action-notice ${item.kind}`} role={item.kind === "error" ? "alert" : "status"} aria-atomic="true">
      <span className="action-notice-icon" aria-hidden="true">{item.kind === "pending" ? "◌" : item.kind === "success" ? "✓" : "!"}</span>
      <div><strong>{item.kind === "pending" ? "In Bearbeitung" : item.kind === "success" ? "Bestätigt" : item.kind === "warning" ? "Hinweis" : "Bitte prüfen"}</strong><p>{item.message}</p></div>
      {item.kind !== "pending" && <button type="button" onClick={() => dismissFeedback(item.id)} aria-label="Rückmeldung schließen">×</button>}
    </div>)}
  </aside>;
}

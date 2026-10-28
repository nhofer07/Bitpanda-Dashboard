import PageIntro from "./PageIntro.jsx";
import { useEffect, useState } from "react";
import { updateBrowserCredentials } from "./browserCredentials.js";

import { notify } from "./actionFeedback.js";

export default function SettingsView({ onSaved }) {
  const [status, setStatus] = useState(null);
  const [bitpanda, setBitpanda] = useState("");
  const [finnhub, setFinnhub] = useState("");
  const [fusion, setFusion] = useState("");
  const [removeBitpanda, setRemoveBitpanda] = useState(false);
  const [removeFinnhub, setRemoveFinnhub] = useState(false);
  const [removeFusion, setRemoveFusion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/settings").then(async response => {
      if (response.status === 404) throw new Error("Die installierte Dashboard-Version ist veraltet. Bitte das Dashboard vollständig beenden und über die Starter-Datei neu starten.");
      if (!response.ok) throw new Error("Einstellungen konnten nicht geladen werden. Bitte das Dashboard neu starten.");
      setStatus(await response.json());
    }).catch(err => setError(err.message));
  }, []);
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const feedbackId = notify("Einstellungen werden gespeichert …", "pending");
    try {
      const values = {};
      if (removeBitpanda || bitpanda.trim()) values.bitpanda = removeBitpanda ? "" : bitpanda.trim();
      if (removeFinnhub || finnhub.trim()) values.finnhub = removeFinnhub ? "" : finnhub.trim();
      if (removeFusion || fusion.trim()) values.fusion = removeFusion ? "" : fusion.trim();
      let response;
      let data;
      for (let attempt = 0; attempt < 60; attempt++) {
        response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
        data = await response.json();
        if (response.status !== 409) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!response.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      if (data.credentialsStorage === "memory") updateBrowserCredentials(values);
      setBitpanda(""); setFinnhub(""); setFusion("");
      notify("Einstellungen gespeichert. Die Verbindungen werden neu geladen.", "success", feedbackId);
      try { sessionStorage.setItem("dashboard-settings-saved", "1"); } catch {}
      onSaved();
    } catch (err) { setError(err.message); notify(`Einstellungen konnten nicht gespeichert werden: ${err.message}`, "error", feedbackId); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    const feedbackId = notify("Du wirst abgemeldet …", "pending");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
      window.location.reload();
    } catch (err) { notify(err.message, "error", feedbackId); setBusy(false); }
  }
  return <div className="settings-view">
    <PageIntro><div><p>Hier steuerst du, welche externen Daten dein persönliches Dashboard verwenden darf.</p></div><div className="hero-status"><span>Bitpanda API</span><strong className={status?.bitpandaConfigured ? "positive" : "muted"}>{status?.bitpandaConfigured ? "Verbunden" : "Einrichtung offen"}</strong></div></PageIntro>
    <form className="settings-form" onSubmit={save}>
      <div className="settings-connections">
      <section className="table-card settings-key-card">
        <div className="settings-key-heading"><div className="settings-service-icon bitpanda" aria-hidden="true">B</div><div><h3>Bitpanda</h3><p>Portfolio, Transaktionen und – nach Bestätigung – Trading.</p></div><span className={`settings-status ${status?.bitpandaConfigured ? "connected" : "disconnected"}`}>{status?.bitpandaConfigured ? "Verbunden" : "Nicht verbunden"}</span></div>
        <label className="settings-field" htmlFor="bitpanda-key"><span>API-Key</span><input id="bitpanda-key" type="password" autoComplete="new-password" spellCheck={false} value={bitpanda} disabled={busy || removeBitpanda} onChange={e => setBitpanda(e.target.value)} placeholder={status?.bitpandaConfigured ? "Neuen Key eingeben oder aktuellen behalten" : "Bitpanda API-Key eingeben"} /></label>
        {status?.bitpandaConfigured && <label className="settings-remove"><input type="checkbox" checked={removeBitpanda} onChange={e => setRemoveBitpanda(e.target.checked)} /><span><strong>Verbindung entfernen</strong><small>Der hinterlegte Bitpanda-Key wird beim Speichern gelöscht.</small></span></label>}
      </section>
      <section className="table-card settings-key-card">
        <div className="settings-key-heading"><div className="settings-service-icon fusion" aria-hidden="true">F</div><div><h3>Bitpanda Fusion</h3><p>Aggregierte Kryptomärkte, günstigere Gebühren und Orderverwaltung.</p></div><span className={`settings-status ${status?.fusionConfigured ? "connected" : "optional"}`}>{status?.fusionConfigured ? "Verbunden" : "Optional"}</span></div>
        <label className="settings-field" htmlFor="fusion-key"><span>Fusion API-Key</span><input id="fusion-key" type="password" autoComplete="new-password" spellCheck={false} value={fusion} disabled={busy || removeFusion} onChange={e => setFusion(e.target.value)} placeholder={status?.fusionConfigured ? "Neuen Key eingeben oder aktuellen behalten" : "Fusion API-Key eingeben"} /></label>
        {status?.fusionConfigured && <label className="settings-remove"><input type="checkbox" checked={removeFusion} onChange={e => setRemoveFusion(e.target.checked)} /><span><strong>Verbindung entfernen</strong><small>Fusion-Handel und Marktdaten werden deaktiviert.</small></span></label>}
      </section>
      <section className="table-card settings-key-card">
        <div className="settings-key-heading"><div className="settings-service-icon finnhub" aria-hidden="true">F</div><div><h3>Finnhub</h3><p>Optionaler Analystenkonsens für unterstützte Aktien.</p></div><span className={`settings-status ${status?.finnhubConfigured ? "connected" : "optional"}`}>{status?.finnhubConfigured ? "Verbunden" : "Optional"}</span></div>
        <label className="settings-field" htmlFor="finnhub-key"><span>API-Key</span><input id="finnhub-key" type="password" autoComplete="new-password" spellCheck={false} value={finnhub} disabled={busy || removeFinnhub} onChange={e => setFinnhub(e.target.value)} placeholder={status?.finnhubConfigured ? "Neuen Key eingeben oder aktuellen behalten" : "Finnhub API-Key eingeben"} /></label>
        {status?.finnhubConfigured && <label className="settings-remove"><input type="checkbox" checked={removeFinnhub} onChange={e => setRemoveFinnhub(e.target.checked)} /><span><strong>Verbindung entfernen</strong><small>Die restliche Marktanalyse bleibt verfügbar.</small></span></label>}
      </section>
      </div>
      <section className="settings-privacy"><span className="settings-lock" aria-hidden="true">⌁</span><div><strong>So werden deine Keys geschützt</strong>{status?.credentialsStorage === "memory" ? <p>Die Synology hält Keys nur im Arbeitsspeicher. Dieser Browser speichert sie lokal und aktiviert sie nach einem Neustart automatisch. Auf einem neuen Gerät gibst du sie einmalig ein.</p> : <p>Keys liegen außerhalb des Dashboard-Ordners im persönlichen Benutzerverzeichnis und werden niemals an den Browser zurückgegeben.</p>}</div></section>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="settings-actions"><button className="primary-button" type="submit" disabled={busy || !status}>{busy ? "Speichert …" : "Änderungen speichern"}</button>{status?.authRequired && <button type="button" className="settings-logout" onClick={logout}>Abmelden</button>}</div>
    </form>
  </div>;
}

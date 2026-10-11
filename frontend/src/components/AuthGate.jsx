import { useEffect, useState } from "react";

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/status").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Anmeldung konnte nicht geladen werden.");
      setStatus(data);
    }).catch(err => setError(err.message));
  }, []);

  if (status && (!status.required || status.authenticated)) return children;

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const endpoint = status?.configured ? "/api/auth/login" : "/api/auth/setup";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Anmeldung fehlgeschlagen.");
      setPassword("");
      setStatus(current => ({ ...current, configured: true, authenticated: true, username: data.username }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-shell">
      <section className="auth-intro">
        <div className="auth-mark" aria-hidden="true"><span /></div>
        <div><div className="eyebrow">Bitpanda Dashboard</div><h1>Dein Portfolio.<br />Klar im Blick.</h1></div>
        <p>Eine private Übersicht für Portfolio, Cashflow und Marktbewegungen – direkt auf deiner Synology.</p>
        <div className="auth-security"><span aria-hidden="true">✓</span><div><strong>Persönlich geschützt</strong><small>Deine Anmeldung bleibt getrennt von deinem Bitpanda-Zugang.</small></div></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-heading"><div className="eyebrow">Sicherer Zugang</div><h2>{status?.configured ? "Willkommen zurück" : "Konto einrichten"}</h2><p>{status?.configured ? "Melde dich bei deiner persönlichen Dashboard-Instanz an." : "Lege die Zugangsdaten für deine persönliche Dashboard-Instanz fest."}</p></div>
        <form onSubmit={submit}>
          <label htmlFor="dashboard-username"><span>Benutzername</span><input id="dashboard-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" minLength="2" maxLength="64" placeholder="Dein Benutzername" autoFocus required /></label>
          <label htmlFor="dashboard-password"><span>Passwort</span><input id="dashboard-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={status?.configured ? "current-password" : "new-password"} minLength="12" maxLength="256" placeholder="••••••••••••" required /></label>
          {!status?.configured && <small className="auth-hint">Mindestens 12 Zeichen. Auf der Synology wird nur ein gesalzener Passwort-Hash gespeichert.</small>}
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !status}>{busy ? "Bitte warten …" : status?.configured ? "Dashboard öffnen" : "Konto erstellen"}<span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>
  </main>;
}

import { ANALYSIS_HORIZONS, DEFAULT_ANALYSIS_HORIZON, horizonGuidance, ANALYSIS_OUTPUT_FORMAT } from '../../../backend/analysis-horizons.js';
import { lazy, Suspense, useEffect, useState } from 'react';
const ReactMarkdown = lazy(() => import('react-markdown'));
async function request(path, body) {
  const response = await fetch(`/api/chatgpt/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ChatGPT konnte nicht erreicht werden.');
  return data;
}
export function ChatGPTSettings() {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { let active = true; const load = () => request('status').then(s => { if (active) setStatus(s); }).catch(e => { if (active) setError(e.message); }); load(); const timer = setInterval(load, 3000); return () => { active = false; clearInterval(timer); }; }, []);
  async function action(type, body = {}) {
    setBusy(true); setError('');
    const popup = type === 'connect' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    try {
      const result = await request(type, body);
      if (result.url) { if (!popup) { await request('cancel', {}); throw new Error('Bitte Pop-ups für das Dashboard erlauben und erneut verbinden.'); } popup.location = result.url; }
      if (result.revoked === false) setError('Lokal getrennt. Die Freigabe konnte bei OpenAI nicht widerrufen werden. Bitte zusätzlich in ChatGPT → Einstellungen → Verbindungen trennen.');
      setStatus(await request('status'));
    } catch (e) { popup?.close(); setError(e.message); } finally { setBusy(false); }
  }
  const remote = !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  return <section className="table-card settings-key-card chatgpt-card">
    <div className="section-heading"><h3>ChatGPT · KI-Analyse</h3><span className={`settings-status ${status?.eligible ? 'connected' : 'optional'}`}>{status?.eligible ? 'Abo verbunden' : status?.connected ? 'Abo nicht freigegeben' : 'Nicht verbunden'}</span></div>
    <p>Nutze dein berechtigtes Plus- oder Pro-Konto. Analysen zählen zu deinem bestehenden Kontingent. Es gibt keinen API-Key und keinen kostenpflichtigen Ersatz.</p>
    <p>Die Anmeldung allein garantiert keine Freigabe. Verfügbare Modelle und Berechtigungen werden nach dem Verbinden geprüft.</p>
    <label className="settings-remove"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Ich habe zusätzliche Credit-Nutzung für diese Verbindung in ChatGPT deaktiviert bzw. erlaube sie nicht. Das Dashboard kann diese OpenAI-Einstellung nicht selbst ändern.</span></label>
    <p><a href="https://chatgpt.com/#settings" target="_blank" rel="noreferrer">Nutzung und Freigaben in ChatGPT verwalten ↗</a></p>
    {remote && <details><summary>Synology: sicheren Anmeldetunnel einrichten</summary><p>Vor dem Verbinden auf deinem Mac ein Terminal öffnen und den Tunnel starten. Er wird nur während der Anmeldung benötigt:</p><code>{`ssh -N -L ${status?.callbackPort || 1455}:127.0.0.1:${status?.callbackPort || 1455} DEIN_BENUTZER@DEINE_SYNOLOGY`}</code><p>Die Synology muss den Callback-Port gemäß der Anleitung in docs/chatgpt.md bereitstellen. Bei mehreren Installationen unterschiedliche Ports konfigurieren. Zugangsdaten bleiben auf der Synology.</p></details>}
    {status?.accounts?.length > 0 && <label className="settings-field"><span>Aktives Konto</span><select disabled={busy || status.pending} value={status.accounts.find(a => a.active)?.id || ''} onChange={e => action('select', { account: e.target.value })}><option value="" disabled>Konto auswählen</option>{status.accounts.map(a => <option key={a.id} value={a.id}>{a.email} · {a.id.slice(-8)}{a.connected ? '' : ' · getrennt'}</option>)}</select></label>}
    {status?.email && <p>{status.email}</p>}
    <div className="settings-actions"><button className="primary-button" disabled={busy || !status || !confirmed || status.pending} onClick={() => action('connect', { account: status?.accounts?.find(a => a.active)?.id })}>Continue with ChatGPT</button><button className="secondary-button" disabled={busy || !status || !confirmed || status.pending} onClick={() => action('connect')}>Anderes Konto hinzufügen</button>{status?.pending && <button className="secondary-button" disabled={busy} onClick={() => action('cancel')}>Anmeldung abbrechen</button>}{status?.connected && <button className="secondary-button" disabled={busy} onClick={() => action('disconnect')}>Verbindung trennen</button>}</div>
    {status?.pending && <p role="status">Anmeldung im geöffneten Fenster abschließen …</p>}
    {(error || status?.error) && <p className="error-box" role="alert">{error || status.error}</p>}
    <p className="source-note">Tokens werden geschützt auf dieser Installation gespeichert, niemals im Browser. Andere Nutzer verbinden ihr eigenes Konto. Für gehostete Anwendungen kann eine gesonderte OpenAI-Freigabe nötig sein.</p>
  </section>;
}
export function AIAnalysis({ asset }) {
  const [models, setModels] = useState([]), [model, setModel] = useState(''), [effort, setEffort] = useState('default'), [horizon, setHorizon] = useState(DEFAULT_ANALYSIS_HORIZON), [risk, setRisk] = useState('Mittel'), [question, setQuestion] = useState(''), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [eligible, setEligible] = useState(false);
  useEffect(() => { let active = true; request('status').then(async s => { if (!active) return; setEligible(Boolean(s.eligible)); if (s.eligible) { const data = await request('models'); if (active) { setModels(data.models || []); setModel(data.models?.[0]?.id || ''); } } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function analyze() {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await request('analysis', { symbol: asset.symbol, name: asset.name || asset.symbol, category: asset.category || 'other', model, reasoningEffort: effort, horizon, risk, question })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    const text = `Analysiere ${asset.name || asset.symbol} (${asset.symbol}, ${asset.category || 'Asset'}) auf Deutsch. Trade- / Anlagehorizont: ${horizon}; Risikoneigung: ${risk}. Prüfe aktuelle öffentliche Quellen mit Datum, Chancen, Risiken, Fundamentaldaten und fehlende Informationen. Gib eine bedingte Einschätzung zum Kauf, keine Garantie. ${horizonGuidance(horizon)} ${question}\n${ANALYSIS_OUTPUT_FORMAT}`;
    try { await navigator.clipboard.writeText(text); setError('Anfrage kopiert. In ChatGPT einfügen.'); } catch { setResult({ text, updatedAt: new Date().toISOString(), model: 'Anfrage zum manuellen Kopieren' }); }
  }
  return <section className="table-card ai-analysis"><div className="section-heading"><h3>KI-Analyse · {asset.name || asset.symbol}</h3><span>ChatGPT</span></div>
    <p>Ein kurzes Fazit mit den wichtigsten Punkten zu Chance, Risiko, Einstieg und Ausstieg. Bestände und Transaktionen werden nicht übertragen.</p>
    <div className="ai-controls"><label>Trade- / Anlagehorizont<select disabled={busy} value={horizon} onChange={e => { setHorizon(e.target.value); setResult(null); }}>{ANALYSIS_HORIZONS.map(v => <option key={v}>{v}</option>)}</select></label><label>Risikoneigung<select disabled={busy} value={risk} onChange={e => { setRisk(e.target.value); setResult(null); }}>{['Niedrig', 'Mittel', 'Hoch'].map(v => <option key={v}>{v}</option>)}</select></label>{eligible && <label>Modell<select disabled={busy} value={model} onChange={e => { setModel(e.target.value); setEffort('default'); setResult(null); }}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}{eligible && <label>Denkstufe<select disabled={busy} value={effort} onChange={e => { setEffort(e.target.value); setResult(null); }}><option value="default">Modellstandard{models.find(m => m.id === model)?.defaultReasoningEffort ? ` (${models.find(m => m.id === model).defaultReasoningEffort})` : ''}</option>{(models.find(m => m.id === model)?.reasoningEfforts || []).map(level => <option key={level} value={level}>{level}</option>)}</select></label>}</div>
    {eligible && <p className="source-note">Höhere Denkstufen können länger dauern und mehr von deinem Abo-Kontingent verbrauchen. Die Auswahl richtet sich nach den Modellangaben von OpenAI.</p>}
    <label className="settings-field"><span>Deine Frage (optional, keine privaten Finanzdaten eingeben)</span><textarea maxLength={2000} disabled={busy} value={question} onChange={e => { setQuestion(e.target.value); setResult(null); }} placeholder="Was spricht für einen Einstieg in den nächsten Wochen?" /></label>
    <div className="settings-actions"><button className="primary-button" disabled={busy || !eligible || !model} onClick={analyze}>{busy ? 'Analysiert …' : 'Mit ChatGPT analysieren'}</button><button className="secondary-button" disabled={busy} onClick={copy}>Analyse für ChatGPT kopieren</button></div>
    {!eligible && <p>Für die direkte Analyse zuerst in den Einstellungen ChatGPT verbinden und die Abo-Nutzung freigeben. Free-Nutzer können die Anfrage kopieren.</p>}
    {error && <p role="status">{error}</p>}
    {result && <div className="ai-result"><p className="source-note">{result.model}{result.reasoningEffort ? ` · Denkstufe: ${result.reasoningEffort === 'default' ? 'Modellstandard' : result.reasoningEffort}` : ''} · {new Date(result.updatedAt).toLocaleString('de-AT')}</p><div><Suspense fallback={<p>Analyse wird angezeigt …</p>}><ReactMarkdown skipHtml components={{ a: ({ children, href }) => /^https?:\/\//.test(href || "") ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: () => null }}>{result.text}</ReactMarkdown></Suspense></div></div>}
    <p className="source-note">KI-Einschätzungen können Fehler enthalten und führen keine Käufe aus. Bei Nutzungslimits pausiert die Analyse; kein Wechsel auf eine kostenpflichtige API. Zusätzliche Credits verwaltest du in ChatGPT.</p>
  </section>;
}

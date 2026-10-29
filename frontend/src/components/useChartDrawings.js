import { useEffect, useRef, useState } from 'react';
export function useChartDrawings(pair) {
  const [document, setDocument] = useState({ revision: 0, drawings: [] });
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
  const reads = useRef(0);
  const alive = useRef(true), lock = useRef(false), current = useRef(document);
  const url = `/api/chart-drawings/${encodeURIComponent(pair)}`, key = `fusion-drawings-draft:${pair}`;
  function show(value) { current.current = value; setDocument(value); }
  async function load() {
    const version = ++reads.current; setReady(false); setError('');
    try {
      const response = await fetch(url); const server = await response.json();
      if (!response.ok || !Array.isArray(server.drawings) || !Number.isSafeInteger(server.revision)) throw new Error(server.error || 'Zeichnungen konnten nicht geladen werden.');
      if (!alive.current || version !== reads.current) return;
      let draft; try { draft = JSON.parse(localStorage.getItem(key)); } catch {}
      if (draft && Array.isArray(draft.drawings) && JSON.stringify(draft.drawings) !== JSON.stringify(server.drawings)) {
        show({ ...draft, revision: draft.revision }); setDirty(true);
        if (draft.revision !== server.revision) setError('Konflikt mit einem anderen Gerät. Dein lokaler Entwurf bleibt erhalten. Exportiere ihn vor dem Laden des Serverstands.');
        else setError('Ein noch nicht gesicherter Entwurf wurde wiederhergestellt. Bitte erneut speichern.');
      } else { show(server); setDirty(false); try { localStorage.removeItem(key); } catch {} }
      setReady(true);
    } catch (e) { if (alive.current && version === reads.current) setError(e.message); }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; reads.current++; }; }, [pair]);
  async function save(drawings = current.current.drawings) {
    if (lock.current || !ready) return;
    const next = { revision: current.current.revision, drawings };
    if (new TextEncoder().encode(JSON.stringify(next)).length > 45000) { setError('Zu viele Zeichnungen oder Texte. Bitte einzelne Einträge entfernen.'); return; }
    lock.current = true; show(next); setSaving(true); setDirty(true); setError('');
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    try {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next), keepalive: true });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Speichern fehlgeschlagen. Dein Entwurf bleibt lokal erhalten.');
      try { localStorage.removeItem(key); } catch {}
      if (alive.current) { show(result); setDirty(false); }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  }
  async function discardDraft() {
    if (dirty && !window.confirm('Lokalen Entwurf verwerfen und den gespeicherten Serverstand laden?')) return;
    try { localStorage.removeItem(key); } catch {} await load();
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }), href = URL.createObjectURL(blob);
    const a = window.document.createElement('a'); a.href = href; a.download = `Zeichnungen-${pair}.json`; a.click(); URL.revokeObjectURL(href);
  }
  return { drawings: document.drawings, ready, saving, error, dirty, save, discardDraft, exportDraft };
}

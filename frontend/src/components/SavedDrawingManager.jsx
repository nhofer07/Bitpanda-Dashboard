import { useChartDrawings } from './useChartDrawings.js';
import { formatPriceNumber, formatDateTime } from './formatters.js';
const labels = { line: 'Trendlinie', horizontal: 'Kursmarke', rectangle: 'Rechteck', text: 'Text', fibonacci: 'Fibonacci' };
export default function SavedDrawingManager({ pair }) {
  const currency = pair.split("-").at(-1) || "EUR";
  const state = useChartDrawings(pair);
  return <section className="saved-drawing-manager" aria-label={`Gespeicherte Markierungen für ${pair}`}>
    <p>Diese Markierungen stammen aus dem bisherigen separaten Zeichenchart. Sie lassen sich nicht in das TradingView-Widget übertragen.</p>
    <p className="source-note" role="status">{state.saving ? 'Änderung wird gespeichert …' : state.dirty ? 'Änderung noch nicht auf dem Server gespeichert.' : state.ready ? `${state.drawings.length} Markierungen auf dem Server gespeichert · ${pair}` : 'Markierungen werden geladen …'}</p>
    {state.error && <div className="error-box" role="alert">{state.error}<div className="settings-actions"><button className="secondary-button" disabled={!state.ready || state.saving} onClick={() => state.save()}>Erneut speichern</button><button className="secondary-button" disabled={state.saving} onClick={state.discardDraft}>Serverstand laden</button></div></div>}
    {state.drawings.length > 0 && <><ul>{state.drawings.map((drawing, index) => <li key={drawing.id}><span><strong>{labels[drawing.type] || 'Markierung'} {index + 1}{drawing.text ? ` · ${drawing.text}` : ''}</strong><small>{drawing.points?.map(p => `${formatPriceNumber(p.price)} ${currency} · ${formatDateTime(new Date(p.time * 1000).toISOString())}`).join(' → ')}</small></span><button type="button" className="secondary-button" disabled={!state.ready || state.saving} onClick={() => state.save(state.drawings.filter(item => item.id !== drawing.id))}>Löschen</button></li>)}</ul><button className="secondary-button" type="button" disabled={!state.ready || state.saving} onClick={state.exportDraft}>Markierungen exportieren</button></>}
    {state.ready && !state.drawings.length && <p>Keine Markierungen für dieses Handelspaar.</p>}
  </section>;
}

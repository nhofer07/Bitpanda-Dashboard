export const command = '/usr/bin/python3 "$HOME/Library/Application Support/Übersicht/widgets/bitpanda/lib/portfolio.py"';
export const refreshFrequency = 60000;
export const initialState = { data: null };
export const updateState = (event, previous) => {
  if (event.error) return { ...previous, error: 'Aktualisierung fehlgeschlagen' };
  try { return { data: JSON.parse(event.output), error: null }; }
  catch (_) { return { ...previous, error: 'Daten nicht verfügbar' }; }
};

export const className = `
  top: 45px; left: 30px; width: 170px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: #f4f8f6;
  .card { box-sizing: border-box; height: 170px; padding: 13px; border-radius: 22px; background: rgba(13, 29, 25, .94); border: 1px solid rgba(255,255,255,.13); box-shadow: 0 8px 24px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: center; height: 12px; flex-shrink: 0; }
  .brand { color: #7ff2bc; font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .badge { color: #a1b9ae; font-size: 8px; }
  h1 { font-size: 23px; line-height: 27px; font-weight: 650; letter-spacing: -.8px; margin: 9px 0 1px; white-space: nowrap; }
  .label { font-size: 9px; color: #a1b9ae; }
  .change { margin-top: 5px; font-size: 10px; line-height: 12px; font-weight: 600; white-space: nowrap; }
  .positive { color: #70eeb1; } .negative { color: #ff9292; }
  svg { display: block; width: 100%; min-height: 0; flex: 1; margin: 8px 0 4px; overflow: visible; }
  footer { display: flex; justify-content: space-between; font-size: 8px; line-height: 10px; color: #a1b9ae; flex-shrink: 0; gap: 4px; }
  .empty { flex: 1; display: flex; align-items: center; color: #a1b9ae; font-size: 9px; line-height: 1.4; }
  .notice { color: #eacb91; }
`;
const money = v => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(v);
const time = stamp => new Date(stamp).toLocaleTimeString('de-AT', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Vienna' });
export const render = ({ data, error }) => {
  const d = data || {};
  const points = d.points || [];
  const values = points.map(p => p[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * .001, 1);
  const start = points[0] && points[0][0];
  const duration = points.length > 1 ? points[points.length - 1][0] - start : 1;
  const coords = points.map(p => [(p[0] - start) / duration * 306, 96 - (p[1] - min) / range * 82]);
  const line = coords.map(p => p.join(',')).join(' ');
  const positive = d.change == null || d.change >= 0;
  const color = positive ? '#70eeb1' : '#ff9292';
  const last = coords[coords.length - 1];
  const changeText = d.change == null ? 'Heute · Aufzeichnung beginnt' : `${d.change >= 0 ? '+' : ''}${money(d.change)}${d.percent == null ? '' : ` (${d.percent >= 0 ? '+' : ''}${d.percent.toLocaleString('de-AT', { maximumFractionDigits:2 })} %)`}`;
  const notice = error || d.notice || (d.preview ? 'Gespeicherter Portfoliostand' : '');
  return <div className="card" title={notice || 'Portfoliowert inklusive Guthaben · cashflow-bereinigter Tagesverlauf'}>
    <header><span className="brand">BITPANDA</span><span className="badge">{d.offline ? 'Offline' : d.preview ? 'Vorschau' : d.source || 'Lädt …'}</span></header>
    <h1>{Number.isFinite(d.value) ? money(d.value) : '—'}</h1>
    <div className="label">Portfolio inkl. Guthaben</div>
    <div className={`change ${positive ? 'positive' : 'negative'}`}>{points.length ? changeText : 'Heute · keine Daten'}</div>
    {points.length > 1 ? <svg preserveAspectRatio="none" viewBox="0 0 306 110" role="img" aria-label="Heutiger cashflow-bereinigter Portfolioverlauf">
      <defs><linearGradient id="bitpanda-widget-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".24"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {[20,58,96].map(y => <line key={y} x1="0" x2="306" y1={y} y2={y} stroke="rgba(255,255,255,.08)"/>)}
      <polygon points={`0,110 ${line} 306,110`} fill="url(#bitpanda-widget-fill)"/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color}/>
    </svg> : <div className="empty">{data ? points.length ? 'Aufzeichnung beginnt …' : 'Keine heutigen Daten.' : 'Portfolio wird geladen …'}</div>}
    <footer title={notice || (!d.completeDay && points.length ? 'Verlauf seit Beginn der heutigen Aufzeichnung' : 'Heute · cashflow-bereinigt')}><span className={notice ? 'notice' : ''}>{notice ? d.offline ? 'Offline' : d.preview ? 'Vorschau' : 'Hinweis' : !d.completeDay && points.length ? `Ab ${time(points[0][0] * 1000)}` : 'Heute'}</span><span>{d.loadedAt ? new Date(d.loadedAt).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Vienna' }) : '—'}</span></footer>
  </div>;
};

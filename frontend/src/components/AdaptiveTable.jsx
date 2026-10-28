import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tableRecords } from './tableRecords.js';

// Keep readable tables where they fit. Wider records expose all fields vertically.
export default function AdaptiveTable({ children, className = '', ...props }) {
  const container = useRef(null);
  const measurement = useRef(null);
  const [records, setRecords] = useState(false);
  const model = useMemo(() => tableRecords(children), [children]);
  useLayoutEffect(() => {
    let active = true;
    function measure() {
      if (!active) return;
      const available = container.current?.clientWidth || 0;
      const table = measurement.current?.querySelector('table');
      if (available && table) setRecords(Math.max(table.scrollWidth, table.getBoundingClientRect().width) > available + 1);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(measurement.current);
    measure();
    document.fonts?.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [children]);
  const table = <table {...props} className={className}>{children}</table>;
  return <div className={`adaptive-table ${records ? 'is-records' : 'is-tabular'}`} ref={container}>
    <div className="adaptive-table-measure" ref={measurement} aria-hidden="true" inert="">{table}</div>
    {!records ? table : <div className="adaptive-records">
      {model.rows.map(row => {
        const identity = row.cells.find(cell => cell.index === model.identity) || row.cells[0];
        const value = row.cells.find(cell => cell.index === model.value && cell !== identity);
        const remaining = row.cells.filter(cell => cell !== identity && cell !== value);
        return <details className="adaptive-record" key={row.key}>
          <summary>
            <span className={`adaptive-record-identity ${identity?.className || ''}`}><small>{identity?.label}</small><span>{identity?.content}</span></span>
            {value && <span className={`adaptive-record-value ${value.className}`}><small>{value.label}</small><span>{value.content}</span></span>}
            <span className="adaptive-record-toggle"><span className="record-open-label">Details anzeigen</span><span className="record-close-label">Details schließen</span><span aria-hidden="true">⌄</span></span>
          </summary>
          <dl>{remaining.map(cell => <div key={cell.index}><dt>{cell.label}</dt><dd className={cell.className}>{cell.content}</dd></div>)}</dl>
          {row.onClick && <button className="secondary-button adaptive-row-action" onClick={row.onClick}>Positionen anzeigen</button>}
        </details>;
      })}
      {model.totals.length > 0 && <div className="adaptive-totals" aria-label="Tabellensummen">{model.totals.map(row => <dl key={row.key}>{row.cells.filter(cell => cell.content != null).map(cell => <div key={cell.index}>{cell.span === 1 && <dt>{cell.label}</dt>}<dd className={cell.className}>{cell.content}</dd></div>)}</dl>)}</div>}
    </div>}
  </div>;
}

export default function DataQuality({ kind = 'calculated', children }) {
  const labels = { reported: 'Bitpanda', calculated: 'Berechnet', estimated: 'Geschätzt', stale: 'Veraltet', unknown: 'Nicht verfügbar' };
  return <small className={`data-quality data-quality-${kind}`}>{children || labels[kind]}</small>;
}

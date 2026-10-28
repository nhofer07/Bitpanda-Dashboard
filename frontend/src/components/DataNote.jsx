export default function DataNote({ title = 'Datenbasis & Berechnung', children }) {
  return <details className="data-note"><summary>{title}</summary><div>{children}</div></details>;
}

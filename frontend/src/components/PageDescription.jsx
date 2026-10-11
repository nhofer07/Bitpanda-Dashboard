export default function PageDescription({ summary, children }) {
  return <div className="page-description">
    <p>{summary}</p>
    <details>
      <summary>Berechnung & Hinweise</summary>
      <p>{children}</p>
    </details>
  </div>;
}

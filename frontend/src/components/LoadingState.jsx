export default function LoadingState({ children = "Daten werden geladen …", compact = false }) {
  return <div className={`loading-state${compact ? " loading-state-compact" : ""}`} role="status" aria-live="polite">
    <svg className="loading-state-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 15" /></svg>
    <span className="loading-state-label">{children}</span>
  </div>;
}

import React from "react";

export default class DashboardErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Dashboard render error", error, info); }
  recover = () => {
    try { localStorage.removeItem("bitpanda-dashboard-active-view"); localStorage.removeItem("bitpanda-dashboard-selected-asset"); } catch { /* Storage can be unavailable. */ }
    window.location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="runtime-error-page"><section className="table-card runtime-error-card"><div className="eyebrow">Dashboard-Wiederherstellung</div><h2>Die Ansicht konnte nicht geladen werden</h2><p>Eine gespeicherte Seite oder unerwartete API-Antwort hat die Darstellung unterbrochen. Deine Portfolio- und Zugangsdaten bleiben unverändert.</p><button className="primary-button" onClick={this.recover}>Cockpit sicher neu laden</button><details><summary>Technisches Detail</summary><code>{String(this.state.error?.message || this.state.error)}</code></details></section></main>;
  }
}

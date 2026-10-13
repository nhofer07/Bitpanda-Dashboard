export default function Navigation({ activeView, setActiveView }) {
  const items = [
    { id: "home", label: "Cockpit", short: "Home" },
    { id: "assets", label: "Assets", short: "Assets" },
    { id: "profits", label: "Gewinne", short: "G/V" },
    { id: "calculator", label: "Rechner", short: "Ziel" },
    { id: "adjustments", label: "Sonderfälle", short: "Plus" },
    { id: "overview", label: "Zeiträume", short: "Zeit" },
    { id: "fiat", label: "Cashflow", short: "Cash" },
    { id: "calendar", label: "Kalender", short: "Kal" },
    { id: "account", label: "Kontodaten", short: "Konto" },
    { id: "fees", label: "Gebühren", short: "Geb." },
    { id: "tax", label: "Steuern", short: "Tax" }
    , { id: "market", label: "Marktanalyse", short: "Markt" },
    { id: "fusion", label: "Fusion", short: "Trade" }
  ];

  return (
    <nav className="main-nav" aria-label="Dashboard Bereiche">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveView(item.id)}
          className={activeView === item.id ? "active" : ""}
          aria-current={activeView === item.id ? "page" : undefined}
          title={item.label}
        >
          <span className="nav-short">{item.short}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </nav>
  );
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

export default function ProfitChart({ monthly = [] }) {
  const rows = [...monthly].sort((a, b) => a.period.localeCompare(b.period)).slice(-12);

  if (rows.length === 0) {
    return (
      <div style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "18px",
        padding: "18px",
        marginBottom: "28px"
      }}>
        <h3 style={{ marginTop: 0 }}>Gewinn/Verlust pro Monat</h3>
        <p style={{ color: "#94a3b8" }}>Keine Monatsdaten vorhanden.</p>
      </div>
    );
  }

  const maxAbs = Math.max(...rows.map(row => Math.abs(Number(row.realizedProfit || 0))), 1);

  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: "18px",
      padding: "18px",
      marginBottom: "28px"
    }}>
      <h3 style={{ marginTop: 0 }}>Gewinn/Verlust pro Monat</h3>

      <div style={{
        display: "flex",
        alignItems: "end",
        gap: "12px",
        height: "250px",
        borderBottom: "1px solid #334155",
        paddingTop: "20px"
      }}>
        {rows.map(row => {
          const value = Number(row.realizedProfit || 0);
          const height = Math.max(6, Math.abs(value) / maxAbs * 180);

          return (
            <div key={row.period} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "end",
              height: "100%"
            }}>
              <div style={{
                fontSize: "12px",
                color: value >= 0 ? "#22c55e" : "#ef4444",
                marginBottom: "6px",
                whiteSpace: "nowrap"
              }}>
                {formatCurrency(value)}
              </div>

              <div title={`${row.period}: ${formatCurrency(value)}`} style={{
                width: "100%",
                maxWidth: "42px",
                height: `${height}px`,
                borderRadius: "10px 10px 0 0",
                background: value >= 0 ? "#22c55e" : "#ef4444"
              }} />

              <div style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#94a3b8",
                writingMode: "vertical-rl",
                transform: "rotate(180deg)"
              }}>
                {row.period}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { saleProfit } from './saleProfit.js';
const money = value => value == null ? '–' : `${value.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export default function SaleProfitPreview({ quote, held, category }) {
  const result = saleProfit({ quote, held, category });
  return <section className="sale-profit-preview" aria-label="Nettogewinn beim Verkauf">
    <h4>Was bleibt dir nach dem Verkauf?</h4>
    <dl className="trade-cost-breakdown">
      <div><dt>Verkaufserlös vor Gebühren</dt><dd>{money(result.gross)}</dd></div>
      <div><dt>Tradinggebühr laut Quote</dt><dd>{money(result.fee)}</dd></div>
      <div><dt>Erlös nach Verkaufsgebühren</dt><dd>{money(result.proceeds)}</dd></div>
      <div><dt>Anteilig eingesetzte Kaufkosten inkl. Kaufgebühren</dt><dd>{money(result.acquisition)}</dd></div>
      <div><dt>Geschätzte KESt · 27,5 % auf steuerlichen Gewinn</dt><dd>{money(result.estimatedTax)}</dd></div>
      <div><dt>Voraussichtlicher Erlös nach Gebühren und KESt</dt><dd>{money(result.netProceeds)}</dd></div>
      <div className="unit-price-field"><dt>Dein voraussichtlicher Nettogewinn / Verlust</dt><dd className={result.netProfit == null ? 'muted' : result.netProfit >= 0 ? 'positive' : 'negative'}>{money(result.netProfit)}</dd></div>
    </dl>
    {result.netProfit == null && <p className="source-note">Für die vollständige Vorschau fehlen Kaufkosten, Steuerbasis oder Gebühren. Deshalb kann der Nettogewinn derzeit nicht zuverlässig berechnet werden.</p>}
    <p className="source-note">Schätzung für Privatvermögen in Österreich. Der Spread steckt bereits im Verkaufskurs. Die Kaufkosten werden nur für die verkaufte Menge angerechnet. Verlustausgleich, Altbestand und steuerliche ETF-Anpassungen sind nicht automatisch berücksichtigt. Maßgeblich ist die spätere Bitpanda-Abrechnung.</p>
    {quote.ex_ante?.costs_and_charges?.breakdown?.length > 0 && <details className="page-disclosure"><summary>Weitere Kostenangaben von Bitpanda</summary><dl className="trade-cost-breakdown">{quote.ex_ante.costs_and_charges.breakdown.map((row, index) => <div key={index}><dt>{row.type}</dt><dd>{money(Number(row.amount))}</dd></div>)}</dl><p className="source-note">Kosteninformation laut Quote; bereits im Kurs oder in der Tradinggebühr enthaltene Kosten werden nicht erneut abgezogen. Produktkosten können laufend im Fondskurs anfallen.</p></details>}
    <p className="source-note"><a href="https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/besteuerung-kapitalertraege-inland.html" target="_blank" rel="noreferrer">BMF: Kapitalerträge</a> · <a href="https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/steuerliche-behandlung-von-kryptowaehrungen.html" target="_blank" rel="noreferrer">BMF: Kryptowährungen</a></p>
  </section>;
}

export const ANALYSIS_HORIZONS = ['Wenige Tage', '1–2 Wochen', '2–4 Wochen', '1–3 Monate', '3–6 Monate', '1 Jahr', '3–5 Jahre', 'Über 5 Jahre'];
export const DEFAULT_ANALYSIS_HORIZON = '2–4 Wochen';
export function horizonGuidance(horizon) {
  if (ANALYSIS_HORIZONS.indexOf(horizon) >= 0 && ANALYSIS_HORIZONS.indexOf(horizon) < 5) {
    return 'Bewerte ausdrücklich einen kurzfristigen Trade innerhalb dieses Zeitfensters. Prüfe Momentum, Volatilität, Liquidität, Spread und Gebühren sowie bevorstehende Nachrichten und Unternehmenstermine. Beschreibe ein bedingtes Einstiegsszenario, ein Ausstiegsszenario und wann die Trade-Idee ungültig wäre. Nenne konkrete Kursmarken oder ein Chance-Risiko-Verhältnis nur, wenn ausreichend aktuelle Kursdaten dafür vorliegen; sonst benenne die fehlenden Daten. Leite kurzfristige Erfolgschancen nicht allein aus langfristigen Wachstumserwartungen ab.';
  }
  return 'Bewerte eine längerfristige Anlage: Geschäftsmodell, Bewertung, Fundamentaldaten und langfristige Chancen und Risiken, soweit aktuelle Daten vorliegen.';
}

export const ANALYSIS_OUTPUT_FORMAT = `Antworte übersichtlich mit etwa 200–250 Wörtern, bei dünner Datenlage entsprechend kürzer. Keine ausschweifende Einleitung, langen Absätze, Tabellen oder wiederholten Hinweise. Halte genau dieses Format ein:
**Fazit: Eher interessant / Abwarten / Eher unattraktiv / Daten unzureichend** – eine kurze Begründung, bezogen auf den gewählten Zeitraum.
- **Dafür:** die ein bis zwei wichtigsten belegten Argumente und warum sie für diesen Zeitraum relevant sind.
- **Risiko:** die ein bis zwei wichtigsten Gegenargumente und ihre mögliche Auswirkung auf den Trade.
- **Einstieg:** nenne möglichst einen konkreten Kursbereich als **X–Y EUR**, dazu die Einstiegsbedingung und eine kurze Herleitung aus den gelieferten Schlusskursen (z. B. wiederholt getesteter Preisbereich). Wenn der aktuelle Kurs außerhalb liegt, sage ausdrücklich, dass gewartet werden müsste.
- **Ausstieg:** nenne möglichst einen konkreten Zielbereich für Gewinnmitnahme als **X–Y EUR** und eine separat benannte Absicherungsmarke **unter Z EUR**, jeweils mit kurzer Herleitung und Bedingung. Kennzeichne dies als bedingtes Szenario für einen neuen Long-Trade, niemals als garantierte Entwicklung.
- **Datenlage:** wichtigste fehlende Informationen und Datenstand; erkläre knapp, wie diese die Aussagekraft begrenzen.
Kursbereiche müssen sich aus ausreichend aktuellen gelieferten Daten ableiten lassen und zur Währung und Einheit des Assets passen. Unterscheide historische Beobachtung und deine daraus geschätzte Zone. Schlusskurse sind keine Tageshochs oder Tagestiefs. Bei unzureichender Datenlage oder unplausibler Reihenfolge (Absicherung < Einstieg < Gewinnziel) stattdessen klar „Keine belastbare Kurszone“ schreiben. Keine pauschalen Prozentziele, erfundenen Daten oder Scheingenauigkeit. Runde passend zum Assetpreis.
Zum Schluss höchstens zwei tatsächlich gelieferte Quellen als kurze Links. Beantworte eine Zusatzfrage innerhalb dieser Punkte. Formuliere jeden Punkt in zwei bis drei kurzen Sätzen; liefere konkrete Begründungen statt Fülltext. Keine garantierten Gewinne oder Sicherheit vortäuschen.`;

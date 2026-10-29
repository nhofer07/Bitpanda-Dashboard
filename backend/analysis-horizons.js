export const ANALYSIS_HORIZONS = ['Wenige Tage', '1–2 Wochen', '2–4 Wochen', '1–3 Monate', '3–6 Monate', '1 Jahr', '3–5 Jahre', 'Über 5 Jahre'];
export const DEFAULT_ANALYSIS_HORIZON = '2–4 Wochen';
export function horizonGuidance(horizon) {
  if (ANALYSIS_HORIZONS.indexOf(horizon) >= 0 && ANALYSIS_HORIZONS.indexOf(horizon) < 5) {
    return 'Bewerte ausdrücklich einen kurzfristigen Trade innerhalb dieses Zeitfensters. Prüfe Momentum, Volatilität, Liquidität, Spread und Gebühren sowie bevorstehende Nachrichten und Unternehmenstermine. Beschreibe ein bedingtes Einstiegsszenario, ein Ausstiegsszenario und wann die Trade-Idee ungültig wäre. Nenne konkrete Kursmarken oder ein Chance-Risiko-Verhältnis nur, wenn ausreichend aktuelle Kursdaten dafür vorliegen; sonst benenne die fehlenden Daten. Leite kurzfristige Erfolgschancen nicht allein aus langfristigen Wachstumserwartungen ab.';
  }
  return 'Bewerte eine längerfristige Anlage: Geschäftsmodell, Bewertung, Fundamentaldaten und langfristige Chancen und Risiken, soweit aktuelle Daten vorliegen.';
}

export const ANALYSIS_OUTPUT_FORMAT = `Antworte kompakt mit höchstens 120 Wörtern insgesamt. Keine Einleitung, langen Absätze, Tabellen oder wiederholten Hinweise. Halte genau dieses Format ein:
**Fazit: Eher interessant / Abwarten / Eher unattraktiv / Daten unzureichend** – eine kurze Begründung, bezogen auf den gewählten Zeitraum.
- **Dafür:** stärkstes belegtes Argument.
- **Risiko:** wichtigstes Gegenargument.
- **Einstieg:** klare Bedingung; keine erfundenen Kursmarken.
- **Ausstieg:** Gewinnmitnahme oder Bedingung, bei der die Idee ungültig wird.
- **Datenlage:** wichtigste fehlende Information und Datenstand, sehr kurz.
Zum Schluss höchstens zwei tatsächlich gelieferte Quellen als kurze Links. Beantworte eine Zusatzfrage innerhalb dieser Punkte. Formuliere jede Zeile in höchstens zwei kurzen Sätzen. Keine garantierten Gewinne oder Sicherheit vortäuschen.`;

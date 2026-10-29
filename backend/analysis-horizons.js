export const ANALYSIS_HORIZONS = ['Wenige Tage', '1–2 Wochen', '2–4 Wochen', '1–3 Monate', '3–6 Monate', '1 Jahr', '3–5 Jahre', 'Über 5 Jahre'];
export const DEFAULT_ANALYSIS_HORIZON = '2–4 Wochen';
export function horizonGuidance(horizon) {
  if (ANALYSIS_HORIZONS.indexOf(horizon) >= 0 && ANALYSIS_HORIZONS.indexOf(horizon) < 5) {
    return 'Bewerte ausdrücklich einen kurzfristigen Trade innerhalb dieses Zeitfensters. Prüfe Momentum, Volatilität, Liquidität, Spread und Gebühren sowie bevorstehende Nachrichten und Unternehmenstermine. Beschreibe ein bedingtes Einstiegsszenario, ein Ausstiegsszenario und wann die Trade-Idee ungültig wäre. Nenne konkrete Kursmarken oder ein Chance-Risiko-Verhältnis nur, wenn ausreichend aktuelle Kursdaten dafür vorliegen; sonst benenne die fehlenden Daten. Leite kurzfristige Erfolgschancen nicht allein aus langfristigen Wachstumserwartungen ab.';
  }
  return 'Bewerte eine längerfristige Anlage: Geschäftsmodell, Bewertung, Fundamentaldaten und langfristige Chancen und Risiken, soweit aktuelle Daten vorliegen.';
}

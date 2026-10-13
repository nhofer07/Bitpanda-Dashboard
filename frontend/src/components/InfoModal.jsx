import { useEffect, useRef } from "react";

const PAGE_INFO = {
  calendar: {
    title: "Gewinnkalender erklärt",
    intro: "Zwei Monatskalender zeigen deine tägliche Portfolioentwicklung und die Netto-Ergebnisse deiner Verkäufe.",
    sections: [
      ["Portfolioentwicklung", "Vergleicht den letzten aufgezeichneten Tageswert mit dem vorherigen Tag. Ein- und Auszahlungen sowie zugeordnete andere Cashflows werden herausgerechnet. Verkaufserlöse zählen nicht als zusätzlicher Gewinn."],
      ["Verkäufe · Netto", "Summiert die Netto-Ergebnisse aller Verkäufe eines Tages nach Gebühren und KESt. Tage ohne Verkäufe bleiben neutral. Manuelle Finanzierungsgebühren werden keinem Verkaufstag zugeordnet."],
      ["Farben und Details", "Grün steht für Gewinn, Rot für Verlust. Ausgeglichene Tage und Tage ohne vollständige Daten bleiben neutral. Wähle einen Tag, um Werte und Verkäufe zu sehen."],
      ["Aufzeichnung", "Der Portfolio-Kalender nutzt ausschließlich gespeicherte Daten. Fehlende Tage werden nicht geschätzt; unvollständige Tageszeiträume sind gekennzeichnet. Tagesgrenzen richten sich nach Wien."]
    ]
  },
  assets: {
    title: "Assets & Charts erklärt",
    intro: "Durchsuche ab zwei Zeichen den Bitpanda-Katalog nach Name, Symbol oder ISIN – unabhängig von deinem Portfolio.",
    sections: [
      ["Allgemeine Suche", "Aktien, ETFs und Kryptowährungen können auch ohne eigene Position ausgewählt werden. Der Anlageklassenfilter grenzt die Ergebnisse ein."],
      ["EUR-Chart", "Wähle einen Suchtreffer oder ein Portfolio-Asset. Der Chart erscheint direkt auf dieser Seite mit Zeiträumen von einem Tag bis zur verfügbaren Gesamthistorie."],
      ["Positionsdetails", "Bestand, Gewinn/Verlust und Trade-Historie erscheinen bei eigenen Positionen direkt unter dem Chart. Details-Links aus Cockpit und Gewinnen öffnen dasselbe Asset auf dieser Seite."],
      ["Datenabdeckung", "Die Suche umfasst verfügbare Bitpanda-Assets nach Name und Symbol. Historische Charts hängen von der jeweiligen Kursdatenquelle ab; fehlende Verläufe werden gekennzeichnet."]
    ]
  },
  home: {
    title: "Überblick erklärt",
    intro: "Diese Seite fasst dein aktuelles Bitpanda-Portfolio zusammen. Sie trennt aktuellen Depotwert, bereits abgeschlossene Ergebnisse und noch offene Kursbewegungen.",
    sections: [
      ["Investiert", "Aktueller Marktwert deiner offenen Positionen. Nicht investiertes Fiat-Guthaben ist hier nicht enthalten."],
      ["Fiat Netto", "Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten. Deine Buchungszuordnung wird berücksichtigt. Rückerstattungen und ignorierte Buchungen sind darin nicht enthalten."],
      ["Gesamtrendite", "Differenz zwischen Gesamtwert und deinen Netto-Einzahlungen. Sie ist eine eigene Dashboard-Kennzahl und keine offizielle Bitpanda-Performance."],
      ["Portfolioverlauf", "Die Linie zeigt den um Ein- und Auszahlungen bereinigten Verlauf. Die Beträge links zeigen den tatsächlich aufgezeichneten Portfoliowert zum Zeitpunkt des höchsten und tiefsten Kurvenpunkts. Ein- und Auszahlungen werden als Punkte markiert und aus der Renditeberechnung herausgerechnet. Fehlen zwischen zwei Zeitpunkten Werte, verbindet der Chart die vorhandenen Datenpunkte."],
      ["Unrealisiert", "Aktueller Marktwert offener Positionen minus ihrer verbleibenden Kostenbasis. Dieser Wert ändert sich mit dem Kurs."],
      ["Offene Positionen", "Die Positionskarten im Cockpit zeigen Restmenge, Kostenbasis, durchschnittlichen Einstieg, realisiertes und unrealisiertes Ergebnis sowie Spot- oder Hebeldaten. Über „Details ansehen“ öffnest du das Asset mit seiner Trade-Historie."],
      ["Abgleich", "Der Wallet-Abgleich in den Asset-Details zeigt Unterschiede zwischen Handelsverlauf und Bestand. Die Kostenbasis entspricht den Kaufkosten der noch offenen Menge."],
      ["Dividenden", "Gebuchte Dividenden aus deiner Bitpanda-Historie. Quellensteuer wird in der Steueransicht separat erklärt."]
    ]
  },
  profits: {
    title: "Gewinne & Verluste erklärt",
    intro: "Diese Ansicht rekonstruiert Käufe und Verkäufe nach Durchschnittskosten-Methode und zeigt die Ergebnisse je Asset und Anlageklasse.",
    sections: [
      ["Brutto G/V", "Verkaufserlös vor Trading-Gebühren minus die anteilige Kostenbasis der verkauften Menge."],
      ["Netto G/V", "Brutto G/V nach Kauf- und Verkaufsgebühren sowie gebuchter KESt nach Erstattungen. Allgemeine Steuerkorrekturen werden im Gesamtergebnis berücksichtigt."],
      ["Trading-Gebühren", "Verwendet die ausdrücklich ausgewiesenen Bitpanda-Gebühren, einschließlich verschachtelter Gebührenfelder. Fehlende Gebühren werden aus den vorhandenen Handelsbeträgen abgeleitet."],
      ["Eigene Finanzierungsgebühren", "Optional von dir ergänzte Kosten, etwa für Hebelpositionen. Sie werden nur lokal im Browser gespeichert."],
      ["Filter & Details", "Die Ansicht kann Assets ausblenden oder nach Anlageklasse filtern. Öffne ein Asset für jede einzelne Kauf- und Verkaufstransaktion."]
    ]
  },
  account: {
    title: "Kontodaten erklärt",
    intro: "Diese Ansicht verwendet deine Bitpanda-Kontobuchungen und die Portfolio-Werte aus der API.",
    sections: [
      ["Erträge", "Staking, passives Earn, Cash Plus und Boni werden getrennt nach Asset und Jahr gezeigt. Nach Gebühr entspricht dem Bruttoertrag abzüglich des gemeldeten Gebührenfelds. Historische Eurobeträge erscheinen nur, wenn sie für die passende Buchung verfügbar sind."],
      ["Buchungsverlauf", "Zeigt Bewegungen und Bestände je Wallet. Der Abgleich vergleicht aufeinanderfolgende Bewegungen derselben Einheit. Ohne vollständige Vergleichswerte bleibt eine Buchung ungeprüft. Kredit- und Verrechnungskonten können zusätzlich eingeblendet werden."],
      ["Sonderereignisse", "Tausch, Krypto-Zusammenlegung und Staking-Umbuchungen zeigen alle beteiligten Buchungen gemeinsam. Diese Bewegungen werden nicht als neue Erträge addiert."],
      ["Bitpanda-Abgleich", "Vergleicht Bitpandas Bestand, investierten Betrag und durchschnittlichen Kaufpreis mit der Rekonstruktion des Dashboards. Unterschiede können aus verschiedenen Berechnungsmethoden oder Umbuchungen entstehen."]
    ]
  },
  fees: {
    title: "Handelsgebühren erklärt",
    intro: "Die Gebührenseite zeigt jeden abgeschlossenen Kauf und Verkauf genau einmal und macht die Gesamtsumme überprüfbar.",
    sections: [
      ["Datenquelle", "Trades sind Gebühren aus der Handelshistorie. Operations ergänzt fehlende Gebühren aus den EUR-Handelsbuchungen. Berechnet / Fallback kennzeichnet Werte ohne explizites Gebührenfeld."],
      ["Auswahl", "Filtere nach Jahr, Asset, Kauf oder Verkauf und Quelle. Sortiere nach höchster Gebühr oder öffne die Zusammenfassung nach Asset."],
      ["Weitere Kontokosten", "Zusätzliche Kostenbuchungen aus Hebelpositionen, Staking/Earn und Transfers werden separat gezeigt. Bereits im Trade enthaltene Gebührenbelege werden nicht nochmals addiert. Coin-Gebühren ohne historischen API-Eurobetrag bleiben in ihrer Originaleinheit."],
      ["Summe", "Es wird nur die Gebühr des jeweiligen Trades addiert. Kaufgebühren, die bei einem Verkauf anteilig in die Gewinnberechnung eingehen, werden hier nicht noch einmal gezählt. KESt und separate Finanzierungsgebühren gehören nicht zur Summe."]
    ]
  },
  calculator: {
    title: "Zielrechner erklärt",
    intro: "Der Zielrechner zeigt, welcher Kurs für ein frei gewähltes Gewinnziel erforderlich wäre. Er ist eine Rechenhilfe, keine Kursprognose.",
    sections: [
      ["Grundlage", "Verwendet Anteile und durchschnittlichen Einstieg deiner Position. Ohne vorhandenen Bestand entspricht der Einstieg zunächst dem aktuellen Kurs."],
      ["Investitionsbetrag", "Gib beispielsweise 100 Euro ein. Der Rechner ermittelt daraus automatisch die kaufbaren Anteile zum aktuellen Kurs. Änderst du die Anteile, wird der Betrag ebenfalls aktualisiert."],
      ["Ziel", "Du gibst einen gewünschten Gewinn oder Verlust vor. Das Ergebnis ist der dazu rechnerisch nötige Kurs."],
      ["Grenzen", "Steuern, Gebühren, Spread und zukünftige Einzahlungen können das reale Ergebnis verändern."]
    ]
  },
  adjustments: {
    title: "Sonderfälle erklärt",
    intro: "Hier kannst du Positionen ergänzen oder korrigieren, wenn die automatisch rekonstruierte Historie nicht vollständig ist.",
    sections: [
      ["Manuelle Position", "Ergänzt eine Menge und durchschnittlichen Einstiegspreis oder überschreibt eine bestehende Rekonstruktion."],
      ["Einsatz", "Sinnvoll bei Depotüberträgen, fehlender alter Handelshistorie oder Positionen, die Bitpanda nicht mehr im erwarteten Format liefert."],
      ["Vorsicht", "Manuelle Werte beeinflussen nur die dargestellte Position und sollten mit deinen Unterlagen abgeglichen werden."]
    ]
  },
  overview: {
    title: "Zeiträume erklärt",
    intro: "Diese Seite ordnet Cashflow, Dividenden und realisierte Ergebnisse nach Monat oder Jahr ein.",
    sections: [
      ["Cashflow", "Netto ist Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten. Rückerstattungen werden separat ausgewiesen."],
      ["Investiertes Ergebnis", "Aufgeschlüsselte realisierte Verkaufsgewinne und Verluste im gewählten Zeitraum."],
      ["Dividenden", "Gebuchte Dividenden inklusive der zugehörigen Detailzeilen. Quellensteuer bleibt getrennt nachvollziehbar."],
      ["Zeitraum", "Die Auswahl ändert nur die Darstellung, nicht deine Daten oder Berechnungen."]
    ]
  },
  fiat: {
    title: "Cashflow erklärt",
    intro: "Der Cashflow konzentriert sich auf Fiat-Wallet-Bewegungen und blendet Käufe von Aktien, ETFs und Krypto aus.",
    sections: [
      ["Einzahlungen und Auszahlungen", "Abgeschlossene Fiat-Bewegungen aus deiner Bitpanda-Historie."],
      ["Netto", "Einzahlungen minus Auszahlungen (inklusive Ausgaben) minus Transfers auf andere Konten. Rückerstattungen und ignorierte Buchungen sind nicht enthalten."],
      ["Kartenzahlungen", "Abschließende Bitpanda-Card-Transaktionen werden als Ausgaben erkannt."],
      ["Klassifizierung", "Du kannst einzelne Buchungen als Einzahlung, Ausgabe, Transfer, Auszahlung oder Rückerstattung markieren. Die Auswahl wird im Dashboard und zusätzlich in deinem Browser gespeichert."],
      ["Sparplan", "Die Kennzeichnung stammt aus den Bitpanda-Buchungsdaten und erleichtert die Zuordnung der Ausführungen."]
    ]
  },
  tax: {
    title: "Steuer-Cockpit erklärt",
    intro: "Diese Ansicht zeigt deine bereits bezahlte KESt aus den Bitpanda-Buchungen.",
    sections: [
      ["KESt aus Verkäufen", "Gebuchte Steuerabzüge minus direkte und allgemeine Erstattungen, plus tatsächlich bezahlte Nachforderungen. Keine KESt-Schätzung."],
      ["Dividenden und Quellensteuer", "Dividenden-KESt wird separat gezeigt. Quellensteuer und Handelsgebühren sind nicht im Verkaufs-KESt-Betrag enthalten."],
      ["Grenzen", "Öffne ein Jahr und danach eine Buchung für Datum, Asset, Steuerabzug und Erstattungen. Allgemeine Korrekturen bleiben separat sichtbar."]
    ]
  },
  market: {
    title: "Marktanalyse erklärt",
    intro: "Die Marktanalyse verbindet deine Watchlist mit aktuellen Kursen, News und einer vorsichtigen datenbasierten Einordnung.",
    sections: [
      ["Watchlist", "Aktuelle offene Portfolio-Positionen erscheinen automatisch. Zusätzliche Symbole kannst du lokal im Browser speichern."],
      ["Kurse", "Portfolio-Assets nutzen aktuelle Bitpanda-Kurse in EUR. Andere Watchlist-Kurse werden bei Bedarf nach EUR umgerechnet."],
      ["News-Badges", "Positiv, negativ und neutral sind automatische Einordnungen der Überschrift. Sie sind keine garantierte Kursprognose."],
      ["Regelbasierte Tendenz", "Nutzt feste Regeln aus Tagesbewegung, 20-Tage-Trend, Volatilität und verfügbaren Nachrichten. Es ist kein generatives KI-Modell angebunden; die Szenarien sind keine Anlageempfehlung."],
      ["Analystenkonsens", "Bei Aktien zeigt Finnhub echte aggregierte Research-Empfehlungen, wenn dafür Daten verfügbar sind. ETFs und Krypto haben häufig keinen einheitlichen Konsens."]
    ]
  },
  asset: {
    title: "Asset-Details erklärt",
    intro: "Die Detailansicht bündelt Handelsverlauf, Restkostenbasis und Ergebnis eines einzelnen offenen Assets.",
    sections: [
      ["Restkostenbasis", "Kaufkosten der Menge, die aktuell noch offen ist."],
      ["Realisierte Ergebnisse", "Ergebnisse bereits verkaufter Teilmengen nach Gebühren und gegebenenfalls KESt."],
      ["Transaktionsdetails", "Zeigt einzelne Käufe und Verkäufe inklusive Menge, Fiat-Wert, Gebühren und Zuordnung."]
    ]
  }
};

export default function InfoModal({ view, onClose }) {
  const info = PAGE_INFO[view] || PAGE_INFO.home;
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () => [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
    buttons()[0]?.focus();
    function handleKey(event) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = buttons();
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [onClose]);
  return <div className="info-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title" onMouseDown={event => event.stopPropagation()}>
      <header><div><div className="eyebrow">Seiteninformation</div><h2 id="info-modal-title">{info.title}</h2></div><button className="info-modal-close" onClick={onClose} aria-label="Info-Fenster schließen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
      <p className="info-modal-intro">{info.intro}</p>
      <div className="info-modal-sections">{info.sections.map(([title, text]) => <article key={title}><strong>{title}</strong><p>{text}</p></article>)}</div>
      <footer><span>Die Erklärung bezieht sich auf die gerade geöffnete Seite.</span><button className="primary-button" onClick={onClose}>Verstanden</button></footer>
    </section>
  </div>;
}

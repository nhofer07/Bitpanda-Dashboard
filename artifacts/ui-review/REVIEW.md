**UI/UX-Prüfung · 27. Oktober 2026**

Das Dashboard verwendet vier gemeinsame Hauptbereiche. Jeder Einstieg öffnet
seine Standardansicht; die Unterseiten bleiben auf Desktop und Handy identisch.
Desktop: Haupt- und Unter-Navigation. Handy: vier feste Einstiege unten und eine
beschriftete Unterseitenauswahl im Kopfbereich.

**Umgesetzte Gestaltung**

- Gemeinsame Farben, Abstände, Schriftgrößen, Oberflächen, Eingaben und Fokuszustände.
- Ein Seitentitel und ein gemeinsamer Datenstatus je Ansicht; Aktualisieren ist dort erreichbar.
- Der Portfoliowert bleibt die wichtigste Zahl. Quellen, Details und Berechnungshinweise sind abgestuft oder aufklappbar.
- Eindeutige Begriffe, gemeinsame Euro-/Prozent-/Datumsformate und Unterscheidung von fehlenden Werten und bestätigter Null.
- Auf dem Handy Karten für Assets, Buchungen und Ergebnisse. Tabellen passen sich auch am Laptop an die verfügbare Breite an. Breite Zeilen zeigen alle weiteren Felder in aufklappbaren Details, ohne seitliches Scrollen.
- Im schmalen Kalender gerundete Tagesvorschauen; exakte Beträge bleiben im zugänglichen Namen und in den Tagesdetails erhalten.
- Quote, Orientierungspreis und Ausführung sind getrennt. Sperren, Kontenaktualisierung und Bestätigungsmechanismen bleiben erhalten.
- Finanzielle Berechnungsmodelle wurden beibehalten; fehlende Anzeigewerte werden nicht als Null dargestellt.

**Bildschirmgrößen**

| Größe | Prüfung |
| --- | --- |
| 1440 × 1000 | Alle 13 Ansichten geöffnet, Screenshot erfasst, Laufzeitfehler und Seitenüberlauf geprüft |
| 390 × 844 | Alle 13 Ansichten geöffnet, Screenshot erfasst, aktive Navigation und Unterseitenauswahl geprüft |
| 768 × 1024 | Cockpit, Assets, Gewinne, Kalender, Rechner, Marktanalyse, Fusion und Einstellungen |
| 360 × 800 | Dieselben acht Ansichten, zusätzlich Schaltflächen-Mindestgröße und lange Namen/große Beträge |
| 430 × 932 | Dieselben acht Ansichten und Prüfung auf Seitenüberlauf |

Die 13 Ansichten sind Cockpit, Assets, Cashflow, Kontodaten, Gewinne & Verluste,
Zeiträume, Kalender, Gebühren, Steuern, Zielrechner, Marktanalyse, Fusion und Einstellungen.
Die Screenshots wurden visuell betrachtet; dabei gefundene Probleme wurden korrigiert
und die betroffenen Prüfungen wiederholt.

**Geprüfte Abläufe und Zustände**

- Hauptbereiche öffnen zuverlässig ihre Standardseite; alle mobilen Unterseiten sind auswählbar.
- Direkte Hash-Aufrufe, Browser-Zurück, Assets ohne Scrollsprung und Cockpit-Positionen mit Chartziel.
- Bereinigter/tatsächlicher Chart einschließlich Skala, Extremwerten und Speicherung der Auswahl.
- Chartbedienung über Tastatur, Asset-Suche und Auswahl eines Suchtreffers.
- Sichtbare Tastaturfokussierung und Hilfe mit Escape, Fokus-Rückgabe und erreichbarem Abschlussknopf.
- Kalenderdetails, Kontodaten-Unteransichten, Rechner-Eingabe und ausgewählte Marktanalyse.
- Fehlende/Nullwerte, leere Bestände, Ladezustand, veraltete Daten, Erstladefehler und Aktualisierungsfehler.
- Fehlgeschlagene Aktualisierung erhält vorhandene Daten; verspätete Antworten überschreiben keinen neueren Stand.
- Quote lädt Kontodaten neu; reservierte und verfügbare Mengen bleiben unterscheidbar.
- Quote/Earn-Formulare erreichbar; Countdown und gesperrte abgelaufene Quote geprüft.
- Mobile Schaltflächen in Cockpit, Assets, Kalender, Rechner und Einstellungen sind mindestens 44 × 44 CSS-Pixel groß.
- Kontrast der aktiven Hauptnavigation im Browser gemessen, mindestens 4,5:1.

**Ergebnisse**

- 54 Playwright-Browsertests bestanden.
- 188 Node-Berechnungs-/Logiktests bestanden.
- 6 Python-Tests für Paketierung und Aktualisierung bestanden.
- Produktionsbuild erfolgreich; keine Whitespace-Fehler im Diff.

**Repräsentative Screenshots**

- [Desktop · Cockpit](desktop-cockpit-viewport.png)
- [Handy · Cockpit](mobile-cockpit-viewport.png)
- [Handy · Kalender](mobile-calendar.png)
- [Handy · Hilfe](state-help.png)
- [Quote und Earn](state-quote-earn.png)
- [Abgelaufene Quote](state-expired-quote.png)

Die übrigen Screenshots liegen im selben Ordner: `desktop-*.png`, `mobile-*.png`,
`tablet-*.png`, `small-*.png`, `large-phone-*.png` und `state-*.png`.

**Praktische Grenzen und Aktualisierung**

Die Browserprüfung verwendet Chromium und synthetische Daten. Es wurden keine echten
Trades oder Earn-Aktionen ausgeführt. Echte iOS-/Android-Geräte, Safari, Bildschirmleser
und die Installation vom Homescreen wurden nicht separat getestet. Das ist keine
vollständige Barrierefreiheitszertifizierung und kein Abgleich mit einem echten Depot.

Lokal genügt nach Übernahme der Änderungen ein Neuladen der Seite; ein laufender
Vite-Entwicklungsserver aktualisiert die Oberfläche automatisch. Eine bereits
installierte Synology-/Docker-Version muss mit dem neuen Frontend aktualisiert werden.

**Ergänzung: Tabellen ohne seitliches Scrollen**

Alle Tabellen verwenden eine gemeinsame Breitenprüfung. Passt die Tabelle nicht,
werden ihre Zeilen als aufklappbare Datensätze dargestellt. Spaltenbeschriftungen,
Summen, Belege und Aktionen bleiben erhalten. Dies wurde mit geöffneten Details bei
360, 390, 768, 1024, 1366 und 1440 Pixel Breite geprüft. Zusätzliche Screenshots:
[tables-fees-1366.png](tables-fees-1366.png) und
[tables-comparison-390.png](tables-comparison-390.png).

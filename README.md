# Bitpanda Dashboard

Lokales Dashboard für Portfolio, Fiat-Wallet, Gewinne/Verluste und Marktanalyse.

Für den dauerhaften Betrieb auf einer Synology NAS mit DSM 7.1.1 siehe
[`SYNOLOGY.md`](SYNOLOGY.md). Das Docker-Setup stellt Frontend und Backend gemeinsam
auf Port `8085` bereit und schützt den Zugriff mit einem eigenen Passwort. API-Keys
werden im jeweiligen Benutzerbrowser gespeichert und bleiben auf der Synology nur im
Arbeitsspeicher eines getrennten Benutzercontainers. Verlaufsdaten werden ohne Keys
in einem eigenen Datenordner pro Benutzer gespeichert.

## Start auf macOS

Voraussetzung: Node.js 20 oder neuer inklusive npm und eine Internetverbindung.
ZIP entpacken und `Bitpanda Dashboard.command` doppelklicken. Beim ersten Start
werden die Abhängigkeiten installiert. Das Terminal bleibt während der Nutzung offen.
Falls nötig: `chmod +x "Bitpanda Dashboard.command"`.

Das Dashboard öffnet sich unter http://localhost:5173. Beim ersten Start erscheint
die Einrichtung. Unter **Einstellungen** den eigenen Bitpanda API-Key eintragen.
Für **Handel & Earn** werden Guthaben, Transaktionen, Trading (Lesen/Schreiben)
und Earn (Lesen/Schreiben) benötigt. Der **Finnhub API-Key ist optional** und
liefert Analystenkonsensdaten.
Ohne Finnhub funktionieren Marktpreise, News und datenbasierte Szenarien weiter.
Es ist kein generativer KI-Dienst angebunden.

Keys lassen sich ersetzen oder entfernen. Leere Felder behalten vorhandene Keys.
Speichern prüft nicht die Gültigkeit beim Anbieter; Fehler erscheinen beim Datenabruf.
Mit `q` im Starter werden die gestarteten Dienste beendet.

Solange der Starter beziehungsweise das Backend läuft, werden die Depotdaten jede
Minute im Hintergrund aktualisiert. Das funktioniert auch in einem anderen
Browser-Tab oder bei geschlossenem Browser. Beim erneuten Öffnen lädt das Dashboard
den zuletzt aktualisierten Stand. Wird der Starter mit `q` beendet oder der Rechner
ausgeschaltet, pausiert die Aktualisierung bis zum nächsten Start.
Automatische Abrufe laufen still im Hintergrund: Der bisherige Stand bleibt sichtbar
und wird erst nach einem erfolgreichen Abruf durch die neuen Werte ersetzt. Sobald
das Browserfenster oder der Dashboard-Tab wieder aktiv wird, lädt die Oberfläche
zusätzlich sofort den jüngsten Backend-Stand; sie wartet dann nicht auf den nächsten
Browser-Timer. Neue gespeicherte Daten werden angemeldeten Seiten zusätzlich per
Server-Ereignis gemeldet und sofort nachgeladen. Die Verbindung wird bei Abmeldung
oder Kontowechsel geschlossen; bei Verbindungsunterbrechung bleibt die Minutenabfrage
als Rückfall erhalten. „Daten aktuell“ gilt höchstens 60 Sekunden nach dem Datenstand. Auch unsichtbare Tabs und Fenster auf anderen macOS-Schreibtischen
führen die regelmäßigen Dashboard- und Chart-Abrufe weiter aus. Safari kann
Hintergrund-Timer selbst drosseln; die serverseitige Minutenaufzeichnung bleibt
davon unabhängig. Bei Fokus, Sichtbarkeit oder Wiederherstellung der Seite wird
der aktuelle Stand sofort erneut angefordert.

Beim Öffnen wird ein vorhandener, gültiger Dashboard-Stand sofort angezeigt.
Ist er älter als eine Minute, bleibt sein ursprünglicher Zeitstempel sichtbar,
während der Server im Hintergrund aktualisiert. Manuelles Aktualisieren wartet
auf neue Daten. Unabhängige API-Abrufe laufen parallel; identische gleichzeitige
Leseabrufe werden zusammengefasst. Abgeschlossene Antworten werden dabei nicht
zusätzlich zwischengespeichert. Einzelne API-Leseabrufe haben ein 15-Sekunden-Limit.
Versionierte JavaScript-/CSS-Dateien dürfen im Browser-Cache bleiben; HTML und
Manifeste werden bei jedem Aufruf erneut geprüft.

Die vollständige Historie wird nicht jede Minute erneut heruntergeladen: Die neueste
Seite wird bei jedem Abruf frisch geprüft. Bei Änderungen oder nach Ablauf von fünf
Minuten werden auch alle älteren Seiten neu geladen. Der Zeitpunkt dieser vollständigen
Prüfung bleibt als `historyFullyReadAt` im Datenpaket erhalten. Asset-Stammdaten werden
gezielt für die im Konto vorkommenden Instrumente geladen. Umfangreiche Dashboard-
Antworten werden bei Browserunterstützung mit gzip übertragen.

Stückkurse unter 10 € werden mit vier Nachkommastellen angezeigt, auch in
Kurscharts, Kaufhistorie und Einstiegskursen. Bei sehr kleinen Kursen werden
zusätzliche Stellen verwendet; bei sehr kleinen Chart-Bewegungen erhöht sich
auch die Genauigkeit der Skala, damit unterschiedliche Kurse unterscheidbar bleiben. Portfolio- und Buchungsbeträge bleiben zweistellig.

Der Portfolioverlauf im Cockpit verwendet bevorzugt Bitpandas eigene EUR-Portfoliohistorie
(`GET /v1/portfolio-history`) für Tag, Woche, Monat, sechs Monate und Jahr. Die
Original-Messpunkte bleiben erhalten; belegte Korrekturen werden in der Darstellung gekennzeichnet; der Tageszeitraum umfasst die
letzten 24 Stunden. „Tatsächliche Werte anzeigen“ zeigt die damaligen Portfoliowerte.
Die Standardansicht bereinigt die Kurve um die zugeordneten Zahlungsbewegungen.
Ein-/Auszahlungen bleiben als anklickbare Markierungen und als aufklappbare Liste
sichtbar und lassen sich separat ausblenden. Für die Bereinigung werden Buchungen
dem zugehörigen Bitpanda-Zeitabschnitt zugeordnet, dessen Abschlusswert die Buchung
bereits enthält; die genaue Buchungszeit bleibt in Marker und Liste erhalten.
Bitpandas Prozent-Rendite wird als
solche bezeichnet; das bereinigte Euro-Ergebnis folgt den Cashflow-Zuordnungen im
Dashboard und kann von Bitpandas Berechnung abweichen.

Unabhängige Kontostände werden auch bei funktionierender Bitpanda-Historie weiter
aufgezeichnet (höchstens ein Punkt pro Minute, nach 48 Stunden auf Viertelstunden
und nach 31 Tagen auf Tagespunkte verdichtet). Unter „Gespeichert“ bleibt diese
Historie separat abrufbar.

Monats- und 6-Monats-Historie werden an gemeinsamen Schlusszeitpunkten verglichen.
Abweichungen über max(5 €, 0,3 %) werden ausgewiesen. Tageswerte widerlegen keine
Spitzen innerhalb des Tages. Ein automatischer Ersatz benötigt zwei echte lokale
Kontostände vor und nach dem Schlusszeitpunkt (maximal 15 Minuten entfernt), die
untereinander innerhalb max(5 €, 0,3 %) liegen. Nur isolierte Abweichungen über
max(25 €, 1 %) werden ersetzt; beide benachbarten API-Werte müssen zum lokalen
Stand passen. Bei Zahlungsbewegungen, Datenlücken oder geschätzten lokalen Punkten
erfolgt kein Ersatz. Korrekturen zeigen Originalbetrag, Ersatzbetrag und Herkunftszeit.
Die originale Bitpanda-Prozentrendite wird bei korrigierter Kurve ausgeblendet;
das Euro-Ergebnis nutzt die dargestellten Werte. Rohdaten werden nicht überschrieben.

Die Verlaufsdatei wird vollständig in eine temporäre Datei geschrieben, auf den
Datenträger synchronisiert und anschließend atomar ersetzt. Zusätzlich liegt bei
jedem Speichervorgang eine vollständige zweite Kopie in
`dashboard-data.json.recovery.json`. Tägliche Sicherungen des bisherigen Standes
bleiben unter `dashboard-data.json.backups/YYYY-MM-DD.json` erhalten; sie werden
nicht automatisch gelöscht und benötigen zusätzlichen Speicherplatz.
Fehlt die Hauptdatei oder ist sie beschädigt, verwendet das Backend die zweite
Kopie beziehungsweise die jüngste lesbare tägliche Sicherung. Sind vorhandene
Kopien sämtlich unlesbar, bricht es ab, statt eine neue Historie darüberzuschreiben.
Veraltete Aktualisierungen, leere Verläufe und ein nach vorne verschobenes
Aufzeichnungsstartdatum werden beim Speichern zurückgewiesen. Bestehende
Synology-Historien erhalten diese zusätzlichen Kopien beim nächsten erfolgreichen
Speichervorgang nach dem Update. Die Kopien liegen auf demselben Datenträger;
zusätzliche Sicherungen des Datenordners auf einem anderen Datenträger schützen
gegen den Ausfall der NAS-Festplatten.

Aktuelle Bestände, durchschnittliche Kaufpreise und investierte Beträge werden
für alle von der Portfolio-API gemeldeten Assets direkt aus Bitpandas eigenen
Kontodaten übernommen. Der Gesamtbestand enthält auch reservierte Anteile;
Fusion-Guthaben wird nicht nochmals addiert. Meldet Bitpanda keinen Kaufpreis in
EUR, bleibt der aus Trades rekonstruierte Preis ausdrücklich als solcher markiert.
Manuelle Mengenüberschreibungen und der Reiter „Sonderfälle“ wurden entfernt;
alte Korrekturdateien bleiben erhalten, beeinflussen neue Berechnungen aber nicht.
Realisierte historische Verkaufsgewinne und Steuerbuchungen werden weiterhin aus
den jeweiligen Transaktionen berechnet.

## Gebühren, Steuern und Kontodaten

**Gebühren** zeigt die Gebühr jedes abgeschlossenen Trades und zusätzliche
Kostenbuchungen aus Hebelpositionen, Earn/Staking und Transfers. Ein eigener
Gebührenbeleg und das Gebührenfeld desselben Trades zählen zusammen nur einmal.
Gebühren in Coins bleiben in der Originaleinheit; die Eurosumme verwendet nur
vorhandene API-Eurobeträge. Sie ist bei fehlenden Eurobewertungen keine vollständige
Gesamtkostensumme. Manuelle Finanzierungsgebühren in der Gewinnansicht bleiben
separate eigene Eingaben.

**Steuern** zeigt gebuchte KESt nach Erstattungen und bezahlten Nachforderungen.
Quellensteuer steht separat mit ihren Einzelbuchungen. Jahre mit Kontohistorie ohne
Steuerbuchungen erscheinen ausdrücklich mit null. Eine selbst zu erklärende
Steuerpflicht wird nicht berechnet.

**Kontodaten** ergänzt Erträge aus Staking, passivem Earn, Cash Plus und Boni,
den Buchungsverlauf mit Bestand nach jeder Buchung, Sonderereignisse sowie den
Vergleich von Bitpandas eigenen Portfolio-Kennzahlen mit der Dashboard-Rekonstruktion.
Bruttoertrag minus gemeldete Gebühr ergibt den Ertrag nach Gebühr; unterschiedliche
Coins werden nicht in einer gemeinsamen Geldsumme addiert. Bereits gebuchte Erträge
werden nicht nochmals zum Portfoliowert addiert.
Der Bestandsabgleich bleibt bei fehlenden Werten, API-Platzhaltern oder unvollständigen
Buchungsfolgen ungeprüft. Nicht verfügbare aktuelle Hebelpositionen werden ausdrücklich
gekennzeichnet; ihre historischen Buchungen können trotzdem verfügbar sein.

## Private Daten und Weitergabe

Keys liegen in `~/.bitpanda-dashboard/credentials.json`, außerhalb des Projektordners,
mit Dateirechten nur für den lokalen Benutzer. Sie sind dort nicht verschlüsselt;
Personen mit Zugriff auf dieses Benutzerkonto können sie lesen. Der Browser erhält
nur den Status „Hinterlegt“, niemals gespeicherte Keys.
Depot-Caches liegen ebenfalls außerhalb des Projekts. Auf
der Synology nutzt jede getrennte Benutzerinstanz einen stabilen Datenbestand, damit
ein API-Key-Wechsel den Portfoliochart nicht zurücksetzt. Bei lokaler Speicherung
auf dem Mac bleiben Datenbestände weiterhin nach Bitpanda-Key getrennt.
Watchlists und Ansichtspräferenzen bleiben im Browser des jeweiligen Nutzers.

Vorhandene Keys aus `backend/.env` und lokale Depotdateien werden beim nächsten
Backend-Start in das Benutzerverzeichnis verschoben. Danach enthält `.env` diese
Keys nicht mehr. Den persönlichen Datenordner niemals mitversenden.

Versandpaket neu erstellen:

```bash
python3 scripts/package-release.py
```

Nur `release/Bitpanda-Dashboard.zip` versenden. Der Export enthält ausschließlich
freigegebene Quelldateien, keine `.env`, Depotdaten, Logs, Abhängigkeiten oder
persönlichen Xcode-Dateien. Jeder Empfänger richtet seine eigenen Keys ein.
Die Anwendung ist für lokale Nutzung ausgelegt; der bisherige öffentliche
Handy-Tunnel und der automatische Versand an eine private Telefonnummer entfallen.

## Manueller Start

In zwei Terminals jeweils `npm install` ausführen, anschließend:

```bash
cd backend
npm start
```

```bash
cd frontend
npm run dev
```

## Mobile Bedienung und Datenqualität

Desktop und Handy verwenden dieselben vier Hauptbereiche: **Cockpit**,
**Portfolio**, **Auswertungen** und **Markt & Handel**. Jeder Einstieg öffnet
seine Standardansicht: Cockpit, Assets, Gewinne & Verluste beziehungsweise
Marktanalyse. Die Unterseiten sind am Desktop über eine zweite Navigationszeile
und am Handy über „Ansicht wechseln“ im Seitenkopf erreichbar. Der Zielrechner
liegt unter Auswertungen, Fusion unter Markt & Handel. Einstellungen und Hilfe
stehen im Kopfbereich. Auf dem Handy ist die Hauptnavigation unten fixiert.
Assets, Gewinne und Cashflow-Buchungen verwenden mobile Karten. Alle Tabellen
prüfen ihre tatsächliche Breite: Passt eine Zeile nicht vollständig, werden die
wichtigsten Angaben mit aufklappbaren Details dargestellt. Das gilt auch am
Laptop; seitliches Scrollen ist für die Tabellen nicht erforderlich.
Browser-Zurück und direkte Seitenaufrufe über `#calendar`, `#assets` usw.
werden unterstützt. „Assets“ öffnet oben; offene Positionen im Cockpit öffnen
gezielt den zugehörigen Chart.

Über „Zum Home-Bildschirm“ lässt sich das Dashboard mit eigenem Icon öffnen.
Der eigenständige App-Modus hängt vom Browser und einer geeigneten HTTPS-Verbindung
ab. Es werden keine Kontodaten für eine Offline-Nutzung zwischengespeichert.

Der Portfoliochart startet mit bereinigten Werten. „Tatsächliche Werte anzeigen“
wechselt Kurve, Skala und Extremwerte gemeinsam; die Auswahl bleibt gespeichert.
Bei Zahlungsbewegungen im Zeitraum zeigt er das bereinigte Ergebnis in Euro,
aber keine Prozent-Rendite: Messungen unmittelbar vor jeder Buchung fehlen.
Ohne Zahlungsbewegungen wird die prozentuale Wertentwicklung angezeigt.
„Ergebnis gegenüber Netto-Einzahlungen“ im Cockpit verwendet dagegen die
Netto-Einzahlungen als Bezugsgröße und ist keine zeitgewichtete Rendite.

Kennzeichnungen unterscheiden Bitpanda-Werte, Berechnungen, Schätzungen und
veraltete Daten. Ein gemeinsamer Datenstatus meldet fehlgeschlagene Abrufe und
mehr als drei Minuten alte Daten; vorhandene Werte bleiben bei Fehlern sichtbar.
Veraltete Antworten überschreiben keinen neueren Dashboardstand.
Cashflow-Korrekturen werden pro Buchung mit dem vorherigen Serverwert verglichen.
Konflikte zwischen Geräten laden den Serverstand und verlangen eine neue Auswahl.
Ausstehende Änderungen werden lokal gespeichert und später erneut synchronisiert;
alte Browserwerte werden nicht automatisch zum Server zurückgeschrieben.

Im Handel werden Kontodaten vor jeder Quote neu geladen. Gesamtbestand und
verfügbarer Bestand stehen separat; fehlende verfügbare Beträge erscheinen als
„Nicht verfügbar“. Quotes zeigen ihre Restlaufzeit und sind nach Ablauf oder bei
unbekannter Gültigkeit gesperrt.

Prüfungen:

```bash
node --test backend/test/*.test.js frontend/test/*.test.js
cd frontend
npx playwright install chromium
npm run test:e2e
```

Die Browsertests verwenden ausschließlich Testdaten und führen keine echten
Trades aus. Sie prüfen alle Ansichten am Desktop und Handy, zusätzlich Tablet
und schmale Layoutgrenzen, Navigation, Chartansichten, Speicherung,
Aktualisierungsfehler, Formularbedienung und abgelaufene Quotes. Screenshots der
visuellen Prüfung liegen nach `npm run test:e2e` in `artifacts/ui-review/`.
Die Prüfung läuft in Chromium; echte iOS-/Android-Geräte müssen bei Bedarf
zusätzlich geprüft werden. Die Dateibestandteile `dashboard.css`, `auth.css`,
`PageIntro`, `DataNote` und `formatters.js` bündeln gemeinsame Gestaltung,
Einführungen, Erläuterungen und Zahlenformate.

## Assets & Suche

Im Reiter **Assets** findest du ab zwei Zeichen auch nicht gehaltene Assets aus dem
Bitpanda-Katalog – nach Name, Symbol oder ISIN. Ein Anlageklassenfilter grenzt die
Ergebnisse ein. Suchtreffer und Portfolio-Assets zeigen ihre Kursdetails und einen
EUR-Chart direkt auf der Asset-Seite. Bestand, Gewinn/Verlust und Trade-Historie eigener Positionen erscheinen direkt unter
dem Chart. Details-Links aus Cockpit und Gewinnen führen zu dieser Asset-Seite.
Der Katalog wird beim ersten Suchaufruf geladen und eine Stunde zwischengespeichert.
Die historische Kursabdeckung hängt von der jeweiligen Datenquelle ab.

Der experimentelle Dividendenkalender und dessen externen Anbieterabfragen wurden
entfernt. Bereits gebuchte Dividenden in Cashflow, Portfolio und Steuerberechnung
stammen weiterhin aus der bestehenden Bitpanda-Transaktionshistorie.

## EUR-Charts und Marktanalyse

Die regelbasierte Marktanalyse zeigt historische Kurse in EUR. Fremdwährungskurse werden mit
historischen Frankfurter/EZB-Referenzkursen umgerechnet; für Wochenenden gilt der
zuletzt verfügbare Referenzkurs. Zeiträume ohne passende EUR-Referenzkurse werden
nicht als EUR-Werte ausgegeben. Bitpanda-Symbole wie `O-US` werden dem richtigen
Marktsymbol zugeordnet; `SPYY` nutzt die EUR-Notierung `SPYY.DE`.
Für Vision (`VSN`) werden EUR-Kurse von CoinGecko verwendet. Diese Quelle liefert
ohne zusätzlichen API-Key bis zu 365 Tage; längere Auswahlen zeigen einen Hinweis.
Sehr lange Reihen werden für die Darstellung ausgedünnt, wobei echte Kurswerte,
Zeitstempel und Anfangs-/Endpunkt erhalten bleiben.

Chart-Tests: `node --test backend/test/market-history.test.js`

## Zielrechner

Im Feld **Investitionsbetrag** kann ein Euro-Betrag wie 100 Euro eingegeben werden.
Der Rechner ermittelt daraus automatisch die Anteile zum aktuellen Kurs. Betrag und
Anteile aktualisieren sich gegenseitig. Bei einem Asset ohne aktuellen Bestand wird
der durchschnittliche Einstieg zunächst auf den aktuellen Kurs gesetzt.

## Handel & Earn auf der Asset-Seite

Die Asset-Seite verwendet die aktuelle Public API unter
`https://api.public.bitpanda.com/v1`. Suchtreffer zeigen den aktuellen Preis und
öffnen Chart, Positionsdetails und Handel für genau dieses Asset. Einen separaten
Handelsreiter gibt es nicht.

Trades laufen absichtlich zweistufig: Das Dashboard fordert zuerst eine zeitlich
begrenzte Quote mit Preis, Gebühr, Kosteninformationen und Warnungen an. Erst nach
der Texteingabe `JETZT HANDELN` wird sie akzeptiert. Staking und Unstaking erfordern
`EARN BESTÄTIGEN`. Diese Bestätigungen werden zusätzlich im Backend geprüft.

Earn wird nur bei Kryptowährungen angeboten, die im eigenen Portfolio vorhanden
sind und für die Bitpanda eine aktive Earn-Konfiguration meldet. Damit kann kein
nicht vorhandenes Asset versehentlich zu Earn hinzugefügt werden.

Die klassische Auswertung nutzt während der Übergangszeit weiterhin die bisherigen
Bitpanda-Endpunkte. Der neue Bereich arbeitet unabhängig davon bereits mit
Portfolio, Operations, Assets, Währungen, Quotes, Earn und Trading-Limits der neuen
API.

### ChatGPT-Analyse

In den Einstellungen lässt sich ein berechtigtes ChatGPT-Konto verbinden. Assets und Marktanalyse bieten anschließend eine KI-Einschätzung mit Modellwahl, Anlagehorizont und Risikoneigung. Es gibt keinen kostenpflichtigen API-Ersatz. Einrichtung, Credit-Einstellungen und Synology-Anmeldetunnel: [ChatGPT-Anleitung](docs/chatgpt.md).

### TradingView auf der Fusion-Seite

Unter Fusion lässt sich zwischen Fusion-Kurs und TradingView umschalten. Das kostenlose Advanced-Chart-Widget bietet Kerzen, Zeitintervalle, Indikatoren und Zeichenwerkzeuge. Es startet mit einem Kraken-Referenzmarkt zum Fusion-Paar; ein anderes TradingView-Symbol kann eingegeben werden. Nicht jedes Fusion-Paar ist dort verfügbar. Referenzkurse sind keine Fusion-Ausführungspreise; Orderbuch und Orderformular bleiben beim ausgewählten Fusion-Paar. Der externe Chart läuft isoliert, ohne Zugriff auf Dashboard-Daten. Internetzugang zu TradingView ist erforderlich.

### Gespeicherte Zeichnungen und Vollbild

Auf Fusion ist TradingView standardmäßig aktiv und kann per „Vollbild“ den Bildschirm füllen. Bei Browsern ohne nutzbare Vollbild-API wird der Browserinhalt ausgefüllt. „Vollbild verlassen“ bzw. Escape beendet die Ansicht.

Der zusätzliche Zeichenreiter wurde entfernt. Bisher dort gespeicherte Markierungen bleiben im Server-Datenverzeichnis `fusion-chart-drawings/` erhalten. Unter **Bisherige gespeicherte Markierungen verwalten** können sie direkt gelöscht oder als JSON exportiert werden. Ein Export ist keine importierbare TradingView-Datei.

Interne Zeichnungen des eingebetteten TradingView-Widgets lassen sich über dessen öffentliche Schnittstellen nicht durch das Dashboard exportieren und wieder einspielen. Die entsprechenden Layout-/Zeichnungs-APIs gehören zur separat freizugebenden Advanced-Charts-Bibliothek. Das Dashboard behauptet deshalb keine dauerhafte Speicherung dieser Widget-Zeichnungen.

### Prüfung historischer Portfolio-Spitzen

Jahres- und Sechsmonatsverläufe werden auf isolierte große Sprünge geprüft. Solche Punkte bleiben bis zur Bestätigung aus der Kurve und ihren Extremwerten entfernt, mit einem Prüfhinweis unter dem Chart. Im Jahreschart werden die verbleibenden Punkte durchgehend verbunden, im Sechsmonatschart gestrichelt überbrückt. Diese Verbindungen erzeugen keine zusätzlichen Messpunkte oder Bewertungswerte. Originalpunkte lassen sich zur Kontrolle ausdrücklich einblenden; Rohdaten werden niemals gelöscht oder durch erfundene Zwischenwerte ersetzt. Große erfasste Ein-/Auszahlungen und dauerhaft veränderte Niveaus werden nicht als isolierte Spitzen behandelt.

Der Hintergrundabgleich bewertet historische Wallet-Bestände mit verfügbaren damaligen EUR-Schlusskursen. Tageskurse werden erst nach Ablauf ihres Tages berücksichtigt. Fehlende Wallet-Salden, historische Kurse oder Hebelbewertungen bleiben als Einschränkung sichtbar; unvollständige Teilbewertungen gelten nicht als bestätigter Gesamtwert. Ein Verdacht ist kein Beweis für einen Bitpanda-Fehler. Der Vergleich auf heutigem Kapitalstand bleibt eine rechnerisch angepasste Darstellung und darf nicht mit dem damaligen tatsächlichen Kontostand verwechselt werden.

Ein-/Auszahlungspunkte starten ausgeblendet und lassen sich per Button einschalten. Buchungsliste, Korrekturen und Prüfdetails stehen unter dem Chart mit identischen Abständen.

### Gewinnvorschau vor Ausführung

Die Asset-Quote und das Fusion-Orderformular zeigen den geschätzten Gewinn/Verlust in Euro und Prozent bezogen auf anteilige Anschaffungskosten inklusive Kaufgebühren. Verkaufsgebühren werden nur einmal berücksichtigt. Bei Wertpapieren wird die bestehende KESt-Schätzung verwendet. Die Krypto-Vorschau folgt der ausdrücklich gewünschten Einstellung ohne zusätzlichen KESt-Abzug; das stellt keine Steuerfreiheit fest. Fehlende Kaufkosten oder Gebühren bleiben unbekannt, statt als null zu gelten. Bei Fusion dient der anteilige Einstand des gesamten Bitpanda-Bestands als Schätzung, nicht ein gesondert belegter Fusion-Einstand. Nicht-EUR-Paare erhalten ohne gesicherte EUR-Umrechnung keine Renditevorschau.

Beim Kauf kann ein späterer Verkaufskurs als Szenario eingegeben werden. Das ist eine hypothetische Rendite für die neu gekaufte Menge, kein bereits realisierter Gewinn. Maßgeblich bleibt die endgültige Bitpanda-Abrechnung.

Für identische, abgeschlossene Schlusszeitpunkte verwendet der Jahreschart die höher aufgelösten Tageswerte aus dem Sechsmonatsverlauf. Die Jahres-Originaldaten bleiben im Vergleich nachvollziehbar. Zeitstempel und Bucket-Längen des Jahresrasters bleiben für die Cashflow-Zuordnung erhalten. Der Jahreschart öffnet mit tatsächlichen Eurobeständen; der kapitalbereinigte Vergleich ist weiterhin umschaltbar.

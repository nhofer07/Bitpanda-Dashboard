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
Browser-Timer.

Der Portfolioverlauf im Cockpit zeichnet ab seinem Start den gesamten Bitpanda-Wert
auf: Marktwert der offenen Positionen plus nicht investiertes Guthaben. Neue Werte
werden minütlich erfasst und ältere Werte platzsparend verdichtet. War das Backend
ausgeschaltet, bleibt die zeitliche Lücke erhalten und die datierten Messpunkte vor
und nach der Pause werden gerade verbunden. Eine rückwirkende Rekonstruktion wäre
wegen fehlender historischer Wallet- und Cash-Stände nicht zuverlässig.

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
Depot-Caches und manuelle Positionen liegen ebenfalls außerhalb des Projekts. Auf
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

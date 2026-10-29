# ChatGPT im Dashboard

Die KI-Analyse verwendet ausschließlich OAuth-Zugangsdaten aus „Continue with ChatGPT“. Es gibt keinen API-Key, keinen kostenpflichtigen API-Ersatz und keine automatischen Wiederholungen von Analysen. Bei fehlender Berechtigung, Nutzungslimits oder unterbrochenem Stream erscheint eine Fehlermeldung. Eine Analyse wird erst nach `response.completed` angezeigt.

## Voraussetzungen und Kosten

Die direkte Abo-Nutzung setzt ein von OpenAI berechtigtes Konto und eine zulässige Installation voraus. Die Dokumentation nennt für diese Integration Plus und Pro. Eine erfolgreiche Identitätsanmeldung allein genügt nicht: Das Dashboard prüft die erteilte `chatgpt.tokens.use.direct`-Berechtigung und lädt die Modelle des Kontos. OpenAI kann Anwendungsfreigaben einschränken; ein Login ist keine garantierte Zulassung für beliebige gehostete Produkte.

Die Analysen verbrauchen das bestehende Abo-Kontingent, das mit anderen Apps geteilt wird. **Zusätzliche ChatGPT-Credits müssen in ChatGPT für die Verbindung deaktiviert bleiben, wenn keine Zusatzkosten gewünscht sind.** Das Dashboard kann diese Einstellung nicht auslesen oder ändern und kauft keine Credits. Vor der Anmeldung bestätigt der Nutzer diese Einstellung. Bei ausgeschöpftem Kontingent warten oder in ChatGPT die Freigabe prüfen. Keine Zahlungsdaten im Dashboard eingeben.

Free-Nutzer können „Analyse für ChatGPT kopieren“ verwenden und die Anfrage manuell innerhalb ihrer ChatGPT-Limits stellen.

## Lokal

1. Dashboard starten, Einstellungen öffnen.
2. Credit-Einstellung prüfen und bestätigen, dann „Continue with ChatGPT“ wählen.
3. Im OpenAI-Fenster eigenes Konto auswählen und Abo-Nutzung erlauben.
4. Zum Dashboard zurückkehren. Der Status wird automatisch geprüft.

Der Rückruf-Listener startet vor der Anmeldung auf `127.0.0.1:1455`. Falls der Port belegt ist, andere Anmeldung beenden oder `CHATGPT_CALLBACK_PORT` ändern. Es ist kein Client-Secret nötig. Die eigentliche Analyse startet nur durch einen Klick, niemals bei automatischen Dashboard-Updates.

## Eigene Synology

Die Docker-Konfiguration veröffentlicht den Callback-Port ausschließlich an der Loopback-Schnittstelle der NAS. Der Browser-Rückruf muss durch einen SSH-Tunnel vom Mac zur NAS gelangen. Vor dem Verbinden im Terminal auf dem Mac ausführen:

```sh
ssh -N -L 18085:127.0.0.1:18085 BENUTZER@SYNOLOGY
```

SSH-Hostschlüssel wie üblich prüfen. Benutzer und Host durch die eigenen Werte ersetzen. Danach im Dashboard anmelden; der OpenAI-Rückruf an `http://127.0.0.1:18085/auth/callback` erreicht den Listener auf der Synology. Nach erfolgreicher Anmeldung den Tunnel mit Ctrl-C schließen. Analysen und Token-Erneuerung laufen anschließend auf der Synology weiter, ohne Tunnel.

Standardmäßig wird der Callback-Port aus dem Webport gebildet: 8085 → 18085, 8086 → 18086. Dadurch kollidieren bestehende getrennte Container nicht. Die mitgelieferte Compose-Konfiguration verwendet dafür Webports zwischen 1024 und 9999. Bei einer eigenen Compose-Konfiguration müssen Callback-Listener und Portfreigabe denselben freien Port verwenden. Im Tunnel dann denselben Port an beiden Stellen verwenden. Port niemals öffentlich im Router freigeben. Der Callback-Port ist nicht die Dashboard-Webadresse. Die Container bleiben pro Nutzer getrennt; keine gemeinsame Plus-Nutzung.

Der Docker-Listener bindet innerhalb des Containers an `0.0.0.0`, der veröffentlichte NAS-Port ausdrücklich nur an `127.0.0.1`. Container-Netzwerke entsprechend privat halten. Außerhalb von Docker bleibt der Listener standardmäßig auf Loopback.

## Datenschutz und Sicherheit

`chatgpt-auth.json` liegt außerhalb des Repository im Dashboard-Datenverzeichnis (auf Docker `/data`), mit Dateirechten `0600`. Diese Datei enthält sensible Tokens und darf niemals ins Repository, in Supportnachrichten oder in öffentlich zugängliche Backups gelangen. Auch im Modus `CREDENTIALS_STORAGE=memory` werden ChatGPT-Tokens bewusst auf der NAS gespeichert, damit die Verbindung nach einem Neustart besteht. Nur der Server verarbeitet Tokens; der Browser erhält Status und Kontobezeichnung.

Jede Installation behält eine stabile Host-ID. Registrierungen und Zugangsdaten werden pro ChatGPT-Konto getrennt gespeichert. Kontowechsel ist in den Einstellungen möglich. „Verbindung trennen“ widerruft die erneuerbare Sitzung und löscht lokale Tokens; falls der Widerruf nicht bestätigt werden kann, weist das Dashboard auf die zusätzliche Trennung in ChatGPT hin.

An OpenAI gehen nur ausgewählte öffentliche Kurse, Nachrichten, Quellen, Zeitstempel sowie Anlagehorizont, Risikoneigung und die optionale Frage. Keine Portfolio-Bestände, Einzahlungen, Transaktionen oder Bitpanda-Keys. Keine privaten Finanzdaten in die Freitextfrage schreiben. Es werden keine Orders ausgeführt. Fehlende Fundamentaldaten müssen in der Analyse als Einschränkung erscheinen.

Die Verbindung ist mit simulierten, kryptographisch signierten OAuth-Antworten getestet. Der erste echte Login und die tatsächliche Kontoberechtigung müssen vom jeweiligen Nutzer bei OpenAI bestätigt werden.

Offizielle Referenzen:
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions

## Trade- und Anlagehorizonte

Auswahl von wenigen Tagen über 1–2 bzw. 2–4 Wochen bis zu Monaten und mehrjährigen Anlagen. Standard: 2–4 Wochen. Kurzfristige Analysen betrachten Momentum, Volatilität, Liquidität, Spread/Gebühren und bevorstehende Ereignisse sowie bedingte Ein- und Ausstiegsszenarien. Ohne ausreichende aktuelle Kursdaten darf die KI keine konkreten Kursmarken erfinden. Auch die kopierte Anfrage für Free-Nutzer berücksichtigt diesen Zeitraum.

## Denkstufe

Neben der Modellwahl kann die Denkstufe eingestellt werden. Angeboten werden die im aktuellen Konto-Modellkatalog ausgewiesenen, für Responses gültigen Stufen (z. B. low, medium, high, xhigh, max). „Modellstandard“ sendet keinen reasoning-Parameter und zeigt den vom Katalog gemeldeten Standard, sofern vorhanden. Fehlen Modellangaben, bleibt nur Modellstandard verfügbar. Beim Modellwechsel wird die Auswahl zurückgesetzt; der Server validiert die Stufe erneut vor jeder Analyse. Höhere Stufen können mehr Zeit und Abo-Kontingent benötigen.

# Bitpanda Dashboard auf Synology DSM 7.1.1 mit Tailscale

Diese Anleitung verwendet die Synology-Pakete **Docker** und **Tailscale**. Ab DSM
7.2 heißt der Docker-Nachfolger **Container Manager**. Falls **Docker** unter DSM
7.1.1 nicht angeboten wird, unterstützt das konkrete NAS-Modell Docker nicht.

## 1. Docker und Projektordner vorbereiten

1. In DSM **Paket-Zentrum → Alle Pakete → Docker → Installieren** öffnen.
2. In **File Station** den Ordner `docker/bitpanda-dashboard` erstellen.
3. Das Versand-ZIP auf den Computer laden, entpacken und den Inhalt des Ordners
   `Bitpanda-Dashboard` nach `docker/bitpanda-dashboard` hochladen.
4. In **Systemsteuerung → Terminal & SNMP → Terminal** den SSH-Dienst vorübergehend
   aktivieren. Den dort angezeigten SSH-Port merken.

## 2. Über das Mac-Terminal verbinden

`NAS_IP` und bei Bedarf den SSH-Port ersetzen:

```bash
ssh -p 22 DEIN_DSM_BENUTZER@NAS_IP
```

Zum Projekt wechseln. Liegt der gemeinsame Ordner `docker` auf `volume1`, lautet
der Befehl:

```bash
cd /volume1/docker/bitpanda-dashboard
```

## 3. Erste Benutzerinstanz einrichten

```bash
cp .env.synology.example .env
vi .env
```

In `vi` mit `i` bearbeiten. Für deine Instanz beispielsweise:

```text
CONTAINER_NAME=bitpanda-dashboard-nico
DASHBOARD_PORT=8085
DASHBOARD_DATA_PATH=./data-nico
```

Danach mit `Esc`, `:wq` und Enter speichern. Das persönliche Benutzerkonto wird
später vom jeweiligen Benutzer selbst im Browser eingerichtet. Containername, Port
und Datenordner müssen pro Person eindeutig sein.

## 4. Container bauen und starten

Auf DSM 7.1 lautet der Compose-Befehl normalerweise `docker-compose`:

```bash
sudo docker-compose up -d --build
```

Falls nur die neuere Schreibweise verfügbar ist:

```bash
sudo docker compose up -d --build
```

Status und Protokoll prüfen:

```bash
sudo docker ps
sudo docker logs --tail 100 bitpanda-dashboard-nico
```

## 5. Im Browser öffnen

```text
http://NAS_IP:8085
```

Beim ersten Öffnen erscheint **Eigenes Konto einrichten**. Dort legst du selbst
Benutzername und Passwort fest. Auf der Synology wird nur ein gesalzener
Passwort-Hash gespeichert. Danach in den Dashboard-Einstellungen den eigenen
Bitpanda-Key und optional den Finnhub-Key eintragen. Die API-Keys werden lokal in diesem Browser gespeichert und in den
Arbeitsspeicher des zugehörigen Containers übertragen. Auf der Synology werden sie
nicht in eine Datei geschrieben. Nach einem NAS- oder Container-Neustart genügt es,
das Dashboard wieder in diesem Browser zu öffnen; der Browser aktiviert die Keys
automatisch. Auf einem neuen Gerät müssen sie einmalig eingegeben werden.

Cache-Dateien und Portfolio-Snapshots liegen ohne API-Keys dauerhaft unter:

```text
/volume1/docker/bitpanda-dashboard/data-nico
```

Dieser Ordner sollte in das NAS-Backup aufgenommen werden.

Innerhalb jeder getrennten Benutzerinstanz liegt der aktive Verlauf im stabilen
Unterordner `account`. Er hängt bewusst nicht vom API-Key ab: Wird ein Key erneuert,
bleiben Chart und manuelle Korrekturen erhalten. Beim ersten Start dieser Version
übernimmt das Backend automatisch den vorhandenen Key-basierten Datenbestand mit den
meisten Portfolio-Messpunkten. Die alten Ordner werden dabei als zusätzliche
Rückfallebene nicht gelöscht.

## 6. Firewall und dauerhafter Betrieb

Wenn die DSM-Firewall aktiv ist, unter **Systemsteuerung → Sicherheit → Firewall**
eine Regel für TCP-Port `8085` aus dem lokalen Heimnetz hinzufügen. Keine
Portweiterleitung im Router anlegen.

Port `8085` verwendet zunächst HTTP. Der Passwortschutz verhindert fremden Zugriff,
verschlüsselt die Verbindung aber nicht. Für Zugriff außerhalb eines vollständig
vertrauenswürdigen Heimnetzes einen Synology Reverse Proxy mit HTTPS-Zertifikat oder
eine VPN-Verbindung verwenden; den Port nicht direkt ins Internet weiterleiten.

Der Container startet nach einem NAS-Neustart automatisch. Sobald das Dashboard
einmal im hinterlegten Browser geöffnet wurde, werden dessen Keys wieder in den
Arbeitsspeicher übertragen. Danach läuft die minütliche Portfolioaufzeichnung auch
ohne geöffneten Browser weiter.

## Updates mit automatischer Datensicherung

Auf dem Mac kann `Synology aktualisieren.command` per Doppelklick gestartet werden.
Das Synology-Passwort wird einmal beim Öffnen abgefragt und nur im Arbeitsspeicher
dieses laufenden Terminal-Prozesses gehalten. Nach einem Update kann mit `R` sofort
ein weiteres vollständiges Update inklusive Datensicherung gestartet werden, ohne
das Passwort erneut einzugeben. Mit Enter wird das Terminalfenster geschlossen.
Beim nächsten Öffnen der `.command`-Datei wird das Passwort wieder neu abgefragt.
Vor jedem Container-Neubau prüft das Script, ob Nico und Josi weiterhin die
erwarteten Datenordner `data-nico` und `data-josi` verwenden. Bei einer Abweichung
bricht es ab. Anschließend legt es außerhalb des Projektordners Sicherungen an:

```text
/volume1/docker/Bitpanda-Dashboard-backups/ZEITSTEMPEL-data-nico.tar.gz
/volume1/docker/Bitpanda-Dashboard-backups/ZEITSTEMPEL-data-josi.tar.gz
```

Diese Archive enthalten Anmeldung, Cache und Portfolioverlauf, aber keine API-Keys.
Die API-Keys bleiben ausschließlich in den jeweiligen Browsern und im Arbeitsspeicher
des laufenden Containers. Der Backup-Ordner darf bei einem Projektupdate nicht
gelöscht werden.

Nach erfolgreicher Einrichtung kann der SSH-Dienst in DSM wieder deaktiviert werden.

## 7. Weitere Person mit eigenem Bitpanda-Konto anlegen

Für jede Person läuft eine getrennte Instanz. Dadurch bleiben API-Key, Anmeldung,
Cache und Portfolioverlauf vollständig getrennt. Die Instanz deines Vaters heißt
`josi`:

```bash
cp .env.synology.example .env.josi
vi .env.josi
```

Inhalt:

```text
CONTAINER_NAME=bitpanda-dashboard-josi
DASHBOARD_PORT=8086
DASHBOARD_DATA_PATH=./data-josi
```

Zweite Instanz starten:

```bash
sudo docker-compose --env-file .env.josi -p bitpanda-josi up -d --build
```

Oder mit der neueren Schreibweise:

```bash
sudo docker compose --env-file .env.josi -p bitpanda-josi up -d --build
```

Dein Vater öffnet `http://NAS_IP:8086`. Beim ersten Öffnen legt er Benutzername und
Passwort selbst fest und gibt danach seinen Bitpanda-Key einmalig ein. Dein Browser
auf Port `8085` speichert nur deinen Key; sein Browser auf Port `8086` speichert nur
seinen Key. Weitere Personen
erhalten jeweils einen neuen Port (`8087`, `8088`, …), Containernamen, Datenordner
und eine eigene `.env.NAME`-Datei.

Die Browser-Keys liegen auf dem jeweiligen Endgerät im lokalen Browserspeicher.
Daher nur persönliche, geschützte Geräte verwenden.

## 8. Tailscale auf der Synology installieren

1. In DSM **Paket-Zentrum → Alle Pakete** öffnen.
2. Nach **Tailscale** suchen und das offizielle Paket installieren.
3. Tailscale aus dem DSM-Hauptmenü öffnen.
4. **Log in** beziehungsweise **Authenticate** wählen.
5. Den angezeigten Link öffnen und sich mit dem gewünschten Tailscale-Konto
   anmelden. Falls noch kein Konto besteht, wird dabei ein kostenloses persönliches
   Tailnet angelegt.
6. Nach der Anmeldung prüfen, ob die Synology in Tailscale als verbunden erscheint.

Für den eingehenden Zugriff auf das Dashboard ist unter DSM 7 keine zusätzliche
TUN-Konfiguration nötig. Diese wäre nur notwendig, wenn andere Anwendungen auf der
Synology ausgehend auf weitere Geräte im Tailnet zugreifen sollten.

## 9. Tailscale auf Mac, iPhone oder iPad installieren

1. Tailscale auf jedem Gerät installieren, von dem das Dashboard erreichbar sein
   soll.
2. Weitere Personen in der Tailscale-Adminoberfläche als Benutzer in das Tailnet
   einladen. Sie melden sich anschließend mit ihrem eigenen Tailscale-Konto an.
3. Tailscale auf dem jeweiligen Gerät einschalten.

Die Tailscale-IP der Synology beginnt normalerweise mit `100.`. Sie steht in der
Tailscale-App, in der Synology-Tailscale-Oberfläche oder unter
`https://login.tailscale.com/admin/machines`.

## 10. Dashboard von außerhalb öffnen

Mit aktivem Tailscale folgende Adresse im Browser aufrufen:

```text
http://TAILSCALE_IP_DER_SYNOLOGY:8085
```

Beispiel:

```text
http://100.84.23.17:8085
```

Der Browser zeigt die normale Dashboard-Anmeldung mit dem selbst festgelegten
Benutzernamen und Passwort. Die
Verbindung läuft durch den verschlüsselten Tailscale-Tunnel; im Router ist keine
Portweiterleitung erforderlich. Das funktioniert über Mobilfunk, fremdes WLAN und
andere Internetverbindungen.

Wenn MagicDNS im Tailnet aktiv ist, funktioniert häufig auch der Tailscale-Gerätename:

```text
http://NAME-DER-SYNOLOGY:8085
```

Die numerische Tailscale-IP ist für den ersten Test eindeutiger.

Die Benutzerinstanzen unterscheiden sich durch den Port:

```text
http://TAILSCALE_IP:8085   dein Dashboard
http://TAILSCALE_IP:8086   Dashboard des Vaters
```

## 11. Synology-Firewall für Tailscale

Ist die DSM-Firewall eingeschaltet, eine zusätzliche Erlaubnisregel anlegen:

- Quelle: Subnetz `100.64.0.0`
- Subnetzmaske: `255.192.0.0`
- Zielport: TCP `8085` und alle weiteren vergebenen Dashboard-Ports
- Aktion: Zulassen

Die Zulassen-Regel muss oberhalb einer allgemeinen Sperrregel stehen. Ist die
DSM-Firewall ausgeschaltet, ist dieser Schritt nicht erforderlich.

## 12. Verhalten nach einem Neustart

Docker und Tailscale starten mit der Synology. Der Dashboard-Container läuft durch
`restart: unless-stopped` ebenfalls wieder an. Die API-Keys werden bewusst nicht auf
der Synology gespeichert. Nach einem NAS- oder Container-Neustart öffnet jede Person
ihre Dashboard-Adresse einmal in dem Browser, in dem der Key hinterlegt wurde. Der
Browser aktiviert ihn automatisch; eine erneute manuelle Eingabe ist nicht nötig.
Anschließend läuft die minütliche Aufzeichnung wieder ohne geöffneten Browser weiter.

## 13. Tailscale testen

1. WLAN am Smartphone ausschalten und Mobilfunk verwenden.
2. Tailscale am Smartphone einschalten.
3. `http://TAILSCALE_IP:8085` öffnen.
4. Mit dem Dashboard-Benutzernamen und Passwort anmelden.

Schlägt der Test fehl, nacheinander prüfen:

- Tailscale zeigt Synology und Smartphone als verbunden.
- Der Container erscheint bei `sudo docker ps` als aktiv.
- `http://NAS_IP:8085` funktioniert im Heimnetz.
- Die DSM-Firewall erlaubt `100.64.0.0/10` auf TCP-Port `8085`.
- Im Router existiert keine Portweiterleitung; sie wird nicht benötigt.

## 14. Aktualisieren oder stoppen

Nach dem Hochladen einer neuen Projektversion:

```bash
cd /volume1/docker/bitpanda-dashboard
sudo docker-compose up -d --build
```

Stoppen, ohne die Daten zu löschen:

```bash
sudo docker-compose down
```

Die getrennten Datenordner wie `data-nico` und `data-josi` werden dabei nicht entfernt.

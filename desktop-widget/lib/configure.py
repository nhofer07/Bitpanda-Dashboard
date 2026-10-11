#!/usr/bin/env python3
"""Configure addresses and store dashboard sessions without saving passwords."""
import getpass
import json
from pathlib import Path
import urllib.request
from portfolio import STATE, settings, client, get

config = settings()
print('Bitpanda Desktop-Widget · Verbindungen einrichten\n')
for key, label in [('homeUrl','Heimnetz-Adresse'), ('remoteUrl','Synology-Adresse unterwegs'), ('localUrl','Lokale Vorschau')]:
    current = config.get(key, '')
    answer = input(f'{label} [{current or "noch nicht eingerichtet"}]: ').strip()
    if answer == '-':
        config[key] = ''
    elif answer:
        from urllib.parse import urlparse
        url = urlparse(answer)
        if url.scheme not in ['http','https'] or not url.hostname or url.username or url.password:
            raise SystemExit('Bitte eine HTTP/HTTPS-Adresse ohne Zugangsdaten verwenden.')
        config[key] = answer.rstrip('/')
(STATE / 'config.json').write_text(json.dumps(config, indent=2))
(STATE / 'config.json').chmod(0o600)
for key in ['homeUrl','remoteUrl']:
    base = config.get(key, '').rstrip('/')
    if not base:
        continue
    opener, jar = client(key)
    try:
        auth = get(opener, base + '/api/auth/status', 6)
        if not all(isinstance(auth.get(k), bool) for k in ['required','configured','authenticated']):
            print('Die Adresse antwortet nicht als Bitpanda-Dashboard.'); continue
        if auth['authenticated']:
            print(f'{base}: verbunden'); continue
        if not auth['configured']:
            print('Bitte das Dashboard zuerst im Browser einrichten.'); continue
        if input(f'Bei {base} anmelden? [j/N]: ').lower() != 'j':
            continue
        username = input('Dashboard-Benutzername: ').strip()
        password = getpass.getpass('Dashboard-Passwort: ')
        body = json.dumps({'username':username,'password':password}).encode()
        request = urllib.request.Request(base + '/api/auth/login', data=body, headers={'Content-Type':'application/json'})
        with opener.open(request, timeout=15) as response:
            result = json.load(response)
        del password, body, request
        if not result.get('authenticated'):
            print('Anmeldung fehlgeschlagen.'); continue
        jar.save(ignore_discard=True, ignore_expires=True)
        Path(jar.filename).chmod(0o600)
        print('Angemeldet. Nur die Sitzung wird lokal gespeichert, kein Passwort.')
    except Exception:
        print(f'{base}: derzeit nicht erreichbar oder Anmeldung fehlgeschlagen.')
print('\nFertig. Das Widget aktualisiert sich innerhalb einer Minute.')

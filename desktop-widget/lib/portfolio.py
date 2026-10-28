#!/usr/bin/env python3
"""Read-only desktop widget data, with LAN/remote/local failover."""
import datetime as dt
import http.cookiejar
import json
import math
import os
from pathlib import Path
import sys
import urllib.request
from zoneinfo import ZoneInfo

STATE = Path.home() / '.bitpanda-dashboard' / 'desktop-widget'
ZONE = ZoneInfo('Europe/Vienna')


def stamp(value):
    try:
        return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError):
        return None


def summarize(data, overrides=None, now=None):
    now = now or dt.datetime.now(ZONE)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    loaded = stamp(data.get('loadedAt'))
    value = data.get('portfolio', {}).get('totalValue')
    if loaded is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Kein gültiger Portfoliowert')
    chart = data.get('chart')
    if isinstance(chart, dict) and chart.get('version') == 1 and chart.get('periodLabel') != '24 Stunden':
        points = chart.get('points')
        if not isinstance(points, list) or any(not isinstance(p, dict) or any(not isinstance(p.get(k), (int, float)) or not math.isfinite(p[k]) for k in ('time', 'value')) or p['time'] > now.timestamp() for p in points):
            raise ValueError('Ungültiger geprüfter Chart')
        current_day = dt.datetime.fromtimestamp(loaded, ZONE).date() == now.date()
        adjusted = [[p['time'], p['value']] for p in sorted(points, key=lambda p: p['time'])] if current_day else []
        return dict(value=value, loadedAt=data['loadedAt'], points=adjusted,
                    change=chart.get('change') if len(adjusted) > 1 else None,
                    percent=chart.get('percent') if len(adjusted) > 1 else None,
                    completeDay=chart.get('completeDay', False), periodLabel=chart.get('periodLabel'),
                    chartLastPointAt=chart.get('lastPointAt'), correctionCount=len(chart.get('corrections', [])),
                    preview=data.get('cache', {}).get('status') == 'local-preview')
    points = {}
    recording_start = stamp(data.get('portfolioHistoryStartedAt')) or 0
    for item in data.get('snapshots', []):
        time = stamp(item.get('createdAt'))
        amount = item.get('totalValue')
        if time is not None and recording_start <= time <= now.timestamp() and isinstance(amount, (int, float)) and math.isfinite(amount):
            points[time] = amount
    points[loaded] = value
    today = sorted((t, v) for t, v in points.items() if start <= t <= now.timestamp())
    previous = sorted((t, v) for t, v in points.items() if t < start)
    has_baseline = bool(previous) or bool(today and today[0][0] == start)
    if today and previous and today[0][0] > start:
        today.insert(0, (start, previous[-1][1]))
    flows = []
    for item in data.get('transactions', []):
        a = item.get('attributes') or {}
        time = stamp((a.get('time') or {}).get('date_iso8601') or a.get('created_at') or item.get('created_at'))
        try:
            amount = abs(float(a.get('amount') or 0))
        except (ValueError, TypeError):
            continue
        fallback = 'deposit' if a.get('type') == 'deposit' and a.get('in_or_out') == 'incoming' else 'expense' if a.get('type') in ['withdrawal', 'transfer'] and a.get('in_or_out') == 'outgoing' else 'ignore'
        kind = (overrides or {}).get(item.get('id'), fallback)
        signed = amount if kind == 'deposit' else -amount if kind in ['withdrawal', 'expense', 'transfer'] else (-amount if fallback == 'deposit' else amount) if kind == 'refund' else 0
        if today and time is not None and today[0][0] < time <= today[-1][0] and math.isfinite(signed):
            flows.append((time, signed))
    total_flow = sum(v for _, v in flows)
    adjusted = [[t, v - sum(f for ft, f in flows if ft <= t) + total_flow] for t, v in today]
    change = adjusted[-1][1] - adjusted[0][1] if len(adjusted) > 1 else None
    percent = change / today[0][1] * 100 if change is not None and today[0][1] else None
    return dict(value=value, loadedAt=data['loadedAt'], points=adjusted, change=change, percent=percent,
                completeDay=has_baseline, preview=data.get('cache', {}).get('status') == 'local-preview')


def settings():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = STATE / 'config.json'
    if not path.exists():
        path.write_text(json.dumps({'homeUrl':'http://192.168.0.147:8085', 'remoteUrl':'', 'localUrl':'http://127.0.0.1:3001'}, indent=2))
        path.chmod(0o600)
    return json.loads(path.read_text())


def client(label):
    jar = http.cookiejar.LWPCookieJar(str(STATE / (label + '-session')))
    try:
        jar.load(ignore_discard=True, ignore_expires=True)
    except (OSError, http.cookiejar.LoadError):
        pass
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar


def get(opener, url, timeout):
    with opener.open(urllib.request.Request(url, headers={'Accept':'application/json', 'Cache-Control':'no-cache'}), timeout=timeout) as r:
        return json.load(r)


def refresh():
    config = settings()
    problems = []
    for label, key, timeout in [('Heimnetz','homeUrl',2), ('Synology','remoteUrl',6), ('Lokal','localUrl',4)]:
        base = config.get(key, '').strip().rstrip('/')
        if not base:
            continue
        opener, jar = client(key)
        try:
            # Recognize the dashboard before requesting any portfolio information.
            auth = get(opener, base + '/api/auth/status', timeout)
            if not all(isinstance(auth.get(k), bool) for k in ['required','configured','authenticated']):
                raise ValueError('Kein Bitpanda-Dashboard')
            if not auth['authenticated']:
                problems.append(label + ': Anmeldung erforderlich')
                continue
            data = get(opener, base + '/api/dashboard-data', max(timeout, 15))
            overrides = get(opener, base + '/api/cashflow-overrides', timeout)
            if not isinstance(overrides, dict):
                raise ValueError('Cashflow-Korrekturen fehlen')
            result = summarize(data, overrides.get("overrides", overrides))
            result.update(source=label, url=base, offline=False, remoteConfigured=bool(config.get('remoteUrl')))
            jar.save(ignore_discard=True, ignore_expires=True)
            Path(jar.filename).chmod(0o600)
            cache = STATE / 'last-value.json'
            cache.write_text(json.dumps(result))
            cache.chmod(0o600)
            return result
        except Exception:
            problems.append(label + ': nicht erreichbar')
    try:
        result = json.loads((STATE / 'last-value.json').read_text())
        result.update(offline=True, notice=' · '.join(problems))
        if dt.datetime.fromtimestamp(stamp(result['loadedAt']), ZONE).date() != dt.datetime.now(ZONE).date():
            result.update(points=[], change=None, percent=None)
        return result
    except (OSError, ValueError, TypeError):
        return {'offline':True, 'points':[], 'notice':' · '.join(problems) or 'Verbindung konfigurieren'}


if __name__ == '__main__':
    print(json.dumps(refresh()))

#!/bin/bash

# Double-click launcher for the complete local dashboard.
set -euo pipefail

LAUNCHER_DIR="$(cd "$(dirname "$0")" && pwd)"

# The launcher may live directly on the Desktop while the project stays in
# the "Bitpanda-Dashboard" folder next to it.
if [ -f "$LAUNCHER_DIR/backend/package.json" ] && [ -f "$LAUNCHER_DIR/frontend/package.json" ]; then
  ROOT_DIR="$LAUNCHER_DIR"
elif [ -f "$LAUNCHER_DIR/Bitpanda-Dashboard/backend/package.json" ] && [ -f "$LAUNCHER_DIR/Bitpanda-Dashboard/frontend/package.json" ]; then
  ROOT_DIR="$LAUNCHER_DIR/Bitpanda-Dashboard"
else
  printf 'Der Ordner „Bitpanda-Dashboard“ wurde neben dieser Starter-Datei nicht gefunden.\n'
  read -r -p 'Enter zum Schließen …'
  exit 1
fi
BACKEND_PORT=3001
FRONTEND_PORT=5173
STARTED_PIDS=()

cleanup() {
  if [ "${#STARTED_PIDS[@]}" -gt 0 ]; then
    printf '\nDashboard wird beendet …\n'
    kill "${STARTED_PIDS[@]}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

port_is_open() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port() {
  local port="$1"
  # Cloudflare braucht je nach Netzwerk gelegentlich mehr als zehn Sekunden,
  # bis die zufällige Adresse zurückgemeldet wird.
  for _ in {1..150}; do
    port_is_open "$port" && return 0
    sleep 0.2
  done
  return 1
}

printf '\n'
printf '  ____ ___ _____ ____   _    _   _ ____    _  \n'
printf '  | __ )_ _|_   _|  _ \\ / \\  | \\ | |  _ \\  / \\ \n'
printf '  |  _ \\| | | | | |_) / _ \\ |  \\| | | | |/ _ \\\n'
printf '  | |_) | | | | |  __/ ___ \\| |\\  | |_| / ___ \\\n'
printf '  |____/___| |_| |_| /_/   \\_\\_| \\_|____/_/   \\_\\\n'
printf '  ____    _    ____  _   _ ____   ___    _    ____  ____\n'
printf '  |  _ \\  / \\  / ___|| | | | __ ) / _ \\  / \\  |  _ \\|  _ \\\n'
printf '  | | | |/ _ \\ \\___ \\| |_| |  _ \\| | | |/ _ \\ | |_) | | | |\n'
printf '  | |_| / ___ \\ ___) |  _  | |_) | |_| / ___ \\|  _ <| |_| |\n'
printf '  |____/_/   \\_\\____/|_| |_|____/ \\___/_/   \\_\\_| \\_\\____/\n'
printf '  BITPANDA DASHBOARD · Starte Dienste …\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js ist nicht installiert. Bitte Node.js installieren und erneut starten.\n'
  read -r -p 'Enter zum Schließen …'
  exit 1
fi

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  printf '  → Installiere Backend-Abhängigkeiten …\n'
  if ! (cd "$ROOT_DIR/backend" && npm install); then
    printf 'Die Backend-Installation konnte nicht abgeschlossen werden.\n'
    read -r -p 'Enter zum Schließen …'
    exit 1
  fi
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  printf '  → Installiere Dashboard-Abhängigkeiten …\n'
  if ! (cd "$ROOT_DIR/frontend" && npm install); then
    printf 'Die Dashboard-Installation konnte nicht abgeschlossen werden.\n'
    read -r -p 'Enter zum Schließen …'
    exit 1
  fi
fi

if port_is_open "$BACKEND_PORT"; then
  printf '  ✓ Backend läuft bereits auf http://localhost:%s\n' "$BACKEND_PORT"
else
  printf '  → Starte Backend …\n'
  (
    cd "$ROOT_DIR/backend"
    npm start
  ) &
  STARTED_PIDS+=("$!")
  if ! wait_for_port "$BACKEND_PORT"; then
    printf 'Backend konnte nicht gestartet werden.\n'
    read -r -p 'Enter zum Schließen …'
    exit 1
  fi
fi

if port_is_open "$FRONTEND_PORT"; then
  printf '  ✓ Dashboard läuft bereits auf http://localhost:%s\n' "$FRONTEND_PORT"
else
  printf '  → Starte Dashboard …\n'
  (
    cd "$ROOT_DIR/frontend"
    npm run dev -- --host 127.0.0.1
  ) &
  STARTED_PIDS+=("$!")
  if ! wait_for_port "$FRONTEND_PORT"; then
    printf 'Dashboard konnte nicht gestartet werden.\n'
    read -r -p 'Enter zum Schließen …'
    exit 1
  fi
fi

printf '\n  ✓ Bereit: http://localhost:%s\n' "$FRONTEND_PORT"
printf '  [q] Beenden\n\n'

open "http://localhost:${FRONTEND_PORT}"

# Keep the Terminal window alive even when both services were already running.
# Closing it or pressing q stops only the services this launcher started itself.
while IFS= read -r -s -n 1 key; do
  case "$key" in
    q|Q)
      cleanup
      trap - EXIT INT TERM
      exec "${SHELL:-/bin/zsh}" -l
      ;;
  esac
done

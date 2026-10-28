#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAS_HOST="${SYNOLOGY_HOST:-192.168.0.147}"
NAS_USER="Nico Hofer"
REMOTE_DIR="/volume1/docker/Bitpanda-Dashboard"
BACKUP_DIR="/volume1/docker/Bitpanda-Dashboard-backups"
SSH_KEY="$HOME/.ssh/synology_bitpanda"
SSH_OPTIONS=(-o ServerAliveInterval=30)
TEMP_DIR=""
SYNOLOGY_PASSWORD=""

if [ -f "$SSH_KEY" ]; then
  SSH_OPTIONS+=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o AddKeysToAgent=yes -o UseKeychain=yes)
fi

finish() {
  status=$?
  trap - EXIT INT TERM
  unset SYNOLOGY_PASSWORD
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    /bin/rm -rf -- "$TEMP_DIR"
  fi
  # A .command file normally leaves Terminal's "process completed" window open,
  # depending on the user's profile settings. Close only the exact Terminal
  # window that ran this updater after the shell has had time to exit.
  if [ "${TERM_PROGRAM:-}" = "Apple_Terminal" ] && [ "${KEEP_UPDATE_WINDOW:-0}" != "1" ]; then
    terminal_tty="$(tty)"
    /usr/bin/osascript - "$terminal_tty" >/dev/null 2>&1 <<'APPLESCRIPT' &
on run argv
  delay 0.6
  set targetTty to item 1 of argv
  tell application "Terminal"
    repeat with terminalWindow in windows
      repeat with terminalTab in tabs of terminalWindow
        if tty of terminalTab is targetTty then
          close terminalWindow
          return
        end if
      end repeat
    end repeat
  end tell
end run
APPLESCRIPT
  fi
  exit "$status"
}

trap finish EXIT INT TERM

cd "$SCRIPT_DIR"

if [ ! -f "scripts/package-release.py" ] || [ ! -f "docker-compose.yml" ]; then
  printf 'Dieses Script muss im Ordner „Bitpanda-Dashboard“ liegen.\n'
  exit 1
fi

for command in python3 node npm ditto tar ssh expect; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Benötigtes Programm fehlt: %s\n' "$command"
    exit 1
  fi
done

run_with_synology_password() {
  SYNOLOGY_PASSWORD="$SYNOLOGY_PASSWORD" expect -f - -- "$@" <<'EXPECT_SCRIPT'
set timeout -1
set password $env(SYNOLOGY_PASSWORD)
set command $argv
spawn {*}$command
expect {
  -re {(?i)(password|passwort):[ ]*$} {
    send -- "$password\r"
    exp_continue
  }
  eof
}
set result [wait]
exit [lindex $result 3]
EXPECT_SCRIPT
}

if [ -t 1 ]; then clear; fi
printf '\n╭────────────────────────────────────────╮\n'
printf '│  Bitpanda Dashboard · Synology-Update  │\n'
printf '╰────────────────────────────────────────╯\n\n'
printf 'Synology-Passwort (Eingabe bleibt unsichtbar): '
IFS= read -r -s SYNOLOGY_PASSWORD
printf '\n\n'
if [ -z "$SYNOLOGY_PASSWORD" ]; then
  printf 'Es wurde kein Passwort eingegeben.\n'
  exit 1
fi

perform_update() (
set -euo pipefail
TEMP_DIR=""
UPDATE_LOG="$(mktemp /tmp/bitpanda-synology-update-log.XXXXXX)"
TOTAL_STEPS=15
case "${1:-nico}" in
  nico) PERSON='Nico'; CONTAINER='bitpanda-dashboard-nico'; DATA_NAME='data-nico'; COMPOSE_ENV='.env'; COMPOSE_PROJECT='bitpanda-dashboard' ;;
  josi) PERSON='Josi'; CONTAINER='bitpanda-dashboard-josi'; DATA_NAME='data-josi'; COMPOSE_ENV='.env.josi'; COMPOSE_PROJECT='bitpanda-josi' ;;
  *) printf 'Unbekanntes Update-Ziel.\n'; exit 1 ;;
esac
CURRENT_STEP=0
CURRENT_LABEL=""
cleanup_update() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    /bin/rm -rf -- "$TEMP_DIR"
  fi
  if [ "${KEEP_UPDATE_LOG:-0}" != "1" ]; then
    /bin/rm -f -- "$UPDATE_LOG"
  fi
}
show_update_error() {
  status=$?
  if [ "$status" -ne 0 ]; then
    KEEP_UPDATE_LOG=1
    printf '\nFehler bei Schritt %s/%s: %s\n' "$CURRENT_STEP" "$TOTAL_STEPS" "$CURRENT_LABEL"
    printf 'Vollständiges Protokoll: %s\n' "$UPDATE_LOG"
    printf '\nTechnische Details (letzte Zeilen):\n'
    tail -n 24 "$UPDATE_LOG" 2>/dev/null || true
  fi
  cleanup_update
  exit "$status"
}
trap show_update_error EXIT INT TERM

draw_progress() {
  percent=$((CURRENT_STEP * 100 / TOTAL_STEPS))
  filled=$((percent / 5))
  empty=$((20 - filled))
  filled_bar="$(printf '%*s' "$filled" '' | tr ' ' '█')"
  empty_bar="$(printf '%*s' "$empty" '' | tr ' ' '░')"
  if [ -t 1 ]; then
    printf '\r\033[2K[%s%s] %3d%%  %s%s' "$filled_bar" "$empty_bar" "$percent" "$CURRENT_LABEL" "${1:-}"
  else
    printf '[%s%s] %3d%%  %s%s\n' "$filled_bar" "$empty_bar" "$percent" "$CURRENT_LABEL" "${1:-}"
  fi
}

progress() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  CURRENT_LABEL="$1"
  draw_progress
}

run_remote() {
  # Synology sudo requires a pseudo-terminal. Expect still answers all password
  # prompts from the single password kept for this updater window.
  run_with_synology_password ssh -tt "${SSH_OPTIONS[@]}" -l "$NAS_USER" "$NAS_HOST" "$1" >>"$UPDATE_LOG" 2>&1 &
  remote_pid=$!
  started_at=$SECONDS
  frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  frame=0
  while kill -0 "$remote_pid" 2>/dev/null; do
    elapsed=$((SECONDS - started_at))
    draw_progress "  ${frames[$frame]} aktiv · ${elapsed}s"
    frame=$(((frame + 1) % ${#frames[@]}))
    sleep 0.25
  done
  wait "$remote_pid"
  draw_progress
}

progress 'Frontend auf dem Mac bauen und Release prüfen'
python3 scripts/package-release.py --synology >>"$UPDATE_LOG" 2>&1

progress 'Temporären Arbeitsordner anlegen'
TEMP_DIR="$(mktemp -d /tmp/bitpanda-synology-update.XXXXXX)"

progress 'Release-Paket entpacken'
ditto -x -k "$SCRIPT_DIR/release/Bitpanda-Dashboard.zip" "$TEMP_DIR" >>"$UPDATE_LOG" 2>&1

progress 'Release-Paket prüfen'
if [ ! -f "$TEMP_DIR/Bitpanda-Dashboard/docker-compose.yml" ] || [ ! -f "$TEMP_DIR/Bitpanda-Dashboard/synology-frontend/index.html" ]; then
  printf 'Die Release-ZIP konnte nicht korrekt entpackt werden.\n' >>"$UPDATE_LOG"
  exit 1
fi

progress 'Upload-Archiv erstellen'
UPLOAD_ARCHIVE="$TEMP_DIR/Bitpanda-Dashboard.tar"
COPYFILE_DISABLE=1 tar --no-xattrs -C "$TEMP_DIR/Bitpanda-Dashboard" -cf "$UPLOAD_ARCHIVE" . >>"$UPDATE_LOG" 2>&1

progress 'Verbindung zur Synology prüfen'
run_remote "true"

progress 'Programmdateien übertragen'
run_with_synology_password scp -O "${SSH_OPTIONS[@]}" "$UPLOAD_ARCHIVE" \
  "$NAS_USER@$NAS_HOST:/tmp/Bitpanda-Dashboard-update.tar" >>"$UPDATE_LOG" 2>&1

progress 'Programmdateien installieren'
run_remote "mkdir -p '$REMOTE_DIR' && rm -rf '$REMOTE_DIR/synology-frontend' && tar -xf /tmp/Bitpanda-Dashboard-update.tar -C '$REMOTE_DIR' && rm -f /tmp/Bitpanda-Dashboard-update.tar"

REMOTE_PATH="PATH='/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' && export PATH && cd '$REMOTE_DIR'"

progress 'Docker und Compose prüfen'
run_remote "$REMOTE_PATH && command -v docker >/dev/null && command -v docker-compose >/dev/null"

progress 'Administratorzugriff bestätigen'
run_remote "$REMOTE_PATH && sudo -v"

progress "Datenordner von $PERSON prüfen"
run_remote "$REMOTE_PATH && D=\"\$(command -v docker)\" && M=\"\$(sudo \"\$D\" inspect '$CONTAINER' --format '{{range .Mounts}}{{if eq .Destination \"/data\"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)\" && { [ -z \"\$M\" ] || [ \"\$M\" = '$REMOTE_DIR/$DATA_NAME' ]; }"

BACKUP_STAMP="$(date +%Y%m%d-%H%M%S)"
progress 'Backup-Ordner vorbereiten'
run_remote "$REMOTE_PATH && sudo mkdir -p '$BACKUP_DIR'"

progress "Daten von $PERSON sichern"
# Stop only the selected writer while creating a consistent archive. The exit
# trap restores its previous running state even when tar or the SSH session fails.
run_remote "$REMOTE_PATH && D=\"\$(command -v docker)\" && if [ -d '$DATA_NAME' ]; then RUNNING=\"\$(sudo \"\$D\" inspect --format '{{.State.Running}}' '$CONTAINER')\" || exit 1; restore_container() { R=\$?; trap - 0 HUP INT TERM; if [ \"\$RUNNING\" = true ]; then sudo \"\$D\" start '$CONTAINER' >/dev/null || exit 1; fi; exit \"\$R\"; }; trap restore_container 0; trap 'exit 1' HUP INT TERM; if [ \"\$RUNNING\" = true ]; then sudo \"\$D\" stop --time 30 '$CONTAINER' >/dev/null || exit 1; fi; sudo tar -czf '$BACKUP_DIR/$BACKUP_STAMP-$DATA_NAME.tar.gz' '$DATA_NAME' || exit 1; fi"

progress "Container von $PERSON aktualisieren · Docker-Cache verwenden"
run_remote "$REMOTE_PATH && C=\"\$(command -v docker-compose)\" && sudo \"\$C\" --env-file '$COMPOSE_ENV' -p '$COMPOSE_PROJECT' -f docker-compose.yml -f docker-compose.synology.yml up -d --build --no-deps bitpanda-dashboard"

progress "Erreichbarkeit von $PERSON prüfen"
run_remote "$REMOTE_PATH && D=\"\$(command -v docker)\" && N='$CONTAINER' && I=0 && while true; do S=\"\$(sudo \"\$D\" inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \"\$N\")\" || exit 1; case \"\$S\" in 'running healthy') break ;; *unhealthy*|exited*|dead*|restarting*) sudo \"\$D\" logs --tail 20 \"\$N\"; exit 1 ;; esac; I=\$((I + 1)); if [ \"\$I\" -ge 60 ]; then sudo \"\$D\" logs --tail 20 \"\$N\"; exit 1; fi; sleep 2; done"
CURRENT_STEP=$TOTAL_STEPS
CURRENT_LABEL='Fertig'
draw_progress '  ✓'
if [ -t 1 ]; then printf '\n'; fi
)

UPDATE_TARGET="nico"
while true; do
  printf '\n'
  set +e
  perform_update "$UPDATE_TARGET"
  update_status=$?
  set -e
  if [ "$update_status" -eq 0 ]; then
    printf '\n✓ Update für %s erfolgreich abgeschlossen\n\n' "$UPDATE_TARGET"
    if [ "$UPDATE_TARGET" = 'nico' ]; then
      printf '  Nico  · http://%s:8085\n' "$NAS_HOST"
    else
      printf '  Josi  · http://%s:8086\n' "$NAS_HOST"
    fi
  else
    KEEP_UPDATE_WINDOW=1
    printf '\n✗ Das Update wurde mit einem Fehler beendet. Die vorhandenen Datenordner wurden nicht gelöscht.\n'
  fi

  printf '\nR = Nico aktualisieren · J = Josi aktualisieren · Enter = Fenster schließen: '
  IFS= read -r action
  case "$action" in
    r|R) UPDATE_TARGET='nico'; printf '\nUpdate für Nico wird gestartet …\n'; continue ;;
    j|J) UPDATE_TARGET='josi'; printf '\nUpdate für Josi wird gestartet …\n'; continue ;;
  esac
  break
done

exit 0

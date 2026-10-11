#!/bin/bash
set -euo pipefail
WIDGET_DIR="$HOME/Library/Application Support/Übersicht/widgets/bitpanda"
/usr/bin/python3 "$WIDGET_DIR/lib/configure.py"
printf '\nEnter zum Schließen …'
read -r

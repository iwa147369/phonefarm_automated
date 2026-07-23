#!/usr/bin/env bash
#
# run.sh - push a script to the phone and start it, from your laptop
#
# Usage:
#   ./tools/run.sh main.js            push and run on the only connected phone
#   ./tools/run.sh probe.js           same, for the probe script
#   ./tools/run.sh main.js a1b2c3d4   pick a phone by id from `adb devices`
#
# This saves you tapping through the phone every time you change something.
# The script's own output still appears in the AutoJs6 console on the phone.
#
# To stop a running script: press volume up, or use the phone's notification.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$PROJECT_DIR/src"
PROBE_DIR="$PROJECT_DIR/src/probes"
LIB_DIR="$PROJECT_DIR/src/lib"
REMOTE_DIR="${REMOTE_DIR:-/sdcard/脚本}"

APP_PACKAGE="org.autojs.autojs6"
RUN_ACTIVITY="$APP_PACKAGE/org.autojs.autojs.external.open.RunIntentActivity"

SCRIPT_NAME="${1:-}"
DEVICE="${2:-}"

if [[ -z "$SCRIPT_NAME" ]]; then
  echo "Which script? For example:  ./tools/run.sh main.js" >&2
  echo "Available:" >&2
  find "$SRC_DIR" -maxdepth 1 -name '*.js' -printf '  %f\n' >&2
  find "$PROBE_DIR" -maxdepth 1 -name '*.js' -printf '  %f  (diagnostic)\n' >&2
  exit 1
fi

# The browsing script lives in src/; the diagnostic ones in src/probes/.
LOCAL_FILE="$SRC_DIR/$SCRIPT_NAME"
if [[ ! -f "$LOCAL_FILE" ]]; then
  LOCAL_FILE="$PROBE_DIR/$SCRIPT_NAME"
fi
if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "No such script: $SCRIPT_NAME" >&2
  echo "Looked in $SRC_DIR and $PROBE_DIR" >&2
  exit 1
fi

# Build the adb prefix once, so every call below targets the same phone.
ADB=(adb)
if [[ -n "$DEVICE" ]]; then
  ADB=(adb -s "$DEVICE")
fi

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
  echo "No phone connected. Run 'adb devices' to check." >&2
  exit 1
fi

echo "Sending $SCRIPT_NAME ..."
"${ADB[@]}" shell mkdir -p "'$REMOTE_DIR'" >/dev/null 2>&1 || true

# main.js is split across src/lib/, so those files have to travel with it. They
# go first: a phone holding new modules and an old main.js still runs, while the
# other way round it cannot start at all. The probes are single files on
# purpose and never need this.
if [[ -d "$LIB_DIR" ]]; then
  lib_count=0
  "${ADB[@]}" shell mkdir -p "'$REMOTE_DIR/lib'" >/dev/null 2>&1 || true
  for lib in "$LIB_DIR"/*.js; do
    [[ -f "$lib" ]] || continue
    if ! "${ADB[@]}" push "$lib" "$REMOTE_DIR/lib/$(basename "$lib")" >/dev/null; then
      echo "Could not send $(basename "$lib"). Stopping rather than starting a" >&2
      echo "script with half its parts - it would fail on the phone instead." >&2
      exit 1
    fi
    lib_count=$((lib_count + 1))
  done
  [[ $lib_count -gt 0 ]] && echo "  ... and $lib_count file(s) from src/lib/"
fi

"${ADB[@]}" push "$LOCAL_FILE" "$REMOTE_DIR/$SCRIPT_NAME" >/dev/null

echo "Starting it on the phone ..."
"${ADB[@]}" shell am start \
  -n "$RUN_ACTIVITY" \
  -a android.intent.action.VIEW \
  -t application/x-javascript \
  -d "file://$REMOTE_DIR/$SCRIPT_NAME" >/dev/null

echo
echo "Running. Watch the AutoJs6 console on the phone."
echo "Press volume up on the phone to stop it early."

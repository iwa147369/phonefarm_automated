#!/usr/bin/env bash
#
# status.sh - ask every phone how it has been getting on
#
# Usage:
#   ./tools/status.sh              one line per phone
#   ./tools/status.sh --history    the last few sessions of each phone
#   ./tools/status.sh a1b2c3d4     just one phone
#
# Each phone writes a note after every session. This collects them, so a farm
# can be checked without picking up a dozen phones. A phone that quietly
# stopped working three days ago looks exactly like a healthy one until you
# read the time of its last session.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/sdcard/脚本}"
STATUS_FILE="$REMOTE_DIR/farm_status.json"

SHOW_HISTORY=0
TARGET_DEVICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --history) SHOW_HISTORY=1; shift ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    -*)        echo "Unknown option: $1" >&2; exit 1 ;;
    *)         TARGET_DEVICE="$1"; shift ;;
  esac
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed. On Arch Linux:" >&2
  echo "  sudo pacman -S android-tools android-udev" >&2
  exit 1
fi

if [[ -n "$TARGET_DEVICE" ]]; then
  DEVICES=("$TARGET_DEVICE")
else
  mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
fi

if [[ ${#DEVICES[@]} -eq 0 ]]; then
  echo "No phones are connected." >&2
  exit 1
fi

# Turn one phone's note into readable lines. Reading the JSON in python keeps
# this working whether or not jq is installed.
render_status() {
  local serial="$1" json="$2" history="$3"
  SERIAL="$serial" JSON="$json" HISTORY="$history" python3 <<'PY'
import json, os, sys
from datetime import datetime

serial = os.environ["SERIAL"]
raw = os.environ["JSON"]
history = os.environ["HISTORY"] == "1"

if not raw.strip():
    print(f"  {serial:<20} has never finished a session")
    sys.exit(0)

try:
    data = json.loads(raw)
except Exception:
    print(f"  {serial:<20} its note is unreadable")
    sys.exit(0)

last = data.get("last_session") or {}
name = data.get("device_id", "(unnamed)")
when = last.get("finished_at", "?")

# Flag a phone that has not finished a session for a while, and one that ended
# for any reason other than simply running its time.
note = ""
try:
    age_hours = (datetime.now() - datetime.strptime(when, "%Y-%m-%d %H:%M")).total_seconds() / 3600
    if age_hours > 24:
        note = f"  <- nothing for {int(age_hours / 24)} day(s)"
    elif age_hours > 8:
        note = f"  <- nothing for {int(age_hours)} hours"
except Exception:
    pass

reason = last.get("ended_because", "?")
if reason not in ("ran_its_time", "stopped_by_hand") and not note:
    note = "  <- look into this"

print(f"  {name:<14} {serial:<20} last {when}  "
      f"{last.get('videos', 0):>3} videos  "
      f"{last.get('liked', 0):>2} liked  "
      f"{reason}{note}")

if last.get("buttons_not_found"):
    print(f"  {'':<14} {'':<20} buttons not found {last['buttons_not_found']} "
          f"times - run probe.js if this keeps happening")

if history:
    for s in (data.get("recent") or [])[:8]:
        print(f"  {'':<14} {'':<20}   {s.get('finished_at','?')}  "
              f"{s.get('ran_minutes','?')} min  "
              f"{s.get('videos',0)} videos  {s.get('ended_because','?')}")
    print()
PY
}

echo "Farm status"
echo "==========="

for device in "${DEVICES[@]}"; do
  json="$(adb -s "$device" shell "cat '$STATUS_FILE' 2>/dev/null" 2>/dev/null | tr -d '\r' || true)"
  render_status "$device" "$json" "$SHOW_HISTORY"
done

echo
echo "\"ran_its_time\" is the healthy ending. Anything else is worth a look."

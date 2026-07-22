#!/usr/bin/env bash
#
# watch.sh - follow what a phone's script is doing, live
#
# Usage:
#   ./tools/watch.sh              follow the only connected phone
#   ./tools/watch.sh a1b2c3d4     follow one phone by id
#   ./tools/watch.sh --last 40    print the last 40 lines and stop
#
# The script does not draw its own window on the phone any more. That window
# sat over the top-left of the screen and swallowed any swipe passing through
# it, which silently broke the swipe back to the previous video. So the log
# lives here instead.
#
# Press Ctrl+C to stop watching. That does not stop the script on the phone -
# for that, press volume up on the phone itself.

set -uo pipefail

TARGET_DEVICE=""
LAST_LINES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --last)    LAST_LINES="${2:-40}"; shift 2 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    -*)        echo "Unknown option: $1" >&2; exit 1 ;;
    *)         TARGET_DEVICE="$1"; shift ;;
  esac
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed. On Arch Linux:" >&2
  echo "  sudo pacman -S android-tools android-udev" >&2
  exit 1
fi

ADB=(adb)
[[ -n "$TARGET_DEVICE" ]] && ADB=(adb -s "$TARGET_DEVICE")

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
  echo "No phone connected. Run 'adb devices' to check." >&2
  exit 1
fi

# The script's output all carries this tag. Strip the timestamps and tag so
# what is left reads the way it would on the phone.
tidy() {
  sed -u 's/^.*GlobalConsole: //'
}

if [[ -n "$LAST_LINES" ]]; then
  "${ADB[@]}" logcat -d 2>/dev/null | grep 'GlobalConsole' | tail -n "$LAST_LINES" | tidy
  exit 0
fi

echo "Watching the phone. Ctrl+C stops watching, not the script."
echo "To stop the script itself, press volume up on the phone."
echo "----------------------------------------------------------"

# Show what has happened so far, then follow.
"${ADB[@]}" logcat -d 2>/dev/null | grep 'GlobalConsole' | tail -n 15 | tidy
"${ADB[@]}" logcat -s GlobalConsole:D 2>/dev/null | tidy

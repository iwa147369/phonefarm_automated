#!/usr/bin/env bash
#
# deploy.sh - copy the scripts onto every connected phone
#
# Usage:
#   ./tools/deploy.sh              push to all connected phones
#   ./tools/deploy.sh a1b2c3d4     push to one phone (id from `adb devices`)
#   ./tools/deploy.sh --clean      also delete scripts no longer in src/
#   ./tools/deploy.sh --dry-run    show what would happen, change nothing
#   ./tools/deploy.sh --list       just list the connected phones
#
# The folder on the phone can be changed without editing this file:
#   REMOTE_DIR=/sdcard/my-folder ./tools/deploy.sh
#
# Each phone also gets its own settings file. config/devices/*.json say which
# phone they belong to by adb serial; the matching one is copied over as
# device.json. A phone with no config runs the built-in defaults, which means it
# behaves exactly like every other phone doing the same - so that is warned
# about loudly.
#
# Only src/main.js goes to the phones. The diagnostic scripts in src/probes/
# stay on your laptop, and tools/run.sh sends one over when you need it. They
# have no place on a working phone: two of them press buttons, and running one
# by accident on a farm phone is not something you want.
#
# This only copies files. It never starts a session - that stays a deliberate
# act on each phone.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$PROJECT_DIR/src"
PROBE_DIR="$PROJECT_DIR/src/probes"
LIB_DIR="$PROJECT_DIR/src/lib"
CONFIG_DIR="$PROJECT_DIR/config/devices"
# AutoJs6 reads scripts from /sdcard/脚本 - that word is Chinese for "scripts",
# and the folder keeps that name even when the phone is set to English.
# Override with REMOTE_DIR if your phone differs.
REMOTE_DIR="${REMOTE_DIR:-/sdcard/脚本}"

DRY_RUN=0
LIST_ONLY=0
CLEAN=0
TARGET_DEVICE=""

# ---------------------------------------------------------------- arguments

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --clean)   CLEAN=1; shift ;;
    --list)    LIST_ONLY=1; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    -*)        echo "Unknown option: $1" >&2; exit 1 ;;
    *)         TARGET_DEVICE="$1"; shift ;;
  esac
done

# ---------------------------------------------------------------- settings

# Read one field out of a settings file. Uses python3 rather than jq, which is
# not installed everywhere.
config_field() {
  python3 -c 'import json,sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))
except Exception:
    pass' "$1" "$2" 2>/dev/null
}

# Check every settings file parses before sending any of them. One broken file
# should stop the whole run, not get copied to a phone and stop it there.
check_configs_parse() {
  local broken=0 f
  for f in "$CONFIG_DIR"/*.json; do
    [[ -e "$f" ]] || continue
    if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>/dev/null; then
      echo "  NOT VALID JSON: $f" >&2
      broken=1
    fi
  done
  return $broken
}

# Which settings file belongs to this phone, if any.
config_for_device() {
  local serial="$1" f
  for f in "$CONFIG_DIR"/*.json; do
    [[ -e "$f" ]] || continue
    if [[ "$(config_field "$f" adb_serial)" == "$serial" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

# Settings files whose phone is nowhere to be seen. Usually a typo in a serial,
# or a phone that has dropped off the network.
report_unused_configs() {
  local f serial found unused=""
  for f in "$CONFIG_DIR"/*.json; do
    [[ -e "$f" ]] || continue
    serial="$(config_field "$f" adb_serial)"
    found=0
    for d in "${DEVICES[@]}"; do
      [[ "$d" == "$serial" ]] && found=1
    done
    [[ $found -eq 0 ]] && unused+="  $(basename "$f")  expects $serial"$'\n'
  done

  if [[ -n "$unused" ]]; then
    echo "Settings files with no phone connected:"
    printf '%s' "$unused"
    echo "  (check the adb_serial in each, or the phone is offline)"
    echo
  fi
}

# ---------------------------------------------------------------- checks

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed. On Arch Linux:" >&2
  echo "  sudo pacman -S android-tools android-udev" >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "No src/ folder found at $SRC_DIR" >&2
  exit 1
fi

if ! check_configs_parse; then
  echo "Fix the settings file(s) above before deploying." >&2
  exit 1
fi

# Collect the script files. Fail early rather than reporting success on nothing.
mapfile -t FILES < <(find "$SRC_DIR" -maxdepth 1 -name '*.js' -type f | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No .js files in $SRC_DIR" >&2
  exit 1
fi

# main.js is split across src/lib/, and it cannot start without those files.
LIB_FILES=()
if [[ -d "$LIB_DIR" ]]; then
  mapfile -t LIB_FILES < <(find "$LIB_DIR" -maxdepth 1 -name '*.js' -type f | sort)
fi

# ---------------------------------------------------------------- devices

# Read the device ids adb reports as ready. Lines look like "a1b2c3d4  device";
# anything in another state (unauthorized, offline) is reported separately.
collect_devices() {
  adb devices | awk 'NR>1 && $2=="device" {print $1}'
}

report_unready_devices() {
  local unready
  unready="$(adb devices | awk 'NR>1 && NF==2 && $2!="device" {print "  " $1 " -> " $2}')"
  if [[ -n "$unready" ]]; then
    echo "These phones are connected but not usable:"
    echo "$unready"
    echo "  (unauthorized: accept the prompt on the phone screen)"
    echo "  (offline: reconnect with 'adb connect <address>')"
    echo
  fi
}

if [[ -n "$TARGET_DEVICE" ]]; then
  DEVICES=("$TARGET_DEVICE")
else
  mapfile -t DEVICES < <(collect_devices)
fi

report_unready_devices

if [[ ${#DEVICES[@]} -eq 0 ]]; then
  echo "No phones are connected." >&2
  echo "Plug one in over USB, or connect over Wi-Fi with 'adb connect <address>'." >&2
  echo "See docs/DEPLOY.md." >&2
  exit 1
fi

if [[ $LIST_ONLY -eq 1 ]]; then
  echo "Connected phones:"
  for d in "${DEVICES[@]}"; do
    model="$(adb -s "$d" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
    release="$(adb -s "$d" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')"
    if cfg="$(config_for_device "$d")"; then
      named="$(config_field "$cfg" device_id)"
      echo "  $d  -  ${model:-unknown} (Android ${release:-?})  ->  ${named:-$(basename "$cfg")}"
    else
      echo "  $d  -  ${model:-unknown} (Android ${release:-?})  ->  NO SETTINGS FILE"
    fi
  done
  echo
  report_unused_configs
  exit 0
fi

# Look for scripts on the phone that are no longer in src/. A leftover copy is
# easy to run by mistake, and then you are debugging a version you already
# fixed. That has happened once, which is why this check exists.
check_for_stale_files() {
  local device="$1"
  local stale=()
  local name

  while read -r name; do
    [[ -z "$name" ]] && continue
    [[ -f "$SRC_DIR/$name" || -f "$PROBE_DIR/$name" ]] || stale+=("$name")
  done < <(adb -s "$device" shell "ls '$REMOTE_DIR'" 2>/dev/null \
             | tr -d '\r' | grep '\.js$' || true)

  # A leftover module is worse than a leftover script: nobody runs it on
  # purpose, main.js just quietly loads it instead of the one that replaced it.
  while read -r name; do
    [[ -z "$name" ]] && continue
    [[ -f "$LIB_DIR/$name" ]] || stale+=("lib/$name")
  done < <(adb -s "$device" shell "ls '$REMOTE_DIR/lib'" 2>/dev/null \
             | tr -d '\r' | grep '\.js$' || true)

  [[ ${#stale[@]} -eq 0 ]] && return 0

  if [[ $CLEAN -eq 1 ]]; then
    for name in "${stale[@]}"; do
      if adb -s "$device" shell "rm -f '$REMOTE_DIR/$name'" >/dev/null 2>&1; then
        echo "    deleted old $name"
      else
        echo "    could not delete old $name"
      fi
    done
  else
    for name in "${stale[@]}"; do
      echo "    STILL ON PHONE, no longer in src/: $name"
    done
    echo "    (run with --clean to delete these)"
  fi
}

# ---------------------------------------------------------------- deploy

echo "Sending ${#FILES[@]} file(s) to ${#DEVICES[@]} phone(s)"
echo "Destination on phone: $REMOTE_DIR"
[[ $DRY_RUN -eq 1 ]] && echo "(dry run - nothing will be changed)"
echo

succeeded=0
failed=0

for device in "${DEVICES[@]}"; do
  model="$(adb -s "$device" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
  echo "--> $device  (${model:-unknown})"

  device_config="$(config_for_device "$device" || true)"

  if [[ $DRY_RUN -eq 1 ]]; then
    for f in "${LIB_FILES[@]+"${LIB_FILES[@]}"}"; do
      echo "    would copy lib/$(basename "$f")"
    done
    for f in "${FILES[@]}"; do
      echo "    would copy $(basename "$f")"
    done
    if [[ -n "$device_config" ]]; then
      echo "    would copy $(basename "$device_config") as device.json"
    else
      echo "    NO SETTINGS FILE - would run the built-in defaults"
    fi
    echo
    continue
  fi

  device_ok=1

  # Make sure the folder exists. It usually does, but not on a fresh install.
  if ! adb -s "$device" shell mkdir -p "'$REMOTE_DIR'" >/dev/null 2>&1; then
    echo "    could not create $REMOTE_DIR"
    device_ok=0
  fi

  # The modules go before main.js, and a failure here stops this phone getting
  # main.js at all. A phone left with old modules and an old main.js keeps
  # browsing; one given a new main.js without its modules cannot start, and
  # nobody would find out until the next time somebody looked.
  if [[ $device_ok -eq 1 && ${#LIB_FILES[@]} -gt 0 ]]; then
    if ! adb -s "$device" shell mkdir -p "'$REMOTE_DIR/lib'" >/dev/null 2>&1; then
      echo "    could not create $REMOTE_DIR/lib"
      device_ok=0
    fi

    for f in "${LIB_FILES[@]}"; do
      [[ $device_ok -eq 1 ]] || break
      name="$(basename "$f")"
      if adb -s "$device" push "$f" "$REMOTE_DIR/lib/$name" >/dev/null 2>&1; then
        echo "    copied lib/$name"
      else
        echo "    FAILED to copy lib/$name - not sending main.js either"
        device_ok=0
      fi
    done
  fi

  if [[ $device_ok -eq 1 ]]; then
    for f in "${FILES[@]}"; do
      name="$(basename "$f")"
      if adb -s "$device" push "$f" "$REMOTE_DIR/$name" >/dev/null 2>&1; then
        echo "    copied $name"
      else
        echo "    FAILED to copy $name"
        device_ok=0
      fi
    done
  fi

  # Its own settings, or a clear warning that it has none.
  if [[ $device_ok -eq 1 ]]; then
    if [[ -n "$device_config" ]]; then
      if adb -s "$device" push "$device_config" "$REMOTE_DIR/device.json" \
           >/dev/null 2>&1; then
        echo "    settings: $(basename "$device_config")"
      else
        echo "    FAILED to copy its settings"
        device_ok=0
      fi
    else
      echo "    NO SETTINGS FILE for this phone - it will run the defaults,"
      echo "      behaving exactly like every other phone in the same state."
      echo "      Add one to config/devices/ with:"
      echo "        \"adb_serial\": \"$device\""
    fi
  fi

  if [[ $device_ok -eq 1 ]]; then
    check_for_stale_files "$device"
    succeeded=$((succeeded + 1))
  else
    failed=$((failed + 1))
    echo "    -> check the folder path, see 'Troubleshooting' in docs/DEPLOY.md"
  fi
  echo
done

# ---------------------------------------------------------------- summary

report_unused_configs

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run finished. Nothing was changed."
  exit 0
fi

echo "======================================"
echo "Phones updated : $succeeded"
[[ $failed -gt 0 ]] && echo "Phones failed  : $failed"
echo "======================================"
echo
echo "On each phone: open AutoJs6 and pull down to refresh the file list."

[[ $failed -gt 0 ]] && exit 1
exit 0

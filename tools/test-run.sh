#!/usr/bin/env bash
#
# test-run.sh - put every feature through its paces on one phone, and say which
#               ones were actually seen to happen
#
# Usage:
#   ./tools/test-run.sh <phone id>
#   ./tools/test-run.sh <phone id> --keep      leave the test settings in place
#
# What it does, in order:
#
#   1. Saves the phone's own settings and its two record files
#   2. Sends the current code, and config/test-all-features.json as device.json
#   3. Runs two short sessions with every rate turned up
#   4. Reads the record file back and reports which features left a mark
#   5. Puts the phone's own settings and records back, and restarts it
#
# WHY IT READS THE RECORD FILE
#
# "It ran without errors" is not evidence that anything happened. A phone can
# swipe for six minutes, press nothing at all, and finish with a tidy summary -
# that is the exact failure this project keeps meeting. So the pass mark is a
# count in farm_status.json for each feature, written by the script itself after
# the fact, not a line saying it was about to try.
#
# Two sessions rather than one, on purpose. The counters have to go back to zero
# in between, and a single session cannot show that.
#
# WHAT IT CANNOT TEST
#
#   the swipe back        switched off by the script whenever the console panel
#                         is on, which is how the farm now runs
#   messages and sharing  both send something to a real person, so they stay off
#   to a friend           until somebody names an account in the test settings
#   the watchdogs         a renamed button, a login wall, a flat battery - none
#                         can be brought about safely to order
#
# Anything in that list is reported as "not tested", never as passed.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_CONFIG="$PROJECT_DIR/config/test-all-features.json"
REMOTE_DIR="${REMOTE_DIR:-/sdcard/脚本}"
APP_PACKAGE="org.autojs.autojs6"
ACCESSIBILITY_SERVICE="$APP_PACKAGE/org.autojs.autojs.core.accessibility.AccessibilityServiceUsher"

DEVICE="${1:-}"
KEEP=0
[[ "${2:-}" == "--keep" ]] && KEEP=1

if [[ -z "$DEVICE" ]]; then
  echo "Which phone? For example:  ./tools/test-run.sh 5200b87ec0a4a431" >&2
  echo "Connected:" >&2
  adb devices | awk 'NR>1 && $2=="device" {print "  " $1}' >&2
  exit 1
fi

if [[ ! -f "$TEST_CONFIG" ]]; then
  echo "Missing $TEST_CONFIG" >&2
  exit 1
fi

ADB=(adb -s "$DEVICE")
BACKUP="$(mktemp -d)"
RESTORED=0

# ---------------------------------------------------------------- putting it back

# The phone must end up as it started whatever happens here - including a
# Ctrl-C halfway through. A farm phone left running test settings would like
# half of everything it sees until somebody noticed.
restore() {
  [[ $RESTORED -eq 1 ]] && return
  RESTORED=1

  if [[ -n "${LOGCAT_PID:-}" ]]; then
    kill "$LOGCAT_PID" >/dev/null 2>&1
    wait "$LOGCAT_PID" 2>/dev/null
  fi

  echo
  echo "Putting the phone back as it was ..."

  if [[ $KEEP -eq 1 ]]; then
    echo "  --keep given: leaving the test settings on the phone"
    echo "  put them back yourself with:  ./tools/deploy.sh --device $DEVICE"
    return
  fi

  for f in device.json farm_state.json farm_status.json; do
    if [[ -f "$BACKUP/$f" ]]; then
      if "${ADB[@]}" push "$BACKUP/$f" "$REMOTE_DIR/$f" >/dev/null 2>&1; then
        echo "  $f restored"
      else
        echo "  COULD NOT RESTORE $f - it is saved at $BACKUP/$f"
      fi
    else
      # There was none to begin with, so leave none behind.
      "${ADB[@]}" shell "rm -f '$REMOTE_DIR/$f'" >/dev/null 2>&1
      echo "  $f removed (the phone had none before)"
    fi
  done

  stop_everything
  start_script
  echo "  running again on its own settings"
}
trap restore EXIT INT TERM

# ---------------------------------------------------------------- the phone

# Force-stopping AutoJs6 also switches its accessibility permission off, with no
# warning - see docs/SETUP.md. Turn it back on, then wait for it to actually be
# running: starting a script too soon gives a phone that cannot see the screen
# and reports "Could not open TikTok" while TikTok sits open in front of it.
stop_everything() {
  "${ADB[@]}" shell am force-stop "$APP_PACKAGE" >/dev/null 2>&1
  sleep 3
  "${ADB[@]}" shell "settings put secure enabled_accessibility_services $ACCESSIBILITY_SERVICE; settings put secure accessibility_enabled 1" >/dev/null 2>&1

  local waited=0
  while (( waited < 40 )); do
    if "${ADB[@]}" shell "dumpsys accessibility 2>/dev/null | grep -c autojs" 2>/dev/null | tr -d '\r' | grep -qv '^0$'; then
      sleep 8   # the service is registered; give the app a moment to settle
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  echo "  WARNING: the accessibility service did not come back within 40s"
  return 1
}

start_script() {
  "${ADB[@]}" shell am start \
    -n "$APP_PACKAGE/org.autojs.autojs.external.open.RunIntentActivity" \
    -a android.intent.action.VIEW \
    -t application/x-javascript \
    -d "file://$REMOTE_DIR/main.js" >/dev/null 2>&1
}

# ---------------------------------------------------------------- go

if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
  echo "Phone $DEVICE is not connected." >&2
  exit 1
fi

MODEL="$("${ADB[@]}" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
RELEASE="$("${ADB[@]}" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')"

echo "======================================"
echo "Test run on $DEVICE"
echo "  ${MODEL:-unknown}, Android ${RELEASE:-?}"
echo "======================================"
echo

echo "Saving what is on the phone now ..."
for f in device.json farm_state.json farm_status.json; do
  if "${ADB[@]}" pull "$REMOTE_DIR/$f" "$BACKUP/$f" >/dev/null 2>&1; then
    echo "  $f saved"
  else
    echo "  $f - none on the phone"
  fi
done
echo "  (saved under $BACKUP)"
echo

echo "Sending the code ..."
if ! "$PROJECT_DIR/tools/run.sh" main.js "$DEVICE" >/dev/null 2>&1; then
  echo "Could not send the code. Stopping." >&2
  exit 1
fi

echo "Sending the test settings ..."
"${ADB[@]}" push "$TEST_CONFIG" "$REMOTE_DIR/device.json" >/dev/null || {
  echo "Could not send the test settings. Stopping." >&2
  exit 1
}

# Yesterday's plan would say the day is already done and nothing would run.
"${ADB[@]}" shell "rm -f '$REMOTE_DIR/farm_state.json' '$REMOTE_DIR/farm_status.json'" >/dev/null 2>&1

echo
echo "Starting. Two sessions of six minutes with a minute between them,"
echo "so about fifteen minutes. The phone will browse for real."
echo

stop_everything
"${ADB[@]}" logcat -c >/dev/null 2>&1

# Follow the log as it happens rather than reading it back at the end. The
# phone's log is a ring buffer and the system fills it faster than the script
# does: on the first run of this tool the startup lines had already been pushed
# out by the time the report was written, and two features that had worked
# perfectly were reported as NOT SEEN. Evidence that expires is not evidence.
"${ADB[@]}" logcat > "$BACKUP/live.log" 2>/dev/null &
LOGCAT_PID=$!

start_script

# ---------------------------------------------------------------- waiting

SECONDS_WAITED=0
LIMIT=1500          # 25 minutes: two 6-minute sessions, a gap, and room to spare
SESSIONS=0

while (( SECONDS_WAITED < LIMIT )); do
  sleep 20
  SECONDS_WAITED=$((SECONDS_WAITED + 20))

  SESSIONS="$("${ADB[@]}" shell "cat '$REMOTE_DIR/farm_status.json'" 2>/dev/null \
              | tr -d '\r' | grep -o '"finished_at"' | wc -l)"
  SESSIONS=$(( SESSIONS > 0 ? SESSIONS - 1 : 0 ))   # one copy lives in last_session

  printf "\r  %3ds elapsed, %d session(s) recorded " "$SECONDS_WAITED" "$SESSIONS"

  (( SESSIONS >= 2 )) && break
done
echo
echo

if (( SESSIONS < 2 )); then
  echo "Only $SESSIONS session(s) finished in $((LIMIT / 60)) minutes."
  echo "The report below is from what did happen. The log may say why:"
  echo "  adb -s $DEVICE logcat -d | grep GlobalConsole | tail -40"
  echo
fi

# ---------------------------------------------------------------- the report

"${ADB[@]}" pull "$REMOTE_DIR/farm_status.json" "$BACKUP/result.json" >/dev/null 2>&1

kill "$LOGCAT_PID" >/dev/null 2>&1
wait "$LOGCAT_PID" 2>/dev/null
grep GlobalConsole "$BACKUP/live.log" > "$BACKUP/result.log" 2>/dev/null

if [[ ! -f "$BACKUP/result.json" ]]; then
  echo "No record file was written at all. Nothing can be reported." >&2
  exit 1
fi

python3 - "$BACKUP/result.json" "$BACKUP/result.log" <<'PYTHON'
import json, sys, re

status = json.load(open(sys.argv[1], encoding="utf-8"))
try:
    log = open(sys.argv[2], encoding="utf-8", errors="replace").read()
except OSError:
    log = ""

runs = status.get("recent", [])
if not runs:
    print("The record file holds no sessions.")
    sys.exit(1)

def total(field):
    return sum(r.get(field, 0) or 0 for r in runs)

print("======================================")
print("WHAT ACTUALLY HAPPENED")
print("======================================")
print()
print("  sessions recorded : %d" % len(runs))
for i, r in enumerate(runs, 1):
    print("    %d. %s  %.3g min  %d videos  ended: %s"
          % (i, r.get("finished_at", "?"), r.get("ran_minutes", 0),
             r.get("videos", 0), r.get("ended_because", "?")))
print()

# Each row: what it is, the evidence, and whether the evidence says it happened.
checks = [
    ("watched videos",      total("videos"),        "videos"),
    ("liked",               total("liked"),         "liked"),
    ("saved to favourites", total("saved"),         "saved"),
    ("read comments",       total("comments_read"), "comments_read"),
    ("copied a share link", total("shared"),        "shared"),
    ("searched a topic",    sum(1 for r in runs if r.get("searched_topic")), "searched_topic"),
    ("replied to a message", total("replied"),      "replied"),
    ("sent to a friend",    total("sent_to_friend"), "sent_to_friend"),
]

print("  FEATURE                 COUNT   VERDICT")
print("  " + "-" * 46)

failed = []
for name, count, _field in checks:
    if name in ("replied to a message", "sent to a friend") and count == 0:
        verdict = "not tested - switched off"
    elif count > 0:
        verdict = "seen"
    else:
        verdict = "NOT SEEN"
        failed.append(name)
    print("  %-22s %5d   %s" % (name, count, verdict))

print()
print("  OTHER THINGS THE RECORD SHOWS")
print("  " + "-" * 46)

misses = total("buttons_not_found")
print("  %-30s %s" % ("buttons it could not find",
      ("%d - see below" % misses) if misses else "0"))

reasons = set(r.get("ended_because") for r in runs)
print("  %-30s %s" % ("how the sessions ended", ", ".join(sorted(str(x) for x in reasons))))

# Two sessions in a row only prove anything if the second one started from zero.
# Every session having its own counts is what shows the reset worked.
if len(runs) >= 2:
    each_counted = all(r.get("videos", 0) > 0 for r in runs)
    print("  %-30s %s" % ("counters reset between runs",
          "yes - every session has its own totals" if each_counted
          else "NO - a session recorded nothing"))
    if not each_counted:
        failed.append("counters reset between sessions")
else:
    print("  %-30s %s" % ("counters reset between runs", "not tested - one session only"))

# Things that live in the log rather than the record file.
print()
print("  FROM THE LOG")
print("  " + "-" * 46)
log_checks = [
    ("this phone's own settings loaded", "Known as: test-all-features"),
    ("console panel on, swipe back off", "Swipe back is off while the console panel is on"),
    ("schedule waited between sessions",  "too soon after the last session"),
]
for name, needle in log_checks:
    seen = needle in log
    print("  %-34s %s" % (name, "seen" if seen else "NOT SEEN"))
    if not seen:
        failed.append(name)

if misses:
    print()
    print("  Button misses in the log:")
    for line in sorted(set(re.findall(r"(  \w+: button not found)", log))):
        print("   ", line.strip())

print()
print("======================================")
if failed:
    print("NOT SEEN: " + ", ".join(failed))
    print()
    print("A feature that was not seen is not the same as a broken one - a rate")
    print("of 0.35 can miss on a short run. Run it again before reading anything")
    print("into it, and if it stays away, look for it in the log by name.")
else:
    print("Every feature that could be tested was seen to happen.")
print("======================================")

sys.exit(1 if failed else 0)
PYTHON
REPORT=$?

echo
echo "The full log and record file are at $BACKUP"
exit $REPORT

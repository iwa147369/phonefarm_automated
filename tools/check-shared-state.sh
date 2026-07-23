#!/usr/bin/env bash
#
# check-shared-state.sh - catch the one mistake the split makes possible
#
# The script's shared values live in src/lib/state.js. Some of them are numbers,
# strings and true/false, and those must always be reached through the shared
# object:
#
#   state.endReason = "screen_off";      correct
#   var endReason = state.endReason;     wrong, and silent
#   endReason = "screen_off";
#
# The wrong version changes a local copy and leaves the real one untouched. No
# error is raised. The phone browses exactly as it should and then writes down
# the wrong reason for stopping, or counts nothing at all - the kind of failure
# that is only found weeks later, in data nobody can explain.
#
# This is the only new way the split can break something, so it is worth a check
# that runs in a second rather than a rule somebody has to remember.
#
# Usage:
#   ./tools/check-shared-state.sh
#
# Prints nothing and exits 0 when everything is fine.
#
# What it does not catch: an assignment buried in the middle of a line, such as
# one inside a { } on the same line as something else. It looks for a local
# declaration and for an assignment at the start of a line, which is how the
# mistake actually appears - you cannot drift from the shared value without
# first making a copy of it, and making the copy is a declaration.

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$PROJECT_DIR/src"
STATE_FILE="$SRC_DIR/lib/state.js"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No src/lib/state.js - nothing to check." >&2
  exit 0
fi

# The values that get replaced rather than changed in place. Anything else in
# state.js is an object or a function, and naming one of those locally is fine.
GUARDED=(stopRequested endReason consecutiveMisses tiktokPackage
         activeRates warnedAboutNames)

# Every file that runs on a phone. state.js itself is skipped: inside it these
# names are properties of its own object and are meant to be assigned.
mapfile -t FILES < <(find "$SRC_DIR" -maxdepth 2 -name '*.js' -type f \
                       -not -path '*/probes/*' -not -name 'state.js' | sort)

problems=0

for name in "${GUARDED[@]}"; do
  for f in "${FILES[@]}"; do
    # A local declaration, which makes a copy that then drifts.
    while IFS=: read -r line text; do
      [[ -z "$line" ]] && continue
      echo "${f#$PROJECT_DIR/}:$line makes its own copy of $name"
      echo "    $(echo "$text" | sed 's/^[[:space:]]*//')"
      echo "    use state.$name instead"
      problems=$((problems + 1))
    done < <(grep -nE "^[[:space:]]*var[[:space:]]+$name\b" "$f" || true)

    # An assignment with nothing in front of it, which writes to a local or,
    # worse, quietly makes a global that nothing else reads.
    while IFS=: read -r line text; do
      [[ -z "$line" ]] && continue
      echo "${f#$PROJECT_DIR/}:$line assigns $name without going through state"
      echo "    $(echo "$text" | sed 's/^[[:space:]]*//')"
      echo "    use state.$name instead"
      problems=$((problems + 1))
    done < <(grep -nE "^[[:space:]]*$name[[:space:]]*(=[^=]|\+\+|--|\+=)" "$f" || true)
  done
done

# A local called "state" hides the shared object for the rest of its function,
# and every state.something inside then reads the wrong thing. This is not
# hypothetical: it happened the day the shared object was introduced. main.js
# already had a local "state" holding the day's plan, so `while (!state
# .stopRequested)` began asking the day's plan whether the volume key had been
# pressed. It answered undefined, which is falsy, so the loop simply never
# stopped - no error, nothing in the log, just a phone that ignored the key.
# The local is now called "plan".
for f in "${FILES[@]}"; do
  grep -q "requireModule(\"state\")\|require(\"./state.js\")" "$f" || continue

  while IFS=: read -r line text; do
    [[ -z "$line" ]] && continue
    echo "${f#$PROJECT_DIR/}:$line has a local called state, which hides the shared one"
    echo "    $(echo "$text" | sed 's/^[[:space:]]*//')"
    echo "    give it another name"
    problems=$((problems + 1))
  done < <(grep -nE "^[[:space:]]*(var|function)[[:space:]]+state\b" "$f" \
             | grep -vE 'requireModule\("state"\)|require\("\./state\.js"\)' || true)
done

if [[ $problems -gt 0 ]]; then
  echo
  echo "$problems place(s) copy a shared value instead of sharing it."
  echo "See the rule at the top of src/lib/state.js."
  exit 1
fi

exit 0

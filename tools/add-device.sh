#!/usr/bin/env bash
#
# add-device.sh - write a settings file for a phone that has none
#
# Usage:
#   ./tools/add-device.sh                       every connected phone missing one
#   ./tools/add-device.sh a1b2c3d4              just that phone
#   ./tools/add-device.sh --name farm-03 a1b2c3d4
#   ./tools/add-device.sh --topic "cà phê,coffee shop"
#   ./tools/add-device.sh --account-started today
#
# Filling in the serial is the easy part. The point of this is the rest: it
# invents a different daily rhythm for each phone - different waking hours,
# different appetite for liking things, different session lengths.
#
# That matters because it is exactly where doing it by hand goes wrong. Copying
# one file twelve times gives twelve phones that wake at the same minute and
# like the same share of what they see. Every session is convincing on its own,
# and the farm as a whole is not.
#
# It never overwrites an existing settings file, and it never pushes anything.
# Run tools/deploy.sh afterwards.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$PROJECT_DIR/config/devices"

NAME=""
TOPIC=""
ACCOUNT_STARTED=""
TARGET_DEVICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)            NAME="${2:-}"; shift 2 ;;
    --topic)           TOPIC="${2:-}"; shift 2 ;;
    --account-started) ACCOUNT_STARTED="${2:-}"; shift 2 ;;
    -h|--help)         sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    -*)                echo "Unknown option: $1" >&2; exit 1 ;;
    *)                 TARGET_DEVICE="$1"; shift ;;
  esac
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed. On Arch Linux:" >&2
  echo "  sudo pacman -S android-tools android-udev" >&2
  exit 1
fi

mkdir -p "$CONFIG_DIR"

if [[ -n "$TARGET_DEVICE" ]]; then
  DEVICES=("$TARGET_DEVICE")
else
  mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
fi

if [[ ${#DEVICES[@]} -eq 0 ]]; then
  echo "No phones are connected." >&2
  exit 1
fi

if [[ -n "$NAME" && ${#DEVICES[@]} -gt 1 ]]; then
  echo "--name only makes sense with one phone. Name them one at a time." >&2
  exit 1
fi

# Model names help when naming a phone, so collect them first.
declare -A MODELS=()
for d in "${DEVICES[@]}"; do
  MODELS["$d"]="$(adb -s "$d" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
done

CONFIG_DIR="$CONFIG_DIR" \
NAME="$NAME" TOPIC="$TOPIC" ACCOUNT_STARTED="$ACCOUNT_STARTED" \
SERIALS="$(printf '%s\n' "${DEVICES[@]}")" \
MODEL_LINES="$(for d in "${DEVICES[@]}"; do echo "$d=${MODELS[$d]}"; done)" \
python3 <<'PY'
import json, os, random, glob, datetime, re

config_dir = os.environ["CONFIG_DIR"]
wanted_name = os.environ["NAME"].strip()
topic = os.environ["TOPIC"].strip()
account_started = os.environ["ACCOUNT_STARTED"].strip()
serials = [s for s in os.environ["SERIALS"].splitlines() if s]
models = dict(
    line.split("=", 1) for line in os.environ["MODEL_LINES"].splitlines() if "=" in line
)

if account_started == "today":
    account_started = datetime.date.today().isoformat()

# --- what is already in use -------------------------------------------------

taken_serials, taken_names, taken_rhythms = set(), set(), []
taken_shapes = set()   # which daily rhythms are already spoken for
for path in glob.glob(os.path.join(config_dir, "*.json")):
    try:
        with open(path) as fh:
            existing = json.load(fh)
    except Exception:
        continue
    taken_serials.add(existing.get("adb_serial", ""))
    taken_names.add(existing.get("device_id", ""))
    hours = existing.get("schedule", {}).get("active_hours")
    if hours:
        taken_rhythms.append(json.dumps(hours, sort_keys=True))

# --- the shapes a day can take ----------------------------------------------
#
# Real people do not all browse at the same times. These are a few plausible
# daily rhythms; each phone gets one, then the hours are nudged so that even
# two phones on the same rhythm do not line up exactly.

RHYTHMS = [
    ("checks it over breakfast and again at night", [[6, 8], [12, 13], [19, 22]]),
    ("mostly evenings",                             [[12, 13], [18, 23]]),
    ("late nights",                                 [[13, 15], [21, 24]]),
    ("a long lunch and an early night",             [[11, 14], [17, 20]]),
    ("early mornings, quiet afterwards",            [[5, 8], [16, 18], [20, 21]]),
    ("scattered through the day",                   [[9, 10], [14, 16], [19, 21]]),
]


def nudge(hours):
    """Shift a window's edges by an hour or so, keeping it sane."""
    out = []
    for start, end in hours:
        start = max(0, min(23, start + random.choice([-1, 0, 0, 1])))
        end = max(start + 1, min(24, end + random.choice([-1, 0, 0, 1])))
        out.append([start, end])
    return out


# Which rhythms earlier phones were given. Two phones on the same rhythm end up
# awake at nearly the same times even after nudging, so unused ones come first.
for path in glob.glob(os.path.join(config_dir, "*.json")):
    try:
        with open(path) as fh:
            note = json.load(fh).get("_comment", "")
    except Exception:
        continue
    for description, _ in RHYTHMS:
        if description in note:
            taken_shapes.add(description)


def invent_persona():
    """A daily rhythm and an appetite, different from the ones already in use."""
    unused = [r for r in RHYTHMS if r[0] not in taken_shapes]
    pool = unused if unused else RHYTHMS

    description, base_hours = random.choice(pool)
    hours = nudge(base_hours)

    # If every rhythm is spoken for, at least avoid an exact repeat of the hours.
    for _ in range(20):
        if json.dumps(hours, sort_keys=True) not in taken_rhythms:
            break
        hours = nudge(base_hours)

    taken_shapes.add(description)

    # How much this account interacts. Kept inside ranges that stay plausible:
    # nobody likes half of everything they see.
    like = round(random.uniform(0.10, 0.26), 3)

    persona = {
        "session_minutes": sorted(
            [random.randint(5, 12), random.randint(14, 28)]
        ),
        "rates": {
            "like": like,
            # The rest follow roughly from how much this person likes things.
            "save": round(like * random.uniform(0.15, 0.35), 3),
            "read_comments": round(like * random.uniform(0.15, 0.45), 3),
            "share": round(like * random.uniform(0.02, 0.08), 4),
        },
        "schedule": {
            "enabled": True,
            "active_hours": hours,
            "sessions_per_day": sorted(
                [random.randint(2, 4), random.randint(4, 6)]
            ),
            "gap_minutes": sorted(
                [random.randint(30, 70), random.randint(90, 220)]
            ),
            "chance_of_lazy_day": round(random.uniform(0.08, 0.25), 2),
        },
    }
    taken_rhythms.append(json.dumps(hours, sort_keys=True))
    return description, persona


def next_free_name():
    used = {n for n in taken_names if re.fullmatch(r"farm-\d+", n or "")}
    n = 1
    while f"farm-{n:02d}" in used:
        n += 1
    return f"farm-{n:02d}"


# --- write one file per phone ------------------------------------------------

written, skipped = [], []

for serial in serials:
    if serial in taken_serials:
        skipped.append((serial, "already has a settings file"))
        continue

    name = wanted_name or next_free_name()
    taken_names.add(name)
    taken_serials.add(serial)

    path = os.path.join(config_dir, f"{name}.json")
    if os.path.exists(path):
        skipped.append((serial, f"{name}.json already exists"))
        continue

    description, persona = invent_persona()

    config = {
        "_comment": f"{models.get(serial, 'phone')} - {description}. "
                    "Invented by tools/add-device.sh; change anything you like.",
        "device_id": name,
        "adb_serial": serial,
    }
    config.update(persona)
    config["seed"] = {
        "enabled": True,
        "keywords": [t.strip() for t in topic.split(",") if t.strip()],
    }
    config["ramp_up"] = {"account_started": account_started}

    with open(path, "w") as fh:
        json.dump(config, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    written.append((name, serial, description, persona))

# --- say what happened -------------------------------------------------------

for serial, why in skipped:
    print(f"  skipped {serial}: {why}")

if not written:
    print("\nNothing to do.")
    raise SystemExit(0)

print("\nWrote settings for:\n")
for name, serial, description, persona in written:
    hours = ", ".join(f"{a}:00-{b}:00" for a, b in persona["schedule"]["active_hours"])
    print(f"  {name}  ({serial})")
    print(f"    {description}")
    print(f"    awake      {hours}")
    print(f"    sessions   {persona['schedule']['sessions_per_day'][0]}-"
          f"{persona['schedule']['sessions_per_day'][1]} a day, "
          f"{persona['session_minutes'][0]}-{persona['session_minutes'][1]} min each")
    print(f"    likes      {persona['rates']['like'] * 100:.0f}% of what it sees")
    print()

if not topic:
    print("No topic set, so these phones will not search for anything.")
    print("Add one with:  --topic \"your keywords,here\"")
    print()

if not account_started:
    print("No account start date, so full rates apply from the first session.")
    print("For new accounts, add:  --account-started today")
    print()

print("Now push them:  ./tools/deploy.sh")
PY

# Getting the script onto the phones

From an Arch Linux machine. Three ways, for three different situations.

| Situation | Use |
|---|---|
| Changing the script and re-running it every few minutes | **`tools/run.sh`** — one command, copies and starts it |
| Setting up a phone for the first time | **USB cable + adb** |
| Updating the whole farm at once | **Wi-Fi + `tools/deploy.sh`** |

---

## Where the files go on the phone

AutoJs6 reads scripts from:

```
/sdcard/脚本/
```

That word is Chinese for "scripts". The app is a Chinese project and keeps this
folder name even on a phone set to English — an English `/sdcard/Scripts/` folder
is **not** read.

Both `run.sh` and `deploy.sh` write here by default. If a phone differs, set it
once and every command picks it up:

```bash
export REMOTE_DIR=/sdcard/whatever-your-phone-uses
```

> **Never keep two copies.** We once left an old copy in a second folder, ran it
> by mistake, and spent time debugging bugs that were already fixed. If you
> change folders, delete the old one.

---

## First: install the tools

```bash
sudo pacman -S android-tools android-udev
```

`android-tools` provides the `adb` command. `android-udev` lets you use it
without root.

Add yourself to the group `android-udev` creates, then **log out and back in** —
group changes only apply to a fresh login:

```bash
sudo usermod -aG adbusers "$USER"
```

## Turn on USB debugging on the phone

1. Settings → About phone → tap **Build number** seven times
2. Go back → Developer options → turn on **USB debugging**

**On Xiaomi (MIUI / HyperOS)** also turn on **Install via USB**. Xiaomi asks you
to sign into a Mi account first — annoying but unavoidable.

## Connect and check

Plug in the cable, then:

```bash
adb devices
```

You should see:

```
List of devices attached
a1b2c3d4    device
```

- **Nothing listed?** Try another cable. Many USB cables carry power only.
- **Says `unauthorized`?** Unlock the phone screen — the "Allow USB debugging?"
  prompt only appears when unlocked. Tick "always allow" and accept. If no
  prompt appears, pull down the notification shade, tap the USB notification and
  switch to **File Transfer**; in charging-only mode the prompt is often
  suppressed.
- **Says `no permissions`?** The group change has not taken effect. Log out and
  back in.
- **Still nothing?** Developer options → **Revoke USB debugging authorizations**,
  then unplug and replug.

---

## Running a script: `tools/run.sh`

```bash
./tools/run.sh main.js              # copy and start it
./tools/run.sh probe.js
./tools/run.sh main.js a1b2c3d4     # pick a phone by id
```

Note that `run.sh` sends only the file you name — not the settings, and not the
other scripts. If you changed two files and only ran one, the other is still the
old version on the phone. When in doubt, run `deploy.sh`.

A probe sent this way stays on the phone afterwards. `deploy.sh --clean` leaves
it alone on purpose, since it is a file you asked for. Remove it by hand when
you are finished:

```bash
adb shell 'rm -f /sdcard/脚本/probe_*.js'
```

**Do this every time.** Most probes only read the screen, but two of them do
something that cannot be undone — `probe_send_reaction.js` sends a sticker and
`probe_share_select.js` chooses somebody in the share panel. Both are fenced so
they only ever touch an account you named in the file, and neither belongs on a
phone that is going to be left running. An earlier probe, since deleted, sent
two stickers nobody asked for; `docs/WHAT-BROKE.md` has the story.

This is the loop you want while developing: edit on the laptop, run one command,
watch the phone.

**The script draws nothing on the phone.** It used to show AutoJs6's floating
console, but that window sits over the top-left of the screen and swallows any
swipe passing through it, which silently broke the swipe back to the previous
video. So watch from the laptop instead:

```bash
./tools/watch.sh              # follow it live
./tools/watch.sh --last 40    # just the last 40 lines
```

A phone that appears to be doing nothing is usually working fine — you are only
missing the window that used to show it.

To stop a running script, press **volume up** on the phone.

---

## Adding a phone: `tools/add-device.sh`

```bash
./tools/add-device.sh                                   # every phone without settings
./tools/add-device.sh --topic "cà phê" a1b2c3d4         # one phone, with a topic
./tools/add-device.sh --name farm-07 --account-started today a1b2c3d4
```

Writes a settings file for each connected phone that has none, filling in the
serial and inventing a daily rhythm unlike the ones already in use. It never
overwrites an existing file, and never pushes — run `deploy.sh` after.

Two options worth passing:

- `--topic "word,another"` — what this phone searches for. Without it the phone
  browses but never searches, so it never steers its feed.
- `--account-started today` — for a fresh account, so the rates start low and
  build up. Without it, full rates apply from the first session.

Phones made this way have **messaging on by default** (replying to messages and
sending videos to a friend). That stays harmless until the roster names other
accounts: with only itself on the list there is nobody to message. So before a
new phone can message anyone, add its account to the roster — see "The roster"
below.

## The roster: `config/accounts.json`

The messaging features only ever act on your own accounts. Rather than a list
per phone, every phone carries the same file — `config/accounts.json`, the
display names of all your accounts — and works out at startup which one it is,
then messages everyone on it but itself. To add an account, read its exact name
off its own phone:

```bash
./tools/run.sh probe_self_name.js a1b2c3d4     # prints: display name : "adiiaduu.tw"
```

Copy that `display name` into the `accounts` array. Do not type it by hand — the
name carries invisible characters, and a typed one never matches (which fails
safe: nothing sends). Only your own accounts belong here; with `allow_anyone`
off, a name not on the roster is a message that does not happen.

```jsonc
{ "accounts": ["adiiaduu.tw", "your-second-account", "your-third-account"] }
```

`deploy.sh` pushes this to every phone alongside the settings. One limit worth
knowing: an account only shows up in another's inbox or share panel once the two
have interacted before, so a cluster of brand-new accounts that have never met
has nobody to message yet — they must be introduced first.

## Updating every phone: `tools/deploy.sh`

```bash
./tools/deploy.sh                # push to all connected phones
./tools/deploy.sh a1b2c3d4       # push to one phone
./tools/deploy.sh --clean        # also delete stale files: old modules, leftover probes
./tools/deploy.sh --list         # list phones, with model and Android version
./tools/deploy.sh --dry-run      # show what would happen, change nothing
```

It copies three things to each phone:

- `src/main.js` and everything in `src/lib/`, the same files everywhere
- the matching `config/devices/*.json`, as `device.json` — this is what makes
  one phone behave differently from another
- `config/accounts.json`, as `accounts.json` — the shared roster of your own
  accounts, identical on every phone. Each phone reads its own name off its
  profile at startup and messages everyone on the roster except itself, so
  there is no per-phone list to keep

A settings file says which phone it belongs to by adb serial. Before sending
anything, `deploy.sh` checks every settings file parses, so one bad file stops
the run rather than landing on a phone. It also reports phones with no settings
file, and settings files whose phone never appeared — usually a typo in a
serial.

It never starts anything — beginning a session stays a deliberate act.

The diagnostic scripts in `src/probes/` are **not** sent by `deploy.sh`. They
have no place on a working phone: two of them press buttons, and running one by
accident on a farm phone is not something you want. Use `run.sh` to send one
over when you need it — and `deploy --clean` to sweep it off again afterwards.

It also warns about anything on the phone that does not belong there — an old
module, or a probe left behind by `run.sh`:

```
    STILL ON PHONE, does not belong on a farm phone: probe_self_name.js
    (run with --clean to delete these)
```

Take that warning seriously. A leftover copy is easy to run by mistake, and
then you are debugging a version you already fixed; a leftover probe is worse,
since two of them press something that cannot be taken back. `--clean` deletes
them, leaving only `main.js`, `lib/`, the two config files, and the phone's own
`farm_state.json` / `farm_status.json`.

---

## Checking on the farm: `tools/status.sh`

```bash
./tools/status.sh                # one line per phone
./tools/status.sh --history      # the last few sessions of each
./tools/status.sh a1b2c3d4       # just one phone
```

Every phone writes a note after each session. This collects them, so you can
see which phones are working without picking any of them up.

```
xiaomi-test  VC7PSS8LNJINY9HY  last 2026-07-22 19:01  22 videos  4 liked  ran_its_time
```

`ran_its_time` means the session simply finished. Anything else is flagged, and
so is a phone that has not finished a session in over eight hours.

---

## The two routines, end to end

The sections above describe each tool on its own. In practice you only ever do
one of two things.

### Bringing a new phone online

1. **Prepare the phone** (once): install AutoJs6, grant accessibility and file
   permissions, stop Android killing the script, and sign TikTok in to the
   account this phone will run. All of this is in `SETUP.md`.
2. **Connect it** and confirm it is ready: `./tools/deploy.sh --list` should
   show it. Over Wi-Fi, `adb connect <address>` first.
3. **Invent its settings**: `./tools/add-device.sh <serial>` — add
   `--topic "..."` for what it searches, and `--account-started today` for a
   fresh account. Messaging is on by default.
4. **Add its account to the roster**: `./tools/run.sh probe_self_name.js <serial>`,
   then paste the `display name` it prints into `config/accounts.json`.
5. **Push everything**: `./tools/deploy.sh <serial>`.
6. **Start it**: `./tools/run.sh main.js <serial>`, or open AutoJs6 on the phone
   and run `main.js`. The startup log prints `Running as: <name>` — check it is
   the account you expect. A phone with `schedule.enabled` then runs itself.

### Running the whole farm

1. **Connect every phone** and check the mapping: `./tools/deploy.sh --list`.
2. **Make sure the roster is complete** — `config/accounts.json` lists every
   account, each name captured with `probe_self_name.js` on its own phone.
3. **Push to all**: `./tools/deploy.sh --dry-run` to preview, then
   `./tools/deploy.sh --clean` to push and sweep off any probe left from
   debugging.
4. **Start each phone** (AutoJs6, or `run.sh main.js <serial>` per phone). The
   schedule takes over from there.
5. **Watch from your laptop**: `./tools/status.sh` — it shows each phone, the
   account it is running as, and how its last session went.

After any debugging session with a probe, run `./tools/deploy.sh --clean` so no
probe is left on a working phone.

---

## Wi-Fi instead of cables

Cables to a dozen phones is not practical. After a one-time pairing, adb works
over the network.

### Android 11 and newer

1. On the phone: Developer options → **Wireless debugging** → on
2. Tap **Pair device with pairing code**. The phone shows an address, a port and
   a six-digit code
3. On the laptop, using the **pairing** address and port:
   ```bash
   adb pair 192.168.1.50:41234
   ```
   Enter the six-digit code when asked
4. Then connect, using the address and port from the **main** Wireless debugging
   screen — this port is different from the pairing one:
   ```bash
   adb connect 192.168.1.50:37251
   ```

Pairing is remembered. Next time only `adb connect` is needed.

---

## Troubleshooting

**`adb: no devices/emulators found` over Wi-Fi after a while**

Phones drop off when they sleep or the router hands out a new address:

```bash
adb connect 192.168.1.50:37251
```

If that fails, re-pair. Giving each phone a fixed address in your router
settings avoids this entirely, and is worth doing for a farm.

**The file is on the phone but AutoJs6 does not show it**

Pull down to refresh the file list. If it still does not appear, you pushed to a
folder the app does not read — check it is `/sdcard/脚本/`.

**You changed the script but the phone runs the old behaviour**

There is a second copy somewhere. Check what is actually on the phone and
compare it with your local file:

```bash
adb shell 'ls /sdcard/脚本/'
adb shell 'md5sum /sdcard/脚本/main.js'
md5sum src/main.js
```

If the two checksums differ, the phone is running something else. `run.sh` and
`deploy.sh` both copy before running, so this should not happen — but it did
once, and it cost real time.

**Two phones with the same id**

Cheap phones sometimes ship with duplicate serial numbers, and adb cannot tell
them apart. Connect them over Wi-Fi instead: each is then identified by its
network address, which is always unique.

**`adb shell input tap` is refused on Xiaomi**

MIUI requires "USB debugging (Security settings)", which needs a Mi account.
This does not affect the script — AutoJs6 controls the screen through
accessibility, not adb — it only means you cannot tap through the phone's menus
remotely.

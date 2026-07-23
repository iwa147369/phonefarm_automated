# Setting up a phone

Do this once per phone. It takes about ten minutes.

## 1. Install AutoJs6

Download from https://github.com/SuperMonster003/AutoJs6/releases/latest

Pick the file matching the phone's processor. Almost every modern phone needs
**arm64-v8a**. If you are unsure, the `universal` file works on everything but is
much larger.

To check a connected phone:

```bash
adb shell getprop ro.product.cpu.abi
```

Android will warn you about installing from an unknown source. Allow it.

> Do not install AutoX.js or Auto.js 4.x. Both are abandoned, and Auto.js 4.1.1
> in particular targets Android 9 and misbehaves on newer phones. See section 3
> of the README.

## 2. Give AutoJs6 permission to control the screen

Go to **Settings → Accessibility → AutoJs6** and turn it on.

**On Android 13 and newer the switch will be greyed out.** Android blocks
accessibility access for apps that did not come from the Play Store. To unblock:

1. Settings → Apps → AutoJs6
2. Tap the three dots in the top right
3. Tap **Allow restricted settings**
4. Return to Accessibility and turn AutoJs6 on

This step catches people out. If the switch will not move, this is why.

To confirm it worked, from your laptop:

```bash
adb shell settings get secure enabled_accessibility_services
```

The output should mention `org.autojs.autojs6`.

## 3. Give it permission to read and write files

Settings → Apps → AutoJs6 → Permissions → Files → **Allow access to all files**.

Without this the script cannot save anything.

## 4. Stop Android from killing the script

Android shuts down background apps to save battery. If it shuts down AutoJs6
mid-session, the script simply stops. Each manufacturer hides this differently.

**Samsung**

- Settings → Battery → Background usage limits → make sure AutoJs6 is **not**
  in "Sleeping apps" or "Deep sleeping apps"
- Settings → Apps → AutoJs6 → Battery → **Unrestricted**
- Turn off **Adaptive battery**

**Xiaomi (MIUI / HyperOS)**

- Settings → Apps → AutoJs6 → **Autostart: on**
- Settings → Apps → AutoJs6 → Battery saver → **No restrictions**
- Settings → Apps → AutoJs6 → Other permissions → **Display pop-up windows
  while running in background: on** (without this it cannot open TikTok)

## 5. Set TikTok to English

The script finds buttons by their English names. Open TikTok → Profile → menu →
Settings and privacy → Language, and choose **English**.

The account must already be logged in. The script never logs in.

## 6. Screen settings

- Turn the screen timeout up, or keep the phone on a charger
- Turn off auto-rotate
- Turn off any always-on notification that covers the video feed

---

# Running a script

## Where the files live

AutoJs6 reads scripts from **`/sdcard/脚本/`**. That word is Chinese for
"scripts" — the app is a Chinese project and keeps the folder name even when the
phone is set to English. Do not create a second folder with an English name: the
app will not read it, and you will end up running an old copy by mistake.

## The quick way: from your laptop

```bash
./tools/run.sh main.js
```

This copies the file to the phone and starts it in one step. It is the fastest
loop while you are still changing the script. See `docs/DEPLOY.md` for how to
connect the phone first.

## From the phone

Open AutoJs6, pull down to refresh the file list, and tap the script.

## Stopping a session early

Press **volume up**. The script finishes the current video and stops cleanly,
rather than leaving TikTok halfway through an action.

## Watching what it does

The AutoJs6 console on the phone prints every action. You can also read the same
output from your laptop:

```bash
adb logcat -d | grep GlobalConsole | tail -40
```

---

# The scripts

`main.js` is the only one that belongs on a phone. The rest are diagnostic tools
that live in `src/probes/` on your laptop; `run.sh` sends one over when you ask
for it by name:

```bash
./tools/run.sh probe.js
```

Each probe repeats a few small helpers rather than sharing them. That is on
purpose: these are the tools you reach for when TikTok has changed and nothing
works, so each one has to run from a single file with nothing else alongside
it.

## `main.js` — the browsing session

Open it and change the `SETTINGS` block at the top. For a first run set
`session_minutes` to 2, which is enough to see whether it presses the right
buttons.

At the end it prints a summary. The line to watch is:

```
Buttons not found: 12 - run probe.js and update the BUTTON LABELS section
```

If that appears, the script was swiping but could not press anything, because
the button names no longer match this version of TikTok.

## `probe.js` — what are the buttons called?

Run this after any TikTok update, or on any phone where `main.js` cannot find
buttons.

1. Open TikTok and stop on any video in the feed
2. Run `probe.js`
3. Switch back to TikTok within 5 seconds
4. Read the section headed **LIKELY ACTION BUTTONS**

Copy what it prints into the `BUTTON LABELS` block in `main.js`.

## `probe_button_state.js` — how does a button show it is already on?

The script must never remove a like or save that a person made deliberately.
This works out how to tell whether a video is already liked or saved.

It presses each button, reads what changed, then presses again to put the video
back exactly as it was. The account ends up unchanged. If it cannot undo
something, it says so loudly instead of staying quiet.

Run it on a video you have **not** liked and **not** saved.

Findings for TikTok 46.1.3 are already recorded in section 4 of the README. Run
this again after a TikTok update, because these details do change.

## `probe_share_sheet.js` — what is inside the Share panel?

The Share panel is the one screen that can affect other people: along the top it
lists real accounts, and pressing one sends them the video as a private message.

This script opens the panel, writes down everything in it with its position on
screen, and closes it again. **It presses nothing inside the panel.** It also
checks which way of closing the panel actually works, which matters because the
back action does not close it on Android 16.

Run this after any TikTok update, before turning sharing back on.

## `probe_comment_panel.js` — what is inside the Comments panel?

The comments panel is the most dangerous screen in the app. It holds a text box,
a Send Gift button that spends real money, Reply buttons scattered among the
comments, and a heart on every comment that TikTok gives no readable name to.

This script opens the panel, writes down everything in it with its position, and
closes it again. **It presses nothing inside the panel**, and it works out which
band of the screen is safe to scroll through.

Run this after any TikTok update, before turning comment reading back on.

## `probe_search.js` — how to search and get back

Walks through searching for a word in stages, printing what it finds at each
one, and finishes by returning to the feed and checking it really got there.

It types a word into the search box. Nothing is posted; the only trace is a line
in our own search history, which is the point. It opens no results.

## `probe_feed_marker.js` — what tells the feed apart from everything else?

Writes down the labels on the feed, then searches and opens a result, writes
them down again, and prints what is on the feed but not in the results. Those
are the candidates for recognising the feed.

Worth knowing: this probe once got its own answer wrong. It offered "Search" as
a candidate and then used it to confirm it was back on the feed — but the search
screen has a "Search" label too, so it stopped one screen early. Read its output
rather than trusting its conclusion.

## The messages probes

These four worked out how to reply to a message and how to send a video to
somebody. Read them in this order — each answers what the one before it
uncovered.

**`probe_dm_state.js`** — reads the inbox and one conversation, and touches
nothing at all. No press of any kind; you can check that yourself with
`grep -nE "click|press|gesture" probe_dm_state.js`. It answered three questions
at once: how an unread conversation is marked, what makes the quick-reply bar
appear, and whether its buttons can be pressed properly.

Run it several times in different states — on the inbox, on a conversation just
opened, after touching the message box, after closing the keyboard. Each run
prints one `STATE:` line, and comparing those lines is the whole point.

**`probe_tidyname.js`** — proves that cleaning an account name works *on the
phone*. It sounds trivial and is not: the first version worked on a laptop and
deleted every name it was given on the phone. Run it after any change to how
names are compared.

**`probe_send_reaction.js`** — **sends a sticker.** That cannot be taken back,
so it runs five checks first and refuses if any fails: the right conversation by
name, an empty message box in its usual place, all five bar buttons drawn, and
the chosen button still where it was a moment ago. There is deliberately no
fallback — if a proper press will not work, it stops rather than tapping a
screen position.

Set `ONLY_IN_CONVERSATION` at the top to one of your own accounts before running
it. It refuses to run anywhere else.

## The sharing probes

**`probe_sticker_picker.js`** — opens the sticker grid, reads it, and presses
nothing inside. It is kept because it is the evidence for *not* using stickers:
13 of them, none with a label, in a grid that scrolls, under a pack strip that
reorders itself, with no Send step.

**`probe_share_to_user.js`** — reads the share panel's row of people, waits a
minute, and reads it again to see whether it moved. Also opens the panel's own
search. **It presses no person and no Send.**

**`probe_share_select.js`** — chooses one person by exact name and then stops,
which is how we learned what the send button is called. It will only ever choose
the name written into `SHARE_TO` at the top of the file, so set that to an
account you own. If it turns out that choosing sends after all, the video should
land somewhere harmless.

**`probe_engines.js`** — asks what one running script can see about the others.
Read-only: it starts nothing and stops nothing. Run it, then run it again within
forty seconds without stopping the first; it lingers on purpose so the second
copy has something to find.

It answered the question behind the single-copy check in `main.js`: a script can
read its own file path (`getSource().getFullPath()`), list everything running
(`engines.all()`), and spot another copy of itself within twenty milliseconds of
starting. That is why the check needs no lock file — and so leaves nothing
behind when a phone is switched off mid-session.

---

# Known unknowns

**The farm is older than planned, and it still works.** Everything above the
farm sections is confirmed on a Xiaomi 13T running Android 16. The farm turned
out to be Galaxy A9 and A8+ phones from 2018, on **Android 9 and 10**, running
**`com.zhiliaoapp.musically`** rather than the `com.ss.android.ugc.trill` build
that was tested. It ran 445 videos across four phones on its first day.

The one crack visible so far: the two Android 9 phones missed buttons 13 times
between them on that first day, and the Android 10 phone missed none. Nobody has
run `probe.js` on an Android 9 phone yet to find out which button it is.

**Xiaomi blocks remote tapping.** On MIUI, `adb shell input tap` is refused
unless you enable "USB debugging (Security settings)", which requires signing
into a Mi account. This does not affect the script at all — AutoJs6 controls the
screen through accessibility, not through adb — but it does mean you cannot
drive the phone's menus from your laptop while setting it up.

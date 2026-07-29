# phonefarm_automated

A script that makes Android phones browse TikTok on their own, the way a real person would.

We run it on a group of physical phones (a "phone farm"). Each phone has one TikTok account. The script watches videos, likes some of them, saves a few, reads the comments now and then, and shares the occasional one.

> **Status:** Running on the farm. All browsing features and both message features are proven on the real Galaxy A8+/A9 phones; the code is split into modules and covered by a test run. Open items are in section 14.

---

## 1. Why we are building this

Three goals, all served by the same browsing session:

| Goal | What it means | How we measure it |
|---|---|---|
| **Warm up accounts** | A brand-new TikTok account with no activity looks suspicious. The script gives it a normal-looking history so TikTok treats it as a real user. | Sessions per day, time of day, and interaction rates all stay inside normal human ranges |
| **Train the feed** | TikTok shows you more of what you watch. By watching and liking one topic, we push the "For You" page toward that topic. | Percentage of feed videos that match our target topic, tracked daily |
| **Collect data** | Save details of every video we see. | Number of records collected, and how many were read correctly |

These goals support each other. One browsing session produces all three results at once.

## 2. Decisions

| Topic | Decision | Reason |
|---|---|---|
| Automation tool | **AutoJs6** | See section 3. The tool we originally picked turned out to be abandoned |
| Devices | Real Android phones, **not emulators** | Emulators are easier for TikTok to detect |
| Minimum Android version | **Android 9** | The oldest version in the farm — the 2018 Galaxy A8+ phones. We use nothing newer, so one script runs everywhere |
| How the script finds buttons | **Accessibility labels only** | Android gives every button a spoken label, for example "Share video. 116 shares". Reading those is fast and does not depend on screen size |
| TikTok app language | **English**, on every phone | We match those labels by their English wording, so all phones must use the same language |
| Accounts | Already logged in, **one account per phone** | The script never touches login. Switching accounts on one phone lets TikTok link them together |
| Coordination | Each phone **runs on its own** | Same script everywhere, different settings per phone. No central server for now |
| Schedule | **Several short sessions per day** | 3 to 5 sessions of 10 to 25 minutes, spread across waking hours |
| Where data goes | Not decided yet | Deliberately left open until the browsing itself is solid |

## 3. Why AutoJs6, and not AutoX.js

This project first chose AutoX.js. That was wrong, and here is why, so nobody repeats the research.

**AutoX.js has stopped.** Its last release is 6.5.5.10 from July 2024, with no work on Android 15 or 16.

**AutoJs6 is alive.** Version 6.7.0 came out in March 2026. Its release notes list fixes for Android 16, including one for the "back" action failing — which is exactly what our share flow depends on. It works from Android 7 upwards, so it covers both the Android 16 test phone and the Android 9 and 10 farm phones. One app for everything.

Both are descendants of the original Auto.js, so they share the same commands and the script needs no rewriting.

Download: https://github.com/SuperMonster003/AutoJs6/releases/latest — pick the file matching the phone's processor, usually `arm64-v8a`.

## 4. What we have confirmed on a real phone

Everything below was measured on the test phone, not assumed. It is recorded here because most of it is counter-intuitive, and every trap below cost real debugging time to find.

**Test phone:** Xiaomi 13T, Android 16, screen 1220 x 2712
**TikTok:** `com.ss.android.ugc.trill`, version 46.1.3, English

**The farm phones are not like the test phone.** They are Galaxy A9 and A8+
handsets from 2018 on **Android 9 and 10**, running **`com.zhiliaoapp.musically`**
— older phones and a different TikTok build than anything measured below. The
script recognises either package. It ran 445 videos across four of them on its
first day, so the labels below hold up, but see `docs/WHAT-BROKE.md` for the one
place the two builds appear to differ.

**The buttons are called:**

```
Like        "Like video. 5,142 likes"
Comment     "Read or add comments. 27 comments"
Favorites   "Add or remove this video from Favorites."
Share       "Share video. 116 shares"
Follow      "Follow <creator name>"
```

Then there are the traps — more than a dozen, each one paid for in debugging: buttons that share an id, a "liked" video whose label says `Like`, a panel that ignores the back action, a list that relabels itself as you read it, and two occasions where the script did something nobody asked for. They live in **[docs/WHAT-BROKE.md](docs/WHAT-BROKE.md)**, with what each rule in the code is protecting against. **Read that file before changing anything in `src/`** — most of the odd-looking parts are load-bearing.

## 5. What the script does and does not do

### It does

- **Browse the For You feed** — swipe up, and watch each video for a realistic amount of time
- **Like videos** — only a small percentage, never a video that is already liked
- **Save videos** — add to Favorites, with the safeguard described in section 6
- **Read the comments** — open the panel, scroll through a few, and close it, the way someone curious what others thought would
- **Share** — copy the video's link, which stays inside TikTok and still counts as a share
- **Check its messages** — at the start of a session, open the inbox and reply to unread messages from your own accounts, with a sticker from the quick-reply bar. It works out which accounts those are from a shared roster it reads at startup, minus the one it is running as (see "The roster" in section 8)
- **Send a video to a friend** — share a video into one of those same accounts' inboxes, which is what gives the reply above something to answer

### It does not

- **Write anything.** No comments, no replies, no typed messages anywhere. A reply is a sticker and nothing else, and the message box is never touched — in the comments panel, in a conversation, or in the share panel.
- **Like anyone's comment.** That is a public action under our account's name.
- **Log in, type passwords, or switch accounts.** The account must already be signed in.
- **Message anyone who is not one of your own accounts.** Replies and videos go only to the accounts on your roster — never to the account the phone is running as, and never to a stranger. A name that cannot be found is a message that does not get sent.
- **Touch live streams or TikTok Shop.**
- **Get around security checks.** If a captcha or verification screen appears, the script stops and reports it.

## 6. Never undo what a person did

The script must never remove a like or a save that someone made deliberately. Each button needs a different approach, because TikTok tells us different amounts about each.

**Like** — easy. The selected flag says whether the video is already liked, so we check it and skip.

**Share** — nothing to check. Sharing is not a switch: copying a link twice just copies it twice, and takes nothing away. This is why it needs none of the care the other two do.

**Favorites** — no state to read, so we watch the number printed under the button instead. Press it, and the count goes up if we added a save and down if we removed one. If it went down, we press again immediately, putting the video back as we found it.

That check has a limit worth knowing: TikTok rounds anything above a thousand to "1.2K", and one save does not visibly move a rounded number. On those videos we cannot tell what happened, so **the script leaves them alone entirely**.

The practical effect is that the real save rate comes out lower than the number in the settings, because popular videos get skipped. That is a deliberate trade, not a fault. We would rather lose a save than remove one.

## 7. Files

```
phonefarm_automated/
├── README.md
├── config/
│   ├── devices/                   # one file per phone in the farm
│   │   └── xiaomi-test.json
│   ├── accounts.json              # the roster of our own accounts, shared by every phone
│   ├── test-all-features.json     # every rate turned up, for a test run only
│   └── examples/                  # personas to copy and adapt
│       ├── persona-early-riser.json
│       └── persona-night-owl.json
├── src/
│   ├── main.js                    # the browsing script
│   ├── lib/                       # the parts main.js loads - these go on the phone too
│   │   ├── settings.js            # the defaults, and why each one is what it is
│   │   ├── labels.js              # what TikTok's buttons are called
│   │   ├── state.js               # what every part shares: counters, why it stopped
│   │   ├── util.js                # dice, and careful ways of pressing a button
│   │   ├── feed.js                # opening TikTok, knowing which screen we are on
│   │   ├── actions.js             # like, save, comments, share, send to a friend
│   │   ├── messages.js            # the inbox, and the sticker reply
│   │   ├── seeding.js             # searching for a topic
│   │   ├── identity.js            # which of our accounts this phone is running as
│   │   └── schedule.js            # the day's plan, and the status note
│   └── probes/                    # diagnostic tools, kept off the phones
│       ├── probe.js               # prints every button on screen
│       ├── probe_button_state.js  # how a button shows it is already switched on
│       ├── probe_share_sheet.js   # what is inside the Share panel
│       ├── probe_comment_panel.js # what is inside the Comments panel
│       ├── probe_search.js        # how to search for a topic and get back
│       ├── probe_feed_marker.js   # how to know we are really on the feed
│       ├── probe_dm_state.js      # the inbox and a conversation, read-only
│       ├── probe_tidyname.js      # proves the name-cleaning works on the phone
│       ├── probe_sticker_picker.js# why the sticker grid was rejected
│       ├── probe_send_reaction.js # sends ONE sticker, with five checks first
│       ├── probe_share_to_user.js # the share panel's people row, read-only
│       ├── probe_share_select.js  # picks a person, stops before Send
│       ├── probe_engines.js       # what one running script can see of the others
│       ├── probe_require.js       # can a script on the phone load a second file
│       ├── probe_console_window.js# where the console panel sits, and can it move
│       ├── probe_search_result.js # which part of a search result opens the video
│       └── probe_self_name.js     # reads this account's own display name, read-only
├── tools/
│   ├── deploy.sh                  # send main.js and each phone's settings
│   ├── run.sh                     # send one script and start it, from your laptop
│   ├── test-run.sh                # exercise every feature and report what was seen
│   ├── check-shared-state.sh      # catch a module copying a shared value
│   ├── add-device.sh              # invent settings for a new phone
│   ├── watch.sh                   # follow what a phone is doing, live
│   └── status.sh                  # ask every phone how it has been getting on
└── docs/
    ├── SETUP.md                   # preparing a phone, and running a session
    ├── DEPLOY.md                  # getting files from your laptop to the phones
    └── WHAT-BROKE.md              # every trap, and why each rule exists
```

**Only `main.js` and `src/lib/` go on a phone.** The probes stay on the laptop, and `run.sh`
sends one over when you need it. Several of them press buttons, and two send
something that cannot be taken back — `probe_send_reaction.js` sends a sticker,
`probe_share_select.js` chooses a person in the share panel. Leaving those on a
farm phone is an accident waiting to happen. One earlier probe caused exactly
that and has been deleted rather than fixed; the story is in `WHAT-BROKE.md`.

They are worth keeping, though. Each one answers a question that is dangerous to
guess at, and every answer in section 4 came from one of them. When TikTok
changes its app, they are how you find out what changed.

`main.js` is about 660 lines — loading the parts, the browsing loop, the schedule loop, startup. Everything else is in `src/lib/`, ordered so each file needs only the ones below it, and nothing calls back into `main.js`. The split was proven with `probe_require.js`: `require()` works on the Android 9 phones and throws catchably when a file is missing, so a half-finished push is refused rather than run. One catch it did not reveal — a `require()` inside a module gets its own cache, its own fresh copy — is why shared values live on `global`, in `src/lib/state.js`.

`deploy.sh` and `run.sh` send `lib/` first and will not send `main.js` if any of it fails to arrive. `tools/check-shared-state.sh` guards the one rule the split adds: a value in `state.js` that gets replaced must always be reached as `state.something`, never copied into a local — a copy drifts silently and the phone records the wrong thing.

The probes each repeat a few small helpers rather than share them: they are what you reach for when TikTok has changed and nothing works, so each must run from a single file on its own.

## 8. Settings

The defaults sit in a `SETTINGS` block in `src/lib/settings.js`. Every phone runs that same file.

### Every setting, in one place

**How to change one.** Each phone reads its own file in `config/devices/`, listing only what should differ from the defaults; run `./tools/deploy.sh` to send changes to the phones. The full mechanics — the file format, `add-device.sh`, and what happens when settings are missing — are below the tables.

A range written as two numbers, like `[8, 22]`, means "pick a fresh value between these each time". A single number fixes it.

**Which phone this is**

| Setting | Example | What it does |
|---|---|---|
| `device_id` | `"farm-01"` | The name shown in the logs and status reports. Just a label. |
| `adb_serial` | `"VC7PSS8..."` | Which phone this file belongs to. Find it with `adb devices`. |

**How much it does**

| Setting | Example | What it does |
|---|---|---|
| `session_minutes` | `[8, 22]` | How long one session lasts, in minutes. |
| `rates.like` | `0.20` | Likes about 20 of every 100 videos it watches. |
| `rates.save` | `0.05` | Saves about 5 of every 100 to Favourites. |
| `rates.read_comments` | `0.05` | Opens the comments on about 5 of every 100. Reads only, never writes. |
| `rates.share` | `0.01` | Copies the video's link about 1 in 100. Stays inside TikTok. |
| `chance_of_swipe_back` | `0.04` | Now and then glances back at the previous video. Switched off by itself while the on-screen console is showing. |

**How long it watches each video**

| Setting | Example | What it does |
|---|---|---|
| `watch.short_seconds` | `[3, 9]` | A quick look, which most videos get. |
| `watch.long_seconds` | `[10, 28]` | A proper watch, which a few get. |
| `watch.chance_of_long_watch` | `0.30` | How often a video gets the proper watch. |
| `watch.chance_of_instant_skip` | `0.10` | How often it skips almost at once, the way people do. |
| `watch.instant_skip_seconds` | `[1, 2]` | How long those instant skips last. |
| `comments.scrolls` | `[0, 2]` | How many times it scrolls the comments. Zero is allowed on purpose. |
| `comments.read_seconds` | `[1.5, 3]` | How long it lingers while reading them. |

**Searching for a topic**

| Setting | Example | What it does |
|---|---|---|
| `seed.enabled` | `true` | Whether to search for a topic at all. |
| `seed.keywords` | `["coffee shop"]` | The words to search. Nothing happens while this is empty. |
| `seed.videos_to_watch` | `[3, 6]` | How many results to watch before going back to the feed. |
| `seed.once_per_day` | `true` | Search at most once a day. |

**When sessions happen**

| Setting | Example | What it does |
|---|---|---|
| `schedule.enabled` | `false` | Off = one session, then stop (use this for testing). On = keeps running all day. |
| `schedule.active_hours` | `[[9,13],[18,21]]` | The hours it is allowed to browse. 24-hour clock. |
| `schedule.sessions_per_day` | `[3, 5]` | How many sessions in a day. |
| `schedule.gap_minutes` | `[45, 180]` | The rest between one session and the next. |
| `schedule.chance_of_lazy_day` | `0.15` | How often a day does far fewer sessions than usual. |
| `schedule.state_file` | `".../farm_state.json"` | Where it remembers today's count. Leave as is. |

**Going easy on a new account**

| Setting | Example | What it does |
|---|---|---|
| `ramp_up.account_started` | `"2026-07-22"` | The date the account was made. Leave empty for full rates from day one. |
| `ramp_up.stages` | (a list) | How gently to start and how fast to grow. The defaults are sensible; rarely changed. |

**Messages — these two reach a real person**

> ⚠️ **A sticker or a video goes to an actual account the moment it fires, and it cannot be undone.** These features act on your **roster** — `config/accounts.json`, your own accounts and no one else. Each phone reads its own name off its profile and messages everyone on the roster *except itself*, so there is nothing to set per phone. Copy every name into the roster with `probe_self_name.js` rather than typing it — a name carries invisible characters, and a typed one never matches (which fails safe: nothing sends). Leave `allow_anyone` off. Full reasoning under "The roster" below.

| Setting | Example | What it does |
|---|---|---|
| `messages.enabled` | `true` | Whether to reply to messages at all. On by default for phones made with `add-device.sh`. |
| `messages.chance_of_checking` | `0.3` | How often a session begins by opening the inbox. |
| `messages.reply_to` | `[]` | **Leave empty to use the roster** (everyone on it but this phone). Name accounts here only to restrict to a subset — your own, always. |
| `messages.max_replies` | `[1, 2]` | Most replies in one session. |
| `messages.chance_of_replying` | `0.6` | Sometimes it reads a message and leaves without replying. |
| `messages.reactions` | `["Heart"]` | Which stickers it may send. |
| `send_to_friend.enabled` | `true` | Whether to send a video to a friend. On by default for phones made with `add-device.sh`. |
| `send_to_friend.rate` | `0.01` | Share of videos it sends on. Keep this low. |
| `send_to_friend.send_to` | `[]` | Same as `reply_to`: empty uses the roster; a list restricts to a subset of your own accounts. |
| `send_to_friend.max_per_session` | `2` | Most videos sent in one session. |
| `send_to_friend.allow_anyone` | `false` | Leave off. Lets a video go to somebody not on the roster — see the warning above. |
| `send_to_friend.chance_of_anyone` | `0.2` | Only used when `allow_anyone` is on. |
| `send_to_friend.never_send_to` | `[]` | Accounts never to contact, whatever else is set. |
| `roster_file` | `".../accounts.json"` | Where the shared roster of your own accounts is read from. Leave as is. |

**Safety and housekeeping**

| Setting | Example | What it does |
|---|---|---|
| `minimum_battery_percent` | `20` | Stops browsing and waits when the battery is lower than this. |
| `watchdog.stop_after_missed_buttons` | `8` | Ends the session after this many button lookups fail in a row — a sign TikTok changed. |
| `watchdog.status_file` | `".../farm_status.json"` | Where the after-session note is written. Leave as is. |
| `watchdog.keep_recent_sessions` | `20` | How many past sessions that note keeps. |
| `single_instance` | `true` | Refuses to start if a copy is already running on the phone. Leave on. |
| `verbose` | `true` | Prints every action to the console. |
| `show_console_window` | `true` | Shows the console panel on the phone, so you can read it by picking the phone up. |

**Each phone's own file.** `config/devices/` holds one per phone, named by its adb serial, listing only what differs from the defaults:

```jsonc
{
  "device_id": "farm-01",
  "adb_serial": "VC7PSS8LNJINY9HY",
  "rates": { "like": 0.14 },
  "schedule": { "enabled": true, "active_hours": [[6, 8], [12, 13], [18, 21]] },
  "seed": { "keywords": ["cà phê", "coffee shop"] },
  "ramp_up": { "account_started": "2026-07-01" }
}
```

`deploy.sh` copies the matching file to each phone as `device.json`. Nested settings merge (changing `rates.like` leaves `rates.save` alone); lists replace whole.

**Do not hand-copy one file across phones.** Twelve phones that wake at seven and like a fifth of what they see is a pattern no per-session randomness hides. `./tools/add-device.sh` invents a different rhythm for each phone that has none — different hours, rates and session lengths — and never overwrites or pushes. Run `deploy.sh` afterwards.

| If a phone's settings… | The script… |
|---|---|
| have no `device.json` | runs the defaults, warning it now behaves like every other phone in the same state |
| will not parse | **refuses to run** — a young account browsing at full rates because its ramp-up failed to load is worse than a phone that did nothing |
| load fine | prints what is in force at startup, so a mistake shows in the log, not as odd behaviour a week later |

A few things the tables do not say:

- **Searching a topic** sends a stronger signal than liking on the feed — these are videos the account chose to watch. The time spent counts inside the session, not on top of it.
- **`schedule.state_file` is not optional.** Android restarts apps; without it, every restart would begin the day's sessions afresh and the phone would browse in bursts far beyond the plan.
- **`allow_anyone`** lets a video go to someone not on your roster. Leave it off. Those are real people who never asked for it and mostly never answer — videos nobody answers is what spam looks like from outside, while your own accounts reply with a sticker, the opposite signal. Picture the whole farm too: if every phone sends to every other and all reply, you have a closed circle that looks human one session at a time and not at all as a whole.

### The roster

The two features that reach a real inbox only ever act on your **own** accounts. Keeping a list of them on each phone by hand does not scale: there are more accounts than phones, and an account can move from one phone to another. So every phone carries the **same** file — `config/accounts.json`, a list of all your accounts' display names — and works out at startup which one it is *itself*, by reading the display name off its own Profile screen (`src/lib/identity.js`, settled on the farm's build with `probe_self_name.js`). What it may message is then simply **the roster minus its own name**, with nothing to edit per phone. `deploy.sh` pushes `accounts.json` to every phone; the startup log prints `Running as: <name>` so you can see who each phone thinks it is.

```jsonc
{ "accounts": ["adiiaduu.tw", "your-second-account", "your-third-account"] }
```

Fill it with `probe_self_name.js` run on each phone — it prints the exact display name, invisible characters and all, ready to paste. A name spelled even slightly differently never matches, which fails safe: no message goes out. Only your own accounts belong here; a stranger must never appear, and with `allow_anyone` off a name that is not on the roster is a message that does not happen.

One thing the roster cannot do on its own: an account only shows up in another's inbox or share panel once the two have interacted — followed or messaged before. A cluster of brand-new accounts that have never met has nobody to message yet, roster or not; they have to be introduced first.

## 9. Proving it still works

Before a phone runs a whole day, and before new code reaches the rest of the farm, one phone is put through everything:

```bash
./tools/test-run.sh <phone id>
```

It saves the phone's own settings, swaps in `config/test-all-features.json` (every rate turned up), runs two short sessions, and puts the phone back exactly as it was — even if you interrupt it.

**The pass mark is what the phone wrote down, not what it said it was about to do.** The report is built from `farm_status.json`, so a feature counts only if it left a number behind:

```
  FEATURE                 COUNT   VERDICT
  watched videos            41   seen
  liked                     22   seen
  saved to favourites       15   seen
  read comments             15   seen
  copied a share link       14   seen
  searched a topic            4   seen
  replied to a message        1   seen
  sent to a friend            1   seen
```

This matters because "it ran without errors" proves nothing: a phone can swipe for six minutes, press nothing, and finish with a tidy summary — the failure this project keeps meeting, and why the topic search was found broken on the farm despite months of clean-looking runs. Two sessions, not one, so the counters can be seen resetting to zero between them.

The two features that message a person (`messages`, `send_to_friend`) fire only against the account named in the test config, and only when the setup is there for them — an unread message this phone can reply to, and that account showing in the share panel. Point them at your **own** account and send it a message first, or they safely do nothing. The swipe back (off while the console shows) and the watchdogs — a renamed button, a login wall, a flat battery — cannot be brought about to order, and are reported as not tested rather than passed.


## 10. Noticing when a phone stops working

A farm is a dozen phones nobody is looking at. A phone that quietly stopped three days ago looks exactly like a healthy one until someone checks.

**Each phone writes a note after every session** — when it finished, how many videos, what it did, and why it ended. Kept small: the last session in full plus a short history, capped so it never grows. Written even when the session ends in an error, because those are the ones worth reading.

Collect them from the whole farm:

```bash
./tools/status.sh
./tools/status.sh --history
```

```
xiaomi-test  VC7PSS8LNJINY9HY  last 2026-07-22 19:01  22 videos  4 liked  ran_its_time
```

`ran_its_time` is the healthy ending. Anything else is flagged, as is a phone that has not finished a session in over eight hours.

**The script also gives up on its own** when carrying on would be pointless:

| What it notices | Why it stops |
|---|---|
| Eight button lookups fail in a row | The buttons have been renamed, which is what a TikTok update does. Every phone in the farm will hit this on the same day. Swiping at nothing for hours helps nobody |
| The screen went off | A dark phone cannot be browsing |
| Battery below the minimum | |
| TikTok will not reopen after three tries | |
| A login or verification screen appears | Needs a person |

One or two misses are normal — a video may still be loading — so it is the *run* of failures that counts, not the total.

## 11. Staying undetected

This decides how long the script keeps working. These rules are not optional.

1. **Never use a fixed number.** Every pause, rate and watch time is a random range, with short watches made more common than long ones, because that is how people behave.
2. **Swipes must be curved.** A real finger does not travel in a straight line at constant speed. Swipes follow a curve, vary in speed, and start from a slightly different spot each time.
3. **Include pointless actions.** Sometimes swipe back to the previous video. What gives a bot away is being *too efficient*.
4. **Respect a human schedule.** No activity outside waking hours, a long break overnight, and the occasional quiet day.
5. **Start slow, build up.** A new account should only watch and rarely like in its first week, with saving and sharing turned on later.
6. **Give every phone a different personality.** A whole farm browsing the same topic on the same rhythm is an obvious pattern.
7. **Stop when something looks wrong.** Captcha, verification, logout or rate limiting all mean: stop, write it down, do not retry.

## 12. Known risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| A TikTok update renames the buttons | **High** — expect it | All labels sit in `src/lib/labels.js`. `probe.js` finds the new ones in about ten seconds |
| Android shuts down the automation service in the background | Medium | Setup instructions cover the battery settings, per manufacturer |
| An account gets restricted | Medium | Low interaction rates, slow ramp-up, different personality per phone |
| Many phones on one internet connection look linked | Medium | Outside what the script can fix. Needs a decision on separate mobile data or proxies |
| Two copies of the script on one phone, and the old one runs | Medium | It has already happened once. `deploy.sh` and `run.sh` both write to the same single folder — never keep a second copy. The single-copy check below does **not** cover this: it matches copies by file path, so a stale copy in another folder looks like a different script |
| The farm phones behave differently from the test phone | **Mostly handled** | The `musically` build lays several screens out differently from the test phone's `trill`. Each difference found so far — search results, the reply bar, the share panel — is fixed and recorded in `docs/WHAT-BROKE.md`. Expect more on any new model |
| Android kills the script during the long waits between sessions | **Held up on the real farm** | The script must stay alive for hours doing nothing, which is exactly what battery savers target. The operator confirms it survives a full day on the farm phones. Watch it anyway on any new phone model |
| Two copies of the script running on one phone | **Handled** | Starting the script does not stop a copy already running, and both look healthy while quietly doubling the session count. A copy that finds an older one now stands down. See `docs/WHAT-BROKE.md` |

## 13. Plan

### Phase 1 — one phone working  ✅ done

Install and permissions, real button labels, browsing, like/save without ever undoing one, human pauses and curved swipes, timed sessions, reading comments, sharing, and a full session with every action firing.

### Phase 2 — personalities and topics
- [x] Several sessions a day, waking hours, and gaps between them
- [x] Hold the rates down while an account is new
- [x] Prove the schedule survives a full day without Android killing it
      (confirmed by the operator on the real farm, not from logs)
- [ ] Decide where collected data goes
- [ ] Read captions and hashtags, and score how well a video matches a topic
- [ ] Treat on-topic and off-topic videos differently
- [x] Seed a topic through search
- [x] Give up when the buttons stop being findable, or the screen goes off
- [x] Leave a note on each phone so the farm can be checked from the laptop
- [x] Refuse to start when another copy of the script is already running
- [ ] Confirm the login and captcha checks actually fire (never seen one yet)

### Phase 3 — the whole farm
- [x] Prove everything again on the real farm phones
- [x] Per-phone settings files
- [x] Collect results from every phone
- [ ] A daily summary per phone

## 14. What we still need

**Before the farm runs unattended:**

- **A probe on an Android 9 phone.** On the first farm day the two Android 9
  phones missed buttons 13 times between them, and the Android 10 phone missed
  none. Something is named differently on the older build, and nobody knows
  what yet. It has not stopped a session — the cut-off is 8 misses in a row —
  but it is the one measured crack in an otherwise clean first day.

**Unproven:**

- The login and captcha `stop_signals` have never actually fired.
- Some conversations have no quick-reply bar at all. The likely reason is that
  the two accounts do not follow each other — if so it is fixed by following,
  not by code.

**Decisions still open:**

- Where collected data goes. Deliberately deferred.
- The real niche keywords. `seed.keywords` is still empty.

## A note on rules and risk

Automating interactions goes against TikTok's Terms of Service. Accounts may be restricted or permanently banned. This project is intended for accounts we own and for risk we have accepted knowingly. Please weigh that before scaling up.

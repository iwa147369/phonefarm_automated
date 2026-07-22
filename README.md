# phonefarm_automated

A script that makes Android phones browse TikTok on their own, the way a real person would.

We run it on a group of physical phones (a "phone farm"). Each phone has one TikTok account. The script watches videos, likes some of them, saves a few, reads the comments now and then, and shares the occasional one.

> **Status:** Phase 1 complete on one test phone. Browsing, liking, saving and sharing all proven on a real device. Nothing has been tested on the farm phones yet.

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
| Minimum Android version | **Android 11** | The oldest version in the farm. We use nothing newer, so one script runs everywhere |
| How the script finds buttons | **Accessibility labels only** | Android gives every button a spoken label, for example "Share video. 116 shares". Reading those is fast and does not depend on screen size |
| TikTok app language | **English**, on every phone | We match those labels by their English wording, so all phones must use the same language |
| Accounts | Already logged in, **one account per phone** | The script never touches login. Switching accounts on one phone lets TikTok link them together |
| Coordination | Each phone **runs on its own** | Same script everywhere, different settings per phone. No central server for now |
| Schedule | **Several short sessions per day** | 3 to 5 sessions of 10 to 25 minutes, spread across waking hours |
| Where data goes | Not decided yet | Deliberately left open until the browsing itself is solid |

## 3. Why AutoJs6, and not AutoX.js

This project first chose AutoX.js. That was wrong, and here is why, so nobody repeats the research.

**AutoX.js has stopped.** Its last release is 6.5.5.10 from July 2024, with no work on Android 15 or 16.

**AutoJs6 is alive.** Version 6.7.0 came out in March 2026. Its release notes list fixes for Android 16, including one for the "back" action failing — which is exactly what our share flow depends on. It works from Android 7 upwards, so it covers both the Android 16 test phone and the Android 11 to 13 farm phones. One app for everything.

Both are descendants of the original Auto.js, so they share the same commands and the script needs no rewriting.

Download: https://github.com/SuperMonster003/AutoJs6/releases/latest — pick the file matching the phone's processor, usually `arm64-v8a`.

## 4. What we have confirmed on a real phone

Everything below was measured on the test phone, not assumed. It is recorded here because most of it is counter-intuitive, and every trap below cost real debugging time to find.

**Test phone:** Xiaomi 13T, Android 16, screen 1220 x 2712
**TikTok:** `com.ss.android.ugc.trill`, version 46.1.3, English

**The buttons are called:**

```
Like        "Like video. 5,142 likes"
Comment     "Read or add comments. 27 comments"
Favorites   "Add or remove this video from Favorites."
Share       "Share video. 116 shares"
Follow      "Follow <creator name>"
```

Then there are the traps. There are more than a dozen now, and every one cost
real debugging time — buttons that share an id, a "liked" video whose label says
`Like`, a panel that ignores the back action, a list that relabels itself while
you read it, and two occasions where the script did something nobody asked for.

They live in **[docs/WHAT-BROKE.md](docs/WHAT-BROKE.md)**, with what went wrong
and what each rule in the code is protecting against.

**Read that file before changing anything in `src/main.js`.** Most of the
odd-looking parts are load-bearing.

## 5. What the script does and does not do

### It does

- **Browse the For You feed** — swipe up, and watch each video for a realistic amount of time
- **Like videos** — only a small percentage, never a video that is already liked
- **Save videos** — add to Favorites, with the safeguard described in section 6
- **Read the comments** — open the panel, scroll through a few, and close it, the way someone curious what others thought would
- **Share** — copy the video's link, which stays inside TikTok and still counts as a share
- **Check its messages** — at the start of a session, open the inbox and reply to unread messages from a named list of accounts, with a sticker from the quick-reply bar
- **Send a video to a friend** — share a video into another account's inbox, which is what gives the reply above something to answer

### It does not

- **Write anything.** No comments, no replies, no typed messages anywhere. A reply is a sticker and nothing else, and the message box is never touched — in the comments panel, in a conversation, or in the share panel.
- **Like anyone's comment.** That is a public action under our account's name.
- **Log in, type passwords, or switch accounts.** The account must already be signed in.
- **Message anyone who is not on a list you wrote.** Replies go only to `reply_to`; videos go only to `send_to`. A name that cannot be found is a message that does not get sent.
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
│   └── examples/                  # personas to copy and adapt
│       ├── persona-early-riser.json
│       └── persona-night-owl.json
├── src/
│   ├── main.js                    # the browsing script - defaults are at the top
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
│       └── probe_share_select.js  # picks a person, stops before Send
├── tools/
│   ├── deploy.sh                  # send main.js and each phone's settings
│   ├── run.sh                     # send one script and start it, from your laptop
│   ├── add-device.sh              # invent settings for a new phone
│   ├── watch.sh                   # follow what a phone is doing, live
│   └── status.sh                  # ask every phone how it has been getting on
└── docs/
    ├── SETUP.md                   # preparing a phone, and running a session
    ├── DEPLOY.md                  # getting files from your laptop to the phones
    └── WHAT-BROKE.md              # every trap, and why each rule exists
```

**Only `main.js` goes on a phone.** The probes stay on the laptop, and `run.sh`
sends one over when you need it. Several of them press buttons, and two send
something that cannot be taken back — `probe_send_reaction.js` sends a sticker,
`probe_share_select.js` chooses a person in the share panel. Leaving those on a
farm phone is an accident waiting to happen. One earlier probe caused exactly
that and has been deleted rather than fixed; the story is in `WHAT-BROKE.md`.

They are worth keeping, though. Each one answers a question that is dangerous to
guess at, and every answer in section 4 came from one of them. When TikTok
changes its app, they are how you find out what changed.

`main.js` is one file rather than many small ones. That is on purpose: it is pushed and run as a single unit, so a change is one copy and one restart. Splitting it would mean several files having to arrive on the phone together and load each other correctly — a new way for things to break, in exchange for tidiness. Worth revisiting once the farm is running, not before.

The probes repeat a few small helpers instead of sharing them, for the same kind of reason: they are what you reach for when TikTok has changed and nothing works, so each has to run from a single file on its own.

## 8. Settings

The defaults sit in a `SETTINGS` block at the top of `src/main.js`. Every phone runs that same file.

**What makes one phone different from another is its own settings file.** `config/devices/` holds one per phone, naming the phone by its adb serial and listing only what differs:

```jsonc
{
  "device_id": "farm-01",
  "adb_serial": "VC7PSS8LNJINY9HY",

  "rates": { "like": 0.14 },
  "schedule": {
    "enabled": true,
    "active_hours": [[6, 8], [12, 13], [18, 21]]
  },
  "seed": { "keywords": ["cà phê", "coffee shop"] },
  "ramp_up": { "account_started": "2026-07-01" }
}
```

`deploy.sh` copies the matching file to each phone as `device.json`. Nested settings merge, so changing `rates.like` leaves `rates.save` alone; lists replace whole, because blending one phone's waking hours with the defaults would produce nonsense.

**This is where carelessness costs the most.** Every session already varies its own timing, but if twelve phones wake at seven, like a fifth of what they see, and search the same words, that is a pattern no per-session randomness hides. Copying one file twelve times defeats the entire purpose.

So do not write them by hand:

```bash
./tools/add-device.sh --topic "cà phê,coffee shop" --account-started today
```

That writes a settings file for every connected phone that has none, inventing a different daily rhythm for each: different waking hours, different appetite for liking things, different session lengths. It prefers a rhythm no other phone has been given yet, then nudges the hours so that even two phones on the same rhythm do not line up.

```
farm-02  (VC7PSS8LNJINY9HY)
  checks it over breakfast and again at night
  awake      7:00-8:00, 12:00-14:00, 20:00-23:00
  sessions   3-4 a day, 10-15 min each
  likes      23% of what it sees
```

It never overwrites an existing file and never pushes anything — run `deploy.sh` afterwards. Everything it writes is ordinary settings you can edit.

Three things go wrong, and each is handled differently:

| What happened | What the script does |
|---|---|
| No `device.json` | Runs the defaults, warning that this phone now behaves like every other phone in the same state |
| `device.json` will not parse | **Refuses to run.** On a farm nobody is watching, and a two-day-old account browsing at full rates because its ramp-up failed to load is worse than a phone that did nothing |
| Settings loaded | Prints what is actually in force at startup, so a mistake shows up in the log rather than as odd behaviour a week later |

`deploy.sh` checks every settings file parses before sending any of them, and reports both phones with no settings and settings whose phone never appeared — usually a typo in a serial.

```js
// Two numbers mean a range, picked fresh each session. One number fixes it.
session_minutes: [8, 22],

rates: {                      // 0.20 means "on about 20 out of every 100 videos"
  like: 0.20,
  save: 0.05,
  read_comments: 0.05,
  share: 0.01
},

watch: {
  short_seconds: [3, 9],      // most videos get a short look
  long_seconds: [10, 28],     // a few get watched properly
  chance_of_long_watch: 0.30,
  chance_of_instant_skip: 0.10,
  instant_skip_seconds: [1, 2]
},

comments: {
  scrolls: [0, 2],            // zero included on purpose - see below
  read_seconds: [1.5, 4.5]
},

chance_of_swipe_back: 0.04,   // occasionally glance back at the last video
minimum_battery_percent: 20,
```

Per-phone settings files and reusable personalities come later, once one phone is fully proven.

### Searching for a topic

```js
seed: {
  enabled: true,
  keywords: [],              // nothing happens while this is empty
  videos_to_watch: [3, 6],
  once_per_day: true
}
```

Put the topic's search terms in `keywords`. The script picks one at the start of a session, watches a few results, and goes back to the feed. Liking here matters more than liking on the feed: these are videos we chose to watch, so the signal is stronger.

The time spent searching counts as part of the session rather than being added on top, so a session that seeds does not quietly run longer than the schedule planned.

### Deciding when sessions happen

These go in a phone's own settings file. By default the script runs one session and stops. That is the right mode for testing. Turning the schedule on makes it stay running and wake up a few times a day by itself:

```js
schedule: {
  enabled: false,
  active_hours: [[7, 9], [12, 14], [19, 23]],   // 24-hour clock
  sessions_per_day: [3, 5],
  gap_minutes: [45, 180],
  chance_of_lazy_day: 0.15,
  state_file: "/sdcard/脚本/farm_state.json"
}
```

This matters more than it may look. A phone that browses whenever someone remembers to press start — including at three in the morning — looks nothing like a person, however human each individual session is.

**The state file is not optional.** Android restarts apps often. Without somewhere to remember how many sessions today has already had, every restart would begin a fresh run of them, and the phone would browse in bursts far beyond the plan. The file holds four things: the date, how many sessions were planned, how many have happened, and when the last one ended.

### Going easy on a new account

An account created yesterday that likes a fifth of everything it sees looks wrong. Set the date it was created and the rates start low and grow:

```js
ramp_up: {
  account_started: "2026-07-22",     // leave empty to use full rates from day one
  stages: [
    { first_days: 7,  rates: { like: 0.05, save: 0,    read_comments: 0.02, share: 0     } },
    { first_days: 21, rates: { like: 0.12, save: 0.03, read_comments: 0.04, share: 0.005 } }
    // after 21 days, the full rates apply
  ]
}
```

Left empty, the script says so at startup rather than quietly guessing.

### Messages

Two halves of one exchange. This phone sends a video to another account; that
account answers with a sticker at the start of its next session, which may be
hours later. The delay is not simulated — it falls out of the schedule.

Both are off until you write names into them, and both refuse anything not
named. A name that cannot be found is a message that does not get sent.

```js
messages: {
  enabled: true,
  chance_of_checking: 0.3,             // not every session opens the inbox
  reply_to: ["farm-02", "farm-07"],    // exact names, as the inbox shows them
  max_replies: [1, 2],                 // leaving some unread is realistic
  chance_of_replying: 0.6,             // sometimes read it and leave
  reactions: ["Heart", "Lol", "ThumbsUp"]
},

send_to_friend: {
  enabled: true,
  rate: 0.01,                          // share of videos watched
  send_to: ["farm-02"],                // your own accounts
  max_per_session: 2,
  allow_anyone: false,                 // see below before turning this on
  chance_of_anyone: 0.2,
  never_send_to: []                    // never contacted, whatever else is set
}
```

**A word about `allow_anyone`.** Turning it on lets a video go to somebody not
on your list — anyone the account has been talking to recently. The argument for
it is that always sending to the same one friend is its own pattern.

The argument against is bigger. Those are real people who did not ask for this.
They can block or report, and most will simply never answer — and videos that
nobody responds to is what spam looks like from outside. Sending to your own
accounts gets a sticker back, which is the opposite signal.

It also gives up the safety we get from a list. If you do turn it on, keep
`chance_of_anyone` small, and put anyone who must never be contacted by a script
into `never_send_to`.

**Think about the shape of the whole farm, not just one phone.** If every phone
sends to every other phone and they all answer, you have built a closed circle:
accounts registered together, talking only to each other, always replying. Each
session looks human and the farm does not. Give each phone one or two names
rather than all of them.

## 9. Noticing when a phone stops working

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

## 10. Staying undetected

This decides how long the script keeps working. These rules are not optional.

1. **Never use a fixed number.** Every pause, rate and watch time is a random range, with short watches made more common than long ones, because that is how people behave.
2. **Swipes must be curved.** A real finger does not travel in a straight line at constant speed. Swipes follow a curve, vary in speed, and start from a slightly different spot each time.
3. **Include pointless actions.** Sometimes swipe back to the previous video. What gives a bot away is being *too efficient*.
4. **Respect a human schedule.** No activity outside waking hours, a long break overnight, and the occasional quiet day.
5. **Start slow, build up.** A new account should only watch and rarely like in its first week, with saving and sharing turned on later.
6. **Give every phone a different personality.** A whole farm browsing the same topic on the same rhythm is an obvious pattern.
7. **Stop when something looks wrong.** Captcha, verification, logout or rate limiting all mean: stop, write it down, do not retry.

## 11. Known risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| A TikTok update renames the buttons | **High** — expect it | All labels sit in one block in `main.js`. `probe.js` finds the new ones in about ten seconds |
| Android shuts down the automation service in the background | Medium | Setup instructions cover the battery settings, per manufacturer |
| An account gets restricted | Medium | Low interaction rates, slow ramp-up, different personality per phone |
| Many phones on one internet connection look linked | Medium | Outside what the script can fix. Needs a decision on separate mobile data or proxies |
| Two copies of the script on one phone, and the old one runs | Medium | It has already happened once. `deploy.sh` and `run.sh` both write to the same single folder — never keep a second copy |
| The farm phones behave differently from the test phone | **Unknown** | Nothing has been tried on a Samsung yet. See section 12 |
| Android kills the script during the long waits between sessions | **Unknown, and the main risk of scheduled mode** | The script must stay alive for hours doing nothing, which is exactly what battery savers target. Untested over a full day |

## 12. Plan

### Phase 1 — one phone working
- [x] Install AutoJs6, grant permissions, prepare the phone
- [x] Find the real button labels on our TikTok version
- [x] Launch TikTok, wait for the feed, swipe between videos
- [x] Like, without ever removing an existing like
- [x] Save, without ever removing an existing save
- [x] Human-like pauses and curved swipes
- [x] A session that runs for a set time and stops
- [x] Read the comments without ever writing or liking one
- [x] Share, and get back out of the panel cleanly
- [x] Run a session with every action firing and no button going unfound

### Phase 2 — personalities and topics
- [x] Several sessions a day, waking hours, and gaps between them
- [x] Hold the rates down while an account is new
- [ ] Prove the schedule survives a full day without Android killing it
- [ ] Decide where collected data goes
- [ ] Read captions and hashtags, and score how well a video matches a topic
- [ ] Treat on-topic and off-topic videos differently
- [x] Seed a topic through search
- [x] Give up when the buttons stop being findable, or the screen goes off
- [x] Leave a note on each phone so the farm can be checked from the laptop
- [ ] Confirm the login and captcha checks actually fire (never seen one yet)

### Phase 3 — the whole farm
- [ ] Prove everything again on a Samsung running Android 11 to 13
- [ ] Per-phone settings files
- [ ] Collect results from every phone
- [ ] A daily summary per phone

## 13. What we still need

**Before the farm runs unattended:**

- **A Samsung on Android 11–13.** Nothing here has ever run on one. The farm is
  Samsung; the test phone is a Xiaomi on Android 16. This is the real unknown.
- **A lock so two copies cannot run at once.** Two schedulers were seen running
  together, which would double every session count.
- **A full day on the schedule.** It has never survived one. Android may kill it.

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

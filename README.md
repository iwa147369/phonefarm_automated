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

**Trap 1 — the Like and Share buttons have the same id.** TikTok gives both the id `fux`. Ids are also scrambled on every app release. So we never match on the id, only on the spoken label.

**Trap 2 — the screen holds two sets of buttons.** TikTok keeps the *next* video's buttons loaded just below the visible area. A plain search for the Like button finds two, and pressing the wrong one likes a video that was never on screen. Every search filters by position, keeping only what is actually visible.

**Trap 3 — "liked" does not say "unlike".** Once a video is liked the label shortens to just `"Like"`, with the count dropped, and the selected flag turns true:

```
not liked  ->  "Like video. 186 likes"    selected false
liked      ->  "Like"                     selected true
```

A check looking for the word "unlike" would read a liked video as unliked, press the button, and take the like back off.

**Trap 4 — Favorites hides its state completely.** The label reads "Add or remove this video from Favorites." either way, and no flag changes:

```
not saved  ->  "Add or remove this video from Favorites."   selected false
saved      ->  "Add or remove this video from Favorites."   selected false
```

There is no way to ask TikTok whether a video is saved. Section 6 explains what we do instead.

**Trap 5 — a button can say it is pressable and still refuse.** On the search screen the button that sends the search reports `clickable = true`, and pressing it properly is refused every time. TikTok built it to answer a real finger, not the press Android's accessibility layer offers. A tap at its own coordinates works. The button that *opens* search, on the same screen, does accept a proper press — so no single way of pressing works everywhere.

**Trap 6 — the Like button is not proof you are on the feed.** Every video player has one: search results, a creator's videos, all of them. The script used to check for it and concluded it was back on the feed while still inside the search results, then browsed there for a whole session, reporting success throughout. The tab labelled **"For You"** is the real marker — it names the feed and appears nowhere else.

Be careful which label you pick for this. "Search" also appears on the feed, and looks like a fine marker until you notice the search screen has one too — a check using it reports success one screen too early. It fooled the very probe written to find the answer.

**Trap 7 — AutoJs6's own console window swallows swipes.** Turning on the floating console puts a large translucent panel over roughly the top-left of the screen — about 2 to 68 per cent across, 5 to 45 per cent down. Any gesture passing through that area lands on the panel, not on TikTok.

It broke the swipe back to the previous video, which starts around 30 per cent down and so began inside the panel every time. The swipe to the *next* video starts lower and was unaffected — which is why only one of the two failed, and why it took a while to notice. The script now leaves that window off, and reads its log from the laptop instead.

The wider lesson: **a swipe reports nothing about what it hit.** A swipe onto a panel covering the screen looks exactly like one that worked. Anywhere that matters, the script now checks the screen actually changed rather than assuming the gesture landed.

**Trap 8 — pressing a button can make the next video's button answer you.** After a press, TikTok redraws, and for a moment a fresh search can return the *next* video's button instead of the one you were working on. Anywhere a reading decides whether to press again, we insist the button is back in the same place on screen first. Getting this wrong in the Favorites check would cause exactly the damage that check exists to prevent.

### Inside the Share panel

The Share panel is the one screen that can affect other people. Top to bottom:

```
71%   "Send to", a search box, and Close
79%   real account names - pressing one sends them a private message
87%   Repost, COPY LINK, Messenger, WhatsApp, Facebook, Telegram, SMS
96%   Report, Not interested, Download, Add to Story, Promote, Cast
```

Only **Copy link** is safe. The account row sits just 8% of the screen above it, around 220 pixels, which is why nothing in this panel is ever pressed by position — only by an exact label match on a view that reports itself as pressable.

Two more findings, both measured:

- **The back action does not close this panel on Android 16.** Neither does tapping the dimmed area above it. The panel's own Close button does, first time, every time.
- **Copying a link does count as a share.** The number under the Share button goes up by one. That is the whole reason the action is worth its risk; if it had not counted, we would have dropped sharing the way we dropped commenting.

Sharing is also slow — about ten seconds per video, start to finish — which is a second reason to keep its rate low.

### Searching for a topic

Searching and watching the results is the strongest signal we can send about what the account is interested in. The flow is: open search, type the word, send it, open one of the results, watch a few, come back.

```
7%    the text box, Clear search field, and the button that sends the search
11%   tabs: Top | Users | Videos | Sounds | Hashtags | LIVE | Photos | Places
34%+  results, each labelled "Video by <creator>, <caption>, Liked by 39.1K users"
```

Getting back out is the risky part, and it needs care in two ways.

**Check twice before pressing back.** A check made while TikTok is still redrawing can report "not the feed" when we are already there. One back press too many, made from the feed, leaves TikTok altogether — which is exactly what happened once. Every press is now preceded by two checks a moment apart.

**Do not assume how many presses it takes.** It has been three, four and five on different runs, because swiping through results makes the trail back longer. The script presses until it recognises the feed, up to a limit, rather than counting.

### Inside the Comments panel

Opening comments to see what people are saying is ordinary behaviour, so we copy it. But this is the most dangerous screen in the app:

```
34%   "236 comments" header, and Close
36%   the comment list starts
41%   ...and mixed through it: Reply buttons, and a heart on every comment
93%   the list ends
97%   "Add comment..." text box, Stickers, Mention someone, Send Gift
```

Three things make it worse than the Share panel:

- **The hearts carry no readable name.** TikTok labels them `@2131823235` — a raw internal number it forgot to turn into words. We cannot even recognise them in order to avoid them.
- **Reply buttons sit among the comments**, so the reading area itself contains a way into the text box.
- **Send Gift is at the bottom**, next to the text box. That one spends real money.

So the rule here is absolute: **scroll, never tap.** The only press is Close, and only through the strict check that refuses to tap a position. Scrolling stays between 45% and 85% down the screen, clear of the header above and the text box below, and each swipe is deliberately long — a short drag can be read as a tap.

This panel also does **not** carry the "Bottom sheet" marker the Share panel uses. The "Add comment..." text box is what tells us it is open.

**Scrolling zero times is a real option.** Many videos have only a handful of comments, and on those the list cannot move. Always scrolling would mean swiping at nothing for several seconds — wasted time, and not something a person does. So the number of scrolls is picked from 0 to 2: open, read what fits on the screen, and sometimes close again without scrolling at all.

## 5. What the script does and does not do

### It does

- **Browse the For You feed** — swipe up, and watch each video for a realistic amount of time
- **Like videos** — only a small percentage, never a video that is already liked
- **Save videos** — add to Favorites, with the safeguard described in section 6
- **Read the comments** — open the panel, scroll through a few, and close it, the way someone curious what others thought would
- **Share** — copy the video's link, which stays inside TikTok and still counts as a share

### It does not

- **Write anything.** No comments, no replies, no messages. Reading the comments is fine; adding one is the fastest way to get flagged as spam, and liking plus saving already sends a strong enough signal.
- **Like anyone's comment.** That is a public action under our account's name.
- **Log in, type passwords, or switch accounts.** The account must already be signed in.
- **Touch live streams, direct messages, or TikTok Shop.**
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
│       └── probe_search.js        # how to search for a topic and get back
├── tools/
│   ├── deploy.sh                  # send main.js and each phone's settings
│   ├── run.sh                     # send one script and start it, from your laptop
│   ├── add-device.sh              # invent settings for a new phone
│   ├── watch.sh                   # follow what a phone is doing, live
│   └── status.sh                  # ask every phone how it has been getting on
└── docs/
    ├── SETUP.md                   # preparing a phone, and running a session
    └── DEPLOY.md                  # getting files from your laptop to the phones
```

**Only `main.js` goes on a phone.** The probes stay on the laptop, and `run.sh`
sends one over when you need it. Two of them press buttons — one likes a video,
another opens the Share panel — so leaving them sitting on a farm phone is an
accident waiting to happen.

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

1. **A Samsung farm phone to test on.** Everything so far is proven on one Xiaomi running Android 16. The farm runs Android 11 to 13 under Samsung's own software, which manages background apps differently. Nothing is confirmed until it runs there.
2. **The topic** we are targeting, so we can write a real personality instead of an example.
3. **Account age** — brand new, or already in use? This sets how slowly we ramp up.
4. **Network** — do the phones share one Wi-Fi connection, or does each have its own mobile data?
5. **Where the collected data should go** — deferred on purpose, still open.

---

## A note on rules and risk

Automating interactions goes against TikTok's Terms of Service. Accounts may be restricted or permanently banned. This project is intended for accounts we own and for risk we have accepted knowingly. Please weigh that before scaling up.

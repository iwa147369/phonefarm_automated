/**
 * lib/settings.js - the defaults, and why each one is what it is
 *
 * These are the settings every phone starts from. A phone changes what it needs
 * in its own device.json, which tools/deploy.sh puts beside the script; nothing
 * here has to be edited to run a farm.
 *
 * Most of this file is the reasoning rather than the values. That is on purpose
 * - a rate on its own is a number somebody will change without knowing what it
 * was protecting, and several of these numbers exist because something went
 * wrong once.
 *
 * main.js reads these once at startup and then merges the phone's own file over
 * the top, so what the script actually runs on is this object, changed in
 * place. Everything holds the same copy of it.
 */

// Where this phone's own settings live.
//
// Every phone in the farm runs this same file. What makes one phone different
// from another is device.json beside it, which tools/deploy.sh puts there. It
// only needs to list what differs from the defaults below.
//
// This matters more than it looks. Each session already varies its own timing,
// but if twelve phones all wake at seven, all like a fifth of what they see,
// and all search for the same words, that is a pattern no amount of
// per-session randomness hides.
var DEVICE_CONFIG_FILE = "/sdcard/脚本/device.json";

var SETTINGS = {
  // Which phone this is. Comes from device.json; only used in logs.
  device_id: "",

  // How long one session lasts, in minutes. Two numbers means a range, picked
  // fresh each time; a farm where every session is exactly ten minutes long is
  // a pattern worth avoiding.
  session_minutes: [8, 22],

  // How often to do each action, as a share of videos watched.
  // 0.20 means "on about 20 out of every 100 videos".
  rates: {
    like: 0.20,
    save: 0.05,

    // Opened and read, never written to.
    read_comments: 0.05,

    // Slow (about ten seconds) and the panel lists real people, so keep it low.
    // Only "Copy link" is ever pressed.
    share: 0.01
  },

  // How long to stay on a video, in seconds.
  // Most videos get a short look; a few get watched properly. That mix is what
  // real viewing looks like, so we copy it.
  watch: {
    short_seconds: [3, 9],
    long_seconds: [10, 28],
    chance_of_long_watch: 0.30,

    // Now and then skip almost immediately, the way people do.
    chance_of_instant_skip: 0.10,
    instant_skip_seconds: [1, 2]
  },

  comments: {
    // Zero is deliberately in range: plenty of videos have only a handful of
    // comments, and swiping at a list that cannot move is not what people do.
    scrolls: [0, 2],
    read_seconds: [1.5, 3]
  },

  // Occasionally swipe back to the previous video. Pointless on purpose:
  // perfectly efficient behaviour is what makes a bot obvious.
  //
  // Forced to zero when show_console_window is on, because the console panel
  // covers the part of the screen this swipe starts from. See that setting.
  chance_of_swipe_back: 0.04,

  // ---- Telling TikTok what we are interested in ----
  //
  // Searching for a topic and watching the results is the strongest signal we
  // can send about what an account cares about. Once a day is enough; several
  // times would look odd. Nothing happens while keywords is empty.
  seed: {
    enabled: true,
    keywords: [],
    videos_to_watch: [3, 6],
    once_per_day: true
  },

  // ---- Replying to messages ----
  //
  // People check their messages before they start scrolling, and an account
  // that receives shares and never responds looks like something being sprayed
  // at rather than somebody using an app.
  //
  // Only a sticker from the quick-send bar is ever sent. Never typed, never
  // the sticker grid, never the message box. Does nothing until reply_to has
  // names in it.
  messages: {
    enabled: false,

    // How often a session begins by looking at the inbox. Not every session:
    // somebody who opens their messages every single time is its own pattern.
    chance_of_checking: 0.30,

    // WHO WE MAY REPLY TO. Exact names as they appear in the inbox. Names, not
    // "the first few" - the top of a real inbox is New followers and Activity,
    // and a stranger messaging you takes the top slot from whoever was there.
    reply_to: [],

    // Keep small. Leaving some unread is what a real inbox looks like.
    max_replies: [1, 2],
    chance_of_replying: 0.6,

    // Only these three have been checked. "Effects" and "Cards" sit on the same
    // bar and nobody has established what they do.
    reactions: ["Heart", "Lol", "ThumbsUp"]
  },

  // ---- Sending a video to one of our own accounts ----
  //
  // The other half of the messages feature. Replying only happens when there
  // is something to reply to, and nothing else the script does puts anything
  // in anybody's inbox - ordinary sharing only copies a link. So without this,
  // replying almost never fires.
  //
  // Together they make one exchange: this phone sends a video, the other
  // account answers with a sticker at the start of its next session, which may
  // be hours later. The delay is not simulated - it falls out of the schedule.
  //
  // Off by default, and does nothing until send_to has names in it.
  send_to_friend: {
    enabled: false,

    // How often, as a share of videos watched. Keep it well below the like
    // rate: people send each other the odd video, not one in five.
    rate: 0.01,

    // WHICH ACCOUNTS MAY RECEIVE A VIDEO. Exact names, as they appear in the
    // share panel. Nothing else is ever pressed.
    //
    // Put only your own accounts here. There is no undo, and the row this
    // reads from is full of real people.
    send_to: [],

    // At most this many in one session, however many videos get watched. One
    // account sending a stream of videos to another all evening is a pattern,
    // and not a human one.
    max_per_session: 2,

    // ---- Sending to somebody who is not on the list ----
    //
    // Off, and think before turning it on. Everybody else in that row is a real
    // person who did not ask for this; they can block or report, and most will
    // never answer - and videos nobody responds to is what spam looks like from
    // outside. It also gives up the safety argument, since a name we cannot
    // find is a send that does not happen.
    //
    // If you turn it on, keep chance_of_anyone small, or the reply half of this
    // never fires - strangers do not send stickers back.
    allow_anyone: false,

    // When allowed, how often a send goes to somebody off the list.
    chance_of_anyone: 0.2,

    // Never sent to, whatever else is set. Exact names. Use this for anybody
    // real who must not be contacted by a script - a customer, a supplier, a
    // personal account that happens to share the phone.
    never_send_to: [],

    // If every phone sends to every other phone and they all answer, the farm
    // becomes a closed circle - accounts registered together, talking only to
    // each other, always replying. Each session looks human; the shape of the
    // whole thing does not. Give each phone one or two names, not all of them.
  },

  // ---- When sessions happen ----
  //
  // Leave enabled off and the script runs one session and stops, which is what
  // you want while testing. Turn it on and the script stays running, waking up
  // for a few sessions a day at sensible hours.
  //
  // Why this matters: a phone that browses whenever someone remembers to press
  // start - including at three in the morning - looks nothing like a person,
  // no matter how human each individual session is.
  schedule: {
    enabled: false,

    // Hours of the day the account is awake, as [from, to] in 24-hour time.
    // Nothing happens outside these.
    active_hours: [[7, 9], [12, 14], [19, 23]],

    // How many sessions to aim for in a day. Picked fresh each morning.
    sessions_per_day: [3, 5],

    // How long to wait between sessions, in minutes.
    gap_minutes: [45, 180],

    // Some days people barely open the app. On a lazy day we run about a third
    // as many sessions.
    chance_of_lazy_day: 0.15,

    // Where the script remembers what it has already done today. Without this
    // it would start a fresh burst of sessions every time Android restarts it.
    state_file: "/sdcard/脚本/farm_state.json"
  },

  // ---- Going easy on a new account ----
  //
  // A day-old account that likes twenty percent of everything it sees looks
  // wrong. These stages hold the rates down at first and let them grow.
  //
  // Set account_started to the date the account was created, as "YYYY-MM-DD",
  // to switch this on. Left empty, the rates above are used from day one.
  ramp_up: {
    account_started: "",

    stages: [
      // For the first week: watch, and little else.
      { first_days: 7,
        rates: { like: 0.05, save: 0, read_comments: 0.02, share: 0 } },

      // Weeks two and three: start saving and reading comments.
      { first_days: 21,
        rates: { like: 0.12, save: 0.03, read_comments: 0.04, share: 0.005 } }

      // After that the full rates above apply.
    ]
  },

  // Stop the session if the battery drops below this percentage.
  minimum_battery_percent: 20,

  // ---- Noticing when something has gone wrong ----
  //
  // Nobody watches a farm phone. These are the things that would otherwise let
  // a phone carry on doing nothing useful for hours.
  watchdog: {
    // Give up after this many actions in a row fail to find their button.
    //
    // One or two misses are normal - a video may still be loading. A long run
    // of them means the buttons have been renamed, which happens whenever
    // TikTok updates. Carrying on would be pointless, and a phone swiping at
    // nothing for hours is not a good look either.
    stop_after_missed_buttons: 8,

    // Where each phone leaves a note about how its last sessions went, so the
    // farm can be checked without picking up every phone. Bounded in size.
    status_file: "/sdcard/脚本/farm_status.json",
    keep_recent_sessions: 20
  },

  // Refuse to start when another copy of this script is already running.
  //
  // On 2026-07-23 farm-03 ran two copies at once: one session from 17:04 to
  // 17:18, another from 17:05 to 17:20. Both counted their own sessions into
  // the same file, so it recorded 2 sessions on a day that actually ran 5, and
  // the daily limit stopped meaning anything. A phone browsing twice as much
  // as planned is the opposite of what the schedule is for.
  //
  // Starting the script does not stop a copy that is already going, and
  // nothing on the phone makes that obvious - both copies look healthy.
  //
  // Turning this off restores the old behaviour. There is no good reason to,
  // but a check that cannot be switched off is one that can strand a farm.
  single_instance: true,

  // Print every action to the AutoJs6 console.
  verbose: true,

  // Show AutoJs6's floating console window on the phone.
  //
  // On, because a farm nobody can watch is a farm nobody can debug. Without
  // this panel the only way to see what a phone is doing is adb logcat from a
  // laptop, which means a cable, a free hand, and knowing which phone is which.
  //
  // It costs the swipe back to the previous video, and that trade is deliberate.
  // The panel is a large translucent window over the top-left of the screen,
  // roughly 2-68% across and 5-45% down. Android gives a whole gesture to
  // whichever window received its first touch, so what matters is where a swipe
  // begins, not where it travels: the swipe back begins around 30% down, inside
  // the panel, and never reaches TikTok, while the swipe forward begins near
  // 74%, below the panel, and works even though it ends inside it.
  //
  // So when this is on, the swipe back is switched off rather than left to fail.
  // A swipe reports nothing about what it hit, which means a broken one looks
  // exactly like a working one - the failure we would never see is the one worth
  // designing out.
  //
  // Two things here are still unmeasured, and both argue for turning this off on
  // any phone nobody is actively watching. The percentages were measured on the
  // Xiaomi test phone, not on the farm's older and narrower screens. And an
  // overlay makes Android mark the touches beneath it as obscured, which an app
  // could in principle read as a bot signal; nobody has checked whether TikTok
  // does. To turn it off for one phone, in its config/devices file:
  //
  //   "show_console_window": false
  //
  // Either way the log is still readable from a laptop:
  //   adb logcat -d | grep GlobalConsole | tail -40
  show_console_window: true
};

module.exports = {
  DEVICE_CONFIG_FILE: DEVICE_CONFIG_FILE,
  SETTINGS: SETTINGS
};

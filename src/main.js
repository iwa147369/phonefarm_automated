/**
 * main.js - browse the TikTok feed like a person would
 *
 * What it does: opens TikTok, watches videos in the For You feed, and now and
 * then likes one, saves one, reads the comments, or copies a link to share.
 * How often it does each is set in SETTINGS below. It stops by itself when the
 * session time runs out.
 *
 * It never writes anything: no comments, no replies, no messages.
 *
 * Before the first run: run probe.js to find out what the buttons are called
 * on your TikTok version, then check the BUTTON LABELS section below.
 *
 * To stop early: press the volume-up key, or stop the script from AutoJs6.
 */

// ============================================================================
// SETTINGS - change these, no other file needed
// ============================================================================

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

  // How long one session lasts, in minutes.
  //
  // Write two numbers for a range, and the length is picked fresh each time -
  // so no two sessions are the same. A single number still works if you want a
  // fixed length, but a farm where every session runs for exactly ten minutes
  // is a pattern worth avoiding.
  session_minutes: [8, 22],

  // How often to do each action, as a share of videos watched.
  // 0.20 means "on about 20 out of every 100 videos".
  rates: {
    like: 0.20,
    save: 0.05,

    // Open the comments and read a few, the way people do when a video makes
    // them curious what others thought. We never write anything - see the
    // Comments panel notes further down for why this one needs care.
    read_comments: 0.05,

    // Sharing is slow - opening the panel, pressing, and closing it takes
    // about ten seconds - and the panel lists real people along the top, where
    // a wrong press would send someone a private message. Keep this low. Only
    // an exact match on "Copy link" is ever pressed, never a screen position.
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

  // Reading the comments.
  comments: {
    // How many times to scroll down the list, picked fresh each time.
    //
    // Zero is deliberately included. Plenty of videos have only a handful of
    // comments, and on those the list cannot move at all - scrolling three
    // times would waste seconds swiping at nothing, which is not what a person
    // does. One or two is plenty even on a busy video.
    scrolls: [0, 2],

    // How long to spend reading, before scrolling and between scrolls.
    read_seconds: [1.5, 3]
  },

  // Occasionally swipe back to the previous video. Pointless on purpose:
  // perfectly efficient behaviour is what makes a bot obvious.
  chance_of_swipe_back: 0.04,

  // ---- Telling TikTok what we are interested in ----
  //
  // Searching for a topic and watching the results is the strongest signal we
  // can send about what the account cares about - much stronger than waiting
  // for the right video to turn up on its own. We do it once a day, at the
  // start of a session, then go back to normal browsing.
  //
  // Leave enabled off, or keywords empty, and none of this happens.
  seed: {
    enabled: true,

    // What to search for. One is picked at random each time. Nothing happens
    // while this is empty.
    keywords: [],

    // How many of the results to watch before going back to the feed.
    videos_to_watch: [3, 6],

    // Searching several times a day would look odd. Once is enough to steer
    // the feed. Needs the state file, same as the schedule does.
    once_per_day: true
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

  // Print every action to the AutoJs6 console.
  verbose: true,

  // Show AutoJs6's floating console window on the phone.
  //
  // Off, and for a good reason: that window is a large translucent panel over
  // the top-left of the screen, roughly 2-68% across and 5-45% down. Anything
  // the script swipes through that area lands on the panel instead of TikTok.
  //
  // It broke the swipe back to the previous video, which starts around 30%
  // down and so began inside the panel every time. The swipe to the next video
  // starts lower and was unaffected, which is why only one of them failed -
  // and failed silently, since a swipe reports nothing about what it hit.
  //
  // The log is still readable without it, from the laptop:
  //   adb logcat -d | grep GlobalConsole | tail -40
  show_console_window: false
};

// ============================================================================
// BUTTON LABELS - update these using the output of probe.js
// ============================================================================
//
// Each entry is a list of things to try, in order. The first one that matches
// wins. Several options are listed because TikTok words these differently
// between app versions.
//
// "(?i)" at the start means upper and lower case both match.

// Checked against TikTok 46.1.3 (package com.ss.android.ugc.trill) on an
// English phone. The real labels look like this:
//
//   Like       "Like video. 5,142 likes"
//   Comment    "Read or add comments. 27 comments"
//   Favorites  "Add or remove this video from Favorites."
//   Share      "Share video. 116 shares"
//   Follow     "Follow <creator name>"
//
// Note we never match on the id. TikTok scrambles its ids on every release,
// and it gives the Like and Share buttons the *same* id, so ids are useless
// here. The spoken labels are stable and readable, so we use those.

var LABELS = {
  // Matches both states. Whether it is already liked is checked separately,
  // because we must never turn someone's like back off.
  like: [
    function () { return descMatches("(?i)^(un)?like video\\b.*"); },
    function () { return descMatches("(?i)^(un)?like\\b.*"); }
  ],

  // How to tell a video is already liked. Confirmed by pressing the button and
  // watching what changed:
  //
  //   not liked  ->  desc "Like video. 186 likes"   selected false
  //   liked      ->  desc "Like"                    selected true
  //
  // Note the trap: TikTok does NOT say "Unlike". It shortens the label to just
  // "Like" and drops the count. A check looking for the word "unlike" would see
  // a liked video as unliked, press the button, and take the like back off.
  //
  // "selected" is the signal we trust; this pattern is the backstop.
  already_liked: /^like$/i,

  save: [
    function () { return descMatches("(?i)^add or remove this video from favou?rites.*"); },
    function () { return descMatches("(?i).*\\bfavou?rites?\\b.*"); }
  ],

  // The Favorites label is deliberately neutral - "Add or remove this video
  // from Favorites." reads the same whether or not the video is saved, so it
  // can never tell us the state. Only "selected" can, and doSave relies on it.
  // This pattern is here for TikTok versions that do word the two differently.
  already_saved: /^remove\b|\b(saved|favou?rited)\b/i,

  share: [
    function () { return descMatches("(?i)^share video\\b.*"); },
    function () { return descMatches("(?i)^share\\b.*"); }
  ],

  // ---- Inside the Share panel ----
  //
  // What the panel actually contains, top to bottom:
  //
  //   71%  "Send to", Search, Close
  //   79%  real account names - pressing one sends them a private message
  //   87%  Repost, COPY LINK, Messenger, WhatsApp, Facebook, Telegram, SMS
  //   96%  Report, Not interested, Download, Add to Story, Promote, Cast
  //
  // Only "Copy link" is safe. Everything at 79% messages a person. Everything
  // else at 87% leaves TikTok for another app. And "Not interested" at 96%,
  // despite sounding harmless, tells the algorithm to show less of this kind
  // of video - the opposite of what we are training it to do.
  //
  // Note the two rows are only 8% of the screen apart, about 220 pixels. That
  // is why nothing in this panel is ever pressed by position: see pressStrict.

  // Present only while the panel is open, so it tells us whether it opened,
  // and more importantly whether it closed again.
  share_panel_marker: [
    function () { return descMatches("(?i)^bottom sheet$"); }
  ],

  // The X in the top corner of the panel. This is how we get out: the back
  // action does not close it on Android 16.
  share_panel_close: [
    function () { return descMatches("(?i)^close$"); },
    function () { return textMatches("(?i)^close$"); }
  ],

  // The one safe thing to press. Matched exactly - no "contains" - so it can
  // never drift onto a neighbouring item.
  share_sheet_safe_option: [
    function () { return descMatches("(?i)^copy link$"); },
    function () { return textMatches("(?i)^copy link$"); }
  ],

  // ---- The Comments panel ----
  //
  // Opening comments to see what people are saying is ordinary behaviour, so
  // we copy it. We only ever read: never comment, never reply, never like
  // anyone's comment.
  //
  // This panel is the most dangerous screen in the app, and unusually so:
  //
  //   34%   "236 comments" header, and Close
  //   36%   the comment list starts
  //   41%   ...and mixed through it: Reply buttons, and hearts on each comment
  //   93%   the list ends
  //   97%   "Add comment..." text box, Stickers, Mention someone, Send Gift
  //
  // The hearts on each comment carry no readable name - TikTok labels them
  // "@2131823235", a raw internal number it forgot to turn into words. So we
  // cannot even recognise them to avoid them. Combined with Reply buttons
  // sitting among the comments, and a Send Gift button that spends real money,
  // the only safe rule is: inside this panel we scroll, and never tap.

  // Unlike the Share panel, this one has no "Bottom sheet" marker. The text
  // box is what gives it away - nothing else on screen says "Add comment".
  comment_panel_marker: [
    function () { return textMatches("(?i)^add comment.*"); },
    function () { return descMatches("(?i)^add comment.*"); }
  ],

  comment_panel_close: [
    function () { return descMatches("(?i)^close$"); },
    function () { return textMatches("(?i)^close$"); }
  ],

  comments: [
    function () { return descMatches("(?i)^read or add comments\\b.*"); },
    function () { return descMatches("(?i).*\\bcomments?\\b.*"); }
  ],

  // ---- Searching for a topic ----
  //
  // The search screen taught us something that applies nowhere else in the
  // app: a button can say it is pressable and still refuse to be pressed.
  //
  //   ImageView  desc "Search"  clickable=false   <- a magnifying glass
  //   Button     text "Search"  clickable=true    <- the real button
  //
  // Choosing the Button and pressing it properly is REFUSED. TikTok built it
  // to answer a real finger, not the press Android's accessibility layer
  // offers. A tap at its own coordinates works. Note the two are told apart by
  // desc versus text, not by name.
  //
  // Opening search is different again - that one does accept a proper press.
  // Same screen, two buttons, two behaviours, so the flow uses both.

  // The magnifying glass at the top of the feed. The Share panel has a button
  // called "Search" too, so this is only ever looked for near the top.
  search_entry: [
    function () { return descMatches("(?i)^search$"); },
    function () { return textMatches("(?i)^search$"); }
  ],

  // The button that sends the search, beside the box. Matched on text, because
  // the magnifying glass beside it is the one carrying the desc.
  search_submit: [
    function () { return textMatches("(?i)^search$"); }
  ],

  // Only on screen while TikTok is still offering suggestions, so it tells us
  // whether the search actually went through.
  search_suggestions: [
    function () { return textMatches("(?i)^press and hold on a suggestion.*"); }
  ],

  // A result on the search results screen. TikTok labels each one
  // "Video by <creator>, <caption>, Liked by 39.1K users".
  search_result: [
    function () { return descMatches("(?i)^video by .*"); }
  ],

  // ---- Knowing we are on the For You feed ----
  //
  // This caused a real bug worth remembering. The script used to decide it was
  // on the feed by finding the Like button. But every video player has a Like
  // button - search results, a creator's videos, all of them. After searching
  // for a topic the script believed it was back on the feed while it was still
  // inside the search results, and browsed there for the rest of the session,
  // reporting success the whole time.
  //
  // Comparing the two screens gave these labels present on the feed and absent
  // from the search results player:
  //
  //   7%   "For You"  "Following"  "Search"
  //   99%  "Home"  "Friends"  "Create"  "Inbox"  "Profile"
  //
  // "Search" looks tempting and is wrong: the search screen has one too, so a
  // check using it reports success one step too early. It fooled the very
  // probe written to find this out.
  //
  // "For You" is the one to trust - it names the feed, and appears nowhere
  // else. The bottom bar is a weaker backup, because the Profile and Inbox
  // screens carry it as well.
  feed_marker: [
    function () { return descMatches("(?i)^for you$"); },
    function () { return textMatches("(?i)^for you$"); }
  ],

  // If any of these appear, something needs a human. We stop.
  stop_signals: [
    function () { return textMatches("(?i).*(log in|sign up) to tiktok.*"); },
    function () { return textMatches("(?i).*verify.*you.*human.*"); },
    function () { return textMatches("(?i).*too many attempts.*"); }
  ]
};

// TikTok ships under different package names by region. We try each in turn.
var TIKTOK_PACKAGES = [
  "com.zhiliaoapp.musically",   // TikTok, most countries
  "com.ss.android.ugc.trill",   // TikTok, some Asian regions
  "com.ss.android.ugc.tiktok"
];

// ============================================================================
// Everything below is the machinery. You should not need to edit it.
// ============================================================================

auto.waitFor();

// Only show the floating console if asked. See show_console_window above: it
// covers the top-left of the screen and swallows swipes that pass through it.
if (SETTINGS.show_console_window) console.show();

var stopRequested = false;

// Why the session ended, and how many button lookups have failed in a row.
// Both feed the note written for whoever checks the farm later.
var endReason = "unknown";
var consecutiveMisses = 0;
var stats = { videos: 0, like: 0, save: 0, share: 0, comments: 0, seeded: 0,
              back: 0, misses: 0 };
var tiktokPackage = null;

// ------------------------------------------------------ this phone's settings

/**
 * Copy one set of settings over another.
 *
 * Objects are merged a level at a time, so a phone can change rates.like
 * without having to restate rates.save. Lists are replaced whole - merging
 * them item by item would produce nonsense, for instance mixing one phone's
 * waking hours with the defaults.
 */
function mergeSettings(base, extra) {
  for (var key in extra) {
    if (!extra.hasOwnProperty(key)) continue;

    var value = extra[key];

    if (value instanceof Array) {
      base[key] = value;
    } else if (value !== null && typeof value === "object") {
      if (!base[key] || typeof base[key] !== "object" ||
          base[key] instanceof Array) {
        base[key] = {};
      }
      mergeSettings(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

/**
 * Load this phone's own settings, if it has any.
 *
 * A file that will not parse stops the script. On a farm nobody is watching,
 * and running with the wrong settings is worse than not running: a two-day-old
 * account browsing at full rates because its ramp-up settings failed to load
 * is the kind of mistake that costs the account.
 */
function applyDeviceConfig() {
  var exists = false;
  try { exists = files.exists(DEVICE_CONFIG_FILE); } catch (e) { }

  if (!exists) {
    console.warn("No device.json - running on the built-in defaults.");
    console.warn("Every phone without one behaves identically, which is worth");
    console.warn("avoiding. See config/devices/ and tools/deploy.sh.");
    return false;
  }

  var raw;
  try {
    raw = files.read(DEVICE_CONFIG_FILE);
  } catch (e) {
    console.error("Could not read " + DEVICE_CONFIG_FILE + ": " + e);
    exit();
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("device.json is not valid JSON: " + e);
    console.error("Refusing to run rather than browse with the wrong settings.");
    exit();
  }

  mergeSettings(SETTINGS, parsed);
  return true;
}

// ---------------------------------------------------------------- utilities

function log(msg) {
  if (SETTINGS.verbose) console.log(msg);
}

/**
 * Record that a button could not be found.
 *
 * The run of failures matters more than the total. One or two are normal while
 * a video loads; eight in a row means the buttons have been renamed, which is
 * what happens when TikTok updates.
 */
function noteMiss() {
  stats.misses++;
  consecutiveMisses++;
}

/** Record that something worked, which ends any run of failures. */
function noteHit() {
  consecutiveMisses = 0;
}

/** Have we lost track of the buttons entirely? */
function buttonsSeemBroken() {
  return consecutiveMisses >= SETTINGS.watchdog.stop_after_missed_buttons;
}

/** Random whole number between min and max, both included. */
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random number between min and max. */
function rnd(min, max) {
  return Math.random() * (max - min) + min;
}

/** True with probability p (0 to 1). */
function chance(p) {
  return Math.random() < p;
}

/** Pick a random value from a [min, max] pair written in SETTINGS. */
function rndFromRange(pair) {
  return rnd(pair[0], pair[1]);
}

/**
 * Read a setting that may be either a single number or a [min, max] range.
 *
 * This lets any timing in SETTINGS be varied without changing code: write one
 * number to fix it, or two to have it chosen fresh each time.
 */
function settingValue(setting) {
  if (setting instanceof Array) return rndFromRange(setting);
  return setting;
}

/**
 * Is this button actually visible, rather than sitting off the edge?
 *
 * This matters more than it sounds. TikTok keeps the *next* video's buttons
 * loaded just below the screen, so a search for "Like" finds two of them: the
 * video you are watching, and the one you have not seen yet. Pressing the
 * wrong one likes a video that was never on screen.
 */
function isOnScreen(node) {
  try {
    var b = node.bounds();
    if (b.width() <= 0 || b.height() <= 0) return false;
    return b.centerX() >= 0 && b.centerX() < device.width &&
           b.centerY() >= 0 && b.centerY() < device.height;
  } catch (e) {
    return false;
  }
}

/**
 * Try each label option in turn and return the first visible button.
 * Returns null if none of them match.
 */
function findOnScreen(candidates, timeoutMs) {
  timeoutMs = timeoutMs || 800;
  var deadline = Date.now() + timeoutMs;

  do {
    for (var i = 0; i < candidates.length; i++) {
      var matches;
      try {
        matches = candidates[i]().find();
      } catch (e) {
        continue; // a bad matcher should not end the session
      }
      if (!matches) continue;

      for (var j = 0; j < matches.length; j++) {
        if (isOnScreen(matches[j])) return matches[j];
      }
    }
    sleep(120);
  } while (Date.now() < deadline);

  return null;
}

/**
 * Press a button.
 *
 * Some TikTok buttons carry the label but are not the part that responds to a
 * press - Favorites is like this, where the label sits on a child of the real
 * button. So we walk up a couple of levels looking for something pressable,
 * and tap the screen position as a last resort.
 */
function pressNode(node) {
  if (!node) return false;

  var target = node;
  for (var level = 0; level < 3 && target; level++) {
    try {
      if (target.clickable()) {
        if (target.click()) return true;
        break;
      }
      var parent = target.parent();
      // Stop climbing if the parent is a large container - pressing that would
      // hit something entirely different.
      if (!parent || parent.bounds().height() > device.height * 0.3) break;
      target = parent;
    } catch (e) {
      break;
    }
  }

  try {
    var b = node.bounds();
    // Tap slightly off centre - a real finger is never exact.
    return click(b.centerX() + rndInt(-8, 8), b.centerY() + rndInt(-8, 8));
  } catch (e2) {
    return false;
  }
}

/** Pause for a human-ish moment before acting. */
function humanPause(minMs, maxMs) {
  sleep(rndInt(minMs || 180, maxMs || 650));
}

// ---------------------------------------------------------------- gestures

/**
 * Swipe to the next video.
 * The path curves and the speed varies, because a straight constant-speed
 * swipe is one of the easiest bot signals to spot.
 */
function swipeToNextVideo(reverse) {
  var w = device.width;
  var h = device.height;

  var startY = reverse ? h * rnd(0.25, 0.33) : h * rnd(0.70, 0.78);
  var endY = reverse ? h * rnd(0.70, 0.78) : h * rnd(0.20, 0.28);

  var startX = w / 2 + rnd(-w * 0.10, w * 0.10);
  var endX = startX + rnd(-w * 0.06, w * 0.06);

  // A bend in the middle of the path.
  var midX = (startX + endX) / 2 + rnd(-w * 0.07, w * 0.07);
  var midY = (startY + endY) / 2 + rnd(-h * 0.03, h * 0.03);

  var duration = rndInt(190, 420);

  gesture(duration,
    [Math.round(startX), Math.round(startY)],
    [Math.round(midX), Math.round(midY)],
    [Math.round(endX), Math.round(endY)]);
}

// ---------------------------------------------------------------- actions

function doLike() {
  var node = findOnScreen(LABELS.like);
  if (!node) {
    noteMiss();
    log("  like: button not found");
    return false;
  }

  var label = node.desc() || node.text() || "";

  // We have only seen the wording for a video that is NOT yet liked. Printing
  // it here tells us what TikTok says once a video IS liked, so the check just
  // below can be confirmed. Remove this line once we know.
  log('  like: button says "' + label + '"');

  if (LABELS.already_liked.test(label) || node.selected()) {
    log("  like: already liked, leaving it alone");
    return false;
  }

  humanPause(250, 900);
  if (pressNode(node)) {
    stats.like++;
    noteHit();
    log("  like: done");
    return true;
  }
  noteMiss();
  return false;
}

/**
 * Read the number printed under a button, for example the "76" beneath
 * Favorites. It sits in a text label one or two levels inside the button.
 */
function readCountLabel(node) {
  try {
    var children = node.children();
    for (var i = 0; i < children.length; i++) {
      var text = children[i].text();
      if (text) return text;

      var grandchildren = children[i].children();
      for (var j = 0; j < grandchildren.length; j++) {
        var deeper = grandchildren[j].text();
        if (deeper) return deeper;
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}

/**
 * Turn a displayed count into a number.
 *
 * TikTok rounds large numbers, so "1.2K" could be anything from 1150 to 1249.
 * We report whether the number is exact, because a rounded one cannot show a
 * change of a single save.
 */
function parseCount(text) {
  if (!text) return null;

  var cleaned = String(text).trim().replace(/,/g, "");
  var parts = cleaned.match(/^([\d.]+)\s*([KMB]?)$/i);
  if (!parts) return null;

  var value = parseFloat(parts[1]);
  if (isNaN(value)) return null;

  var suffix = parts[2].toUpperCase();
  if (suffix === "K") value *= 1e3;
  else if (suffix === "M") value *= 1e6;
  else if (suffix === "B") value *= 1e9;

  return { value: value, exact: suffix === "" };
}

/**
 * Add the video to Favorites.
 *
 * This one needs care. Unlike the Like button, Favorites gives away nothing
 * about its state: the label reads "Add or remove this video from Favorites."
 * and the selected flag stays false whether or not the video is saved. So we
 * cannot ask TikTok whether we are about to save or un-save.
 *
 * Instead we watch the number printed under the button. Press it, and the
 * count goes up if we saved and down if we un-saved. If it went down we press
 * again straight away, putting the video back the way we found it.
 *
 * The catch: TikTok rounds anything over a thousand to "1.2K", which will not
 * visibly move by one. On those videos we cannot check, so we leave them
 * alone rather than risk removing a save.
 */
function doSave() {
  var node = findOnScreen(LABELS.save);
  if (!node) {
    noteMiss();
    log("  save: button not found");
    return false;
  }

  var label = node.desc() || node.text() || "";
  if (LABELS.already_saved.test(label) || node.selected()) {
    log("  save: already saved, leaving it alone");
    return false;
  }

  var before = parseCount(readCountLabel(node));
  if (!before || !before.exact) {
    log("  save: count is rounded or missing, cannot tell saved from unsaved" +
        " - skipping to be safe");
    return false;
  }

  // Remember where the button was, so we can be sure we read the same one
  // afterwards rather than the next video's.
  var wasAtX, wasAtY;
  try {
    var box = node.bounds();
    wasAtX = box.centerX();
    wasAtY = box.centerY();
  } catch (e) {
    log("  save: could not fix the button's position - skipping to be safe");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(700, 1200));

  // Read the count again, insisting on the same button in the same place. The
  // old reference points at a view TikTok has since redrawn, and a plain
  // search could return the next video's button instead.
  var afterNode = findSameButtonAgain(LABELS.save, wasAtX, wasAtY, 40);
  if (!afterNode) {
    log("  save: lost sight of the button, so cannot check what happened" +
        " - treating it as saved");
    stats.save++;
    return true;
  }

  var after = parseCount(readCountLabel(afterNode));

  if (after && after.exact && after.value < before.value) {
    // The count fell, so this video was already saved and we just removed it.
    log("  save: it was already saved - undoing");
    humanPause(300, 700);
    pressNode(afterNode);
    sleep(rndInt(500, 900));
    return false;
  }

  stats.save++;
  noteHit();
  log("  save: done");
  return true;
}

/**
 * Press something, but only if it really is pressable.
 *
 * pressNode falls back to tapping a screen position when it cannot find a
 * pressable view. That is fine out on the feed, where the worst case is a
 * missed button. It is not fine inside the Share panel: along the top of that
 * panel TikTok lists real people, and a blind tap could land on one and send
 * them the video as a private message.
 *
 * So anywhere inside that panel, we use this instead. If we cannot identify
 * something properly pressable, we press nothing at all.
 */
function pressStrict(node) {
  var target = node;
  for (var level = 0; level < 3 && target; level++) {
    try {
      if (target.clickable()) return target.click();
      var parent = target.parent();
      if (!parent || parent.bounds().height() > device.height * 0.3) return false;
      target = parent;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Share the video by copying its link, which keeps everything inside TikTok.
 *
 * Two things make this the riskiest action in the script:
 *
 * First, the Share panel lists real people along the top. Pressing one sends
 * them a private message. Every press in here goes through pressStrict, which
 * refuses to tap a position blindly.
 *
 * Second, if the panel fails to close, every later swipe lands inside it and
 * the rest of the session is wasted. So we check that it actually closed, and
 * end the session if it did not.
 */
/**
 * Find a button again, insisting it is the same one as before.
 *
 * Pressing a button makes TikTok redraw, and while it does there can be two
 * matching buttons in play: the video we are working on, and the next one.
 * Searching again without checking position can quietly hand back the wrong
 * video's button - and then a count read off it means nothing.
 *
 * That matters most where a count decides whether to press again. Reading the
 * wrong video's count there would cause the very damage the check exists to
 * prevent. So we require the button to be back in the same place, give or take
 * a few pixels.
 */
function findSameButtonAgain(candidates, wasAtX, wasAtY, tolerancePx) {
  var deadline = Date.now() + 2000;

  do {
    for (var i = 0; i < candidates.length; i++) {
      var matches;
      try {
        matches = candidates[i]().find();
      } catch (e) {
        continue;
      }
      if (!matches) continue;

      for (var j = 0; j < matches.length; j++) {
        if (!isOnScreen(matches[j])) continue;
        try {
          var b = matches[j].bounds();
          if (Math.abs(b.centerX() - wasAtX) <= tolerancePx &&
              Math.abs(b.centerY() - wasAtY) <= tolerancePx) {
            return matches[j];
          }
        } catch (e) { /* skip unreadable nodes */ }
      }
    }
    sleep(150);
  } while (Date.now() < deadline);

  return null;
}

/**
 * Scroll down through the comments.
 *
 * A long, slow swipe well inside the list. Long on purpose: a short drag can
 * be read as a tap, and a tap in this panel could hit a Reply button, a heart
 * on someone's comment, or Send Gift.
 *
 * The band is chosen from what the panel actually looks like: the list runs
 * from about 36% to 93% down the screen, the text box sits at 97%, and the
 * header and Close sit at 34%. Staying between 45% and 85% keeps clear of all
 * three even if the swipe drifts.
 */
function scrollComments() {
  var w = device.width;
  var h = device.height;

  var startY = h * rnd(0.80, 0.86);
  var endY = h * rnd(0.42, 0.50);
  var startX = w * rnd(0.35, 0.65);
  var endX = startX + rnd(-w * 0.04, w * 0.04);
  var midX = (startX + endX) / 2 + rnd(-w * 0.05, w * 0.05);
  var midY = (startY + endY) / 2;

  gesture(rndInt(300, 550),
    [Math.round(startX), Math.round(startY)],
    [Math.round(midX), Math.round(midY)],
    [Math.round(endX), Math.round(endY)]);
}

/** Is the Comments panel currently open? */
function commentPanelIsOpen(timeoutMs) {
  return findOnScreen(LABELS.comment_panel_marker, timeoutMs || 400) !== null;
}

/**
 * Open the comments, read a few, and close again.
 *
 * Nothing inside the panel is ever pressed except Close, and that only through
 * pressStrict, which refuses to tap a position blindly. Everything else is
 * done by scrolling.
 */
function doReadComments() {
  var node = findOnScreen(LABELS.comments);
  if (!node) {
    noteMiss();
    log("  comments: button not found");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(1200, 2000));

  if (!commentPanelIsOpen(1500)) {
    log("  comments: the panel did not open, skipping");
    return false;
  }

  // Read what is on screen first, pausing as if actually reading rather than
  // skimming at machine speed. Then scroll - or not, on a video whose comments
  // all fit on one screen.
  var scrolls = rndInt(SETTINGS.comments.scrolls[0],
                       SETTINGS.comments.scrolls[1]);

  sleep(Math.round(rndFromRange(SETTINGS.comments.read_seconds) * 1000));

  for (var i = 0; i < scrolls && !stopRequested; i++) {
    scrollComments();
    sleep(Math.round(rndFromRange(SETTINGS.comments.read_seconds) * 1000));
  }

  var closeButton = findOnScreen(LABELS.comment_panel_close, 800);
  if (closeButton) {
    pressStrict(closeButton);
    sleep(rndInt(600, 1000));
  }

  if (commentPanelIsOpen(800)) {
    // Close did not work. Try back, and if that fails too, stop: a panel left
    // open would swallow every swipe for the rest of the session.
    back();
    sleep(rndInt(600, 1000));

    if (commentPanelIsOpen(800)) {
      console.error("  comments: the panel will not close - ending the session");
      console.error("  Set read_comments to 0 in SETTINGS until this is sorted.");
      stopRequested = true;
      return false;
    }
  }

  stats.comments++;
  log("  comments: read" +
      (scrolls > 0 ? ", scrolled " + scrolls + " time(s)" : " without scrolling"));
  return true;
}

/** Is the Share panel currently open? */
function sharePanelIsOpen(timeoutMs) {
  return findOnScreen(LABELS.share_panel_marker, timeoutMs || 400) !== null;
}

/**
 * Close the Share panel. Returns true only once it is really gone.
 *
 * We press the panel's own X button. The back action does not work here on
 * Android 16 - that was measured, not guessed - so it is only a fallback.
 */
function closeSharePanel() {
  var closeButton = findOnScreen(LABELS.share_panel_close, 800);
  if (closeButton && pressStrict(closeButton)) {
    sleep(rndInt(500, 900));
    if (!sharePanelIsOpen()) return true;
  }

  back();
  sleep(rndInt(600, 1000));
  return !sharePanelIsOpen();
}

/**
 * Share the video by copying its link, which keeps everything inside TikTok.
 *
 * This is the riskiest thing the script does, for two separate reasons.
 *
 * The panel lists real people along the top, and pressing one sends them the
 * video as a private message. Every press in here goes through pressStrict,
 * which refuses to tap a position blindly, and the only thing we look for is
 * an exact match on "Copy link".
 *
 * And if the panel fails to close, every later swipe lands inside it and the
 * rest of the session is wasted. So we confirm it closed, and stop the session
 * if it did not.
 */
function doShare() {
  var node = findOnScreen(LABELS.share);
  if (!node) {
    noteMiss();
    log("  share: button not found");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(900, 1600));

  if (!sharePanelIsOpen(1200)) {
    log("  share: the panel did not open, skipping");
    return false;
  }

  var copied = false;
  var safe = findOnScreen(LABELS.share_sheet_safe_option, 1200);
  if (!safe) {
    log("  share: no Copy link in the panel, backing out without pressing");
  } else {
    humanPause(400, 1100);
    copied = pressStrict(safe);
    if (copied) {
      stats.share++;
      noteHit();
      log("  share: copied link");
    } else {
      log("  share: could not press it safely, leaving it alone");
    }
    sleep(rndInt(500, 1000));
  }

  if (!closeSharePanel()) {
    console.error("  share: the panel will not close - ending the session");
    console.error("  Set share to 0 in SETTINGS until this is sorted out.");
    stopRequested = true;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------- app state

function detectTikTokPackage() {
  for (var i = 0; i < TIKTOK_PACKAGES.length; i++) {
    if (app.getAppName(TIKTOK_PACKAGES[i])) return TIKTOK_PACKAGES[i];
  }
  return null;
}

function isTikTokOnScreen() {
  return currentPackage() === tiktokPackage;
}

function openTikTok() {
  if (isTikTokOnScreen()) return true;

  log("Opening TikTok...");
  app.launchPackage(tiktokPackage);

  for (var waited = 0; waited < 20000; waited += 500) {
    sleep(500);
    if (isTikTokOnScreen()) {
      // Give the feed a moment to finish loading.
      sleep(rndInt(1800, 3200));
      return true;
    }
  }
  return false;
}

/** Look for screens that mean a human needs to step in. */
function checkStopSignals() {
  var node = findOnScreen(LABELS.stop_signals, 200);
  if (node) {
    console.error("Stopping: hit a screen that needs a human -> \"" +
      (node.text() || node.desc()) + "\"");
    return true;
  }
  return false;
}

/** Is the screen actually on? A dark phone cannot be browsing. */
function isScreenOn() {
  try {
    return device.isScreenOn();
  } catch (e) {
    return true;   // if we cannot tell, do not stop over it
  }
}

function checkBattery() {
  try {
    if (device.getBattery() < SETTINGS.minimum_battery_percent) {
      console.warn("Stopping: battery below " + SETTINGS.minimum_battery_percent + "%");
      return false;
    }
  } catch (e) { /* if we cannot read it, carry on */ }
  return true;
}

// ---------------------------------------------------------------- watching

function pickWatchMs() {
  if (chance(SETTINGS.watch.chance_of_instant_skip)) {
    return rndFromRange(SETTINGS.watch.instant_skip_seconds) * 1000;
  }
  if (chance(SETTINGS.watch.chance_of_long_watch)) {
    return rndFromRange(SETTINGS.watch.long_seconds) * 1000;
  }
  return rndFromRange(SETTINGS.watch.short_seconds) * 1000;
}

/**
 * Sleep in small steps so a stop request is noticed quickly instead of
 * waiting out the full watch time.
 */
function watchFor(totalMs) {
  var slept = 0;
  while (slept < totalMs && !stopRequested) {
    var step = Math.min(500, totalMs - slept);
    sleep(step);
    slept += step;
  }
}

// ---------------------------------------------------------------- main loop

function runSession(minutes) {
  var endAt = Date.now() + minutes * 60 * 1000;
  var consecutiveFailures = 0;

  while (Date.now() < endAt && !stopRequested) {
    if (!checkBattery()) { endReason = "battery_low"; break; }

    if (!isTikTokOnScreen()) {
      console.warn("TikTok is no longer on screen, reopening");
      if (!openTikTok()) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          console.error("Stopping: could not get back into TikTok");
          endReason = "tiktok_would_not_open";
          break;
        }
        continue;
      }
    }
    consecutiveFailures = 0;

    if (checkStopSignals()) { endReason = "needs_a_human"; break; }

    if (buttonsSeemBroken()) {
      console.error("Nothing has been findable for " + consecutiveMisses +
                    " tries in a row.");
      console.error("TikTok has probably been updated and renamed things.");
      console.error("Run probe.js and check the BUTTON LABELS section.");
      endReason = "buttons_not_found";
      break;
    }

    if (!isScreenOn()) {
      console.warn("The screen went off - stopping.");
      endReason = "screen_off";
      break;
    }

    stats.videos++;
    var watchMs = pickWatchMs();
    var minutesLeft = Math.round((endAt - Date.now()) / 60000);
    log("Video " + stats.videos + " - watching " + Math.round(watchMs / 1000) +
        "s (" + minutesLeft + " min left in session)");

    watchFor(watchMs);
    if (stopRequested) { endReason = "stopped_by_hand"; break; }

    // Decide what to do with this video. Each is rolled separately, so a video
    // can get both a like and a save.
    if (chance(activeRates.like)) doLike();
    if (chance(activeRates.save)) doSave();
    if (chance(activeRates.read_comments)) doReadComments();
    if (chance(activeRates.share)) doShare();

    // A short beat before moving on, as if deciding.
    humanPause(200, 900);

    if (chance(SETTINGS.chance_of_swipe_back)) {
      log("  (glancing back at the previous video)");

      var wasShowing = videoFingerprint();
      swipeToNextVideo(true);
      sleep(rndInt(700, 1100));

      if (wasShowing !== null && videoFingerprint() === wasShowing) {
        // The feed did not move. Something is over the screen, or the swipe
        // landed somewhere that ignored it.
        log("  the swipe back changed nothing - is something covering the screen?");
        noteMiss();
        swipeToNextVideo(false);
      } else {
        stats.back++;
        watchFor(rndInt(1500, 5000));
        swipeToNextVideo(false);
      }
    } else {
      swipeToNextVideo(false);
    }

    // Let the next video load.
    sleep(rndInt(500, 1200));
  }
}

function printSummary(startedAt) {
  var minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  if (endReason === "unknown") endReason = "ran_its_time";

  console.log("");
  console.log("========== SESSION FINISHED ==========");
  console.log("Ran for        : " + minutes + " minutes");
  console.log("Videos watched : " + stats.videos);
  console.log("Liked          : " + stats.like);
  console.log("Saved          : " + stats.save);
  console.log("Shared         : " + stats.share);
  console.log("Comments read  : " + stats.comments);
  if (stats.seeded > 0) console.log("Topic searched : yes");
  console.log("Swiped back    : " + stats.back);
  console.log("Ended because  : " + endReason);
  if (stats.misses > 0) {
    console.warn("Buttons not found: " + stats.misses +
                 " - run probe.js and update the BUTTON LABELS section");
  }
  console.log("======================================");
}

// ------------------------------------------------------ searching for a topic

/**
 * Tap a button where it sits on the screen.
 *
 * Not the same as a blind tap: the coordinates come from the button itself, so
 * we know what is under the finger. Needed because some TikTok buttons refuse
 * a proper press - see the search notes in BUTTON LABELS.
 */
function tapNode(node) {
  try {
    var b = node.bounds();
    return click(b.centerX() + rndInt(-6, 6), b.centerY() + rndInt(-6, 6));
  } catch (e) {
    return false;
  }
}

/**
 * Are we on the For You feed, and is a video playing?
 *
 * Both halves matter. The "For You" tab says we are on the feed rather than in
 * search results or on someone's profile. The Like button says a video is up
 * and ready to be browsed, rather than the screen still loading.
 *
 * Checking only the Like button - which is what this used to do - passes on
 * any video player anywhere in the app. See the feed_marker notes above.
 */
function onTheFeed() {
  if (!isTikTokOnScreen()) return false;
  if (!findOnScreen(LABELS.feed_marker, 600)) return false;
  return findOnScreen(LABELS.like, 600) !== null;
}

/**
 * Something that identifies the video on screen, cheaply.
 *
 * The Like button's label carries the like count, which differs enough between
 * videos to tell one from the next.
 *
 * This exists because a swipe tells us nothing about what it landed on. A
 * swipe that hits something covering the screen looks exactly like one that
 * worked. That is not hypothetical: AutoJs6's own console window sat over the
 * top-left of the screen and swallowed every swipe back to the previous video,
 * silently, for as long as it was switched on.
 */
function videoFingerprint() {
  var node = findOnScreen(LABELS.like, 600);
  if (!node) return null;
  try {
    return node.desc() || "";
  } catch (e) {
    return null;
  }
}

/**
 * Is some video playing, anywhere in the app?
 *
 * True on the feed, but also in search results and on a creator's videos. That
 * is exactly what we want while seeding: after opening a search result we are
 * deliberately not on the feed, and still need to know a video came up.
 */
function aVideoIsPlaying() {
  return findOnScreen(LABELS.like, 800) !== null;
}

/**
 * Press back until the feed is showing again.
 *
 * Getting lost somewhere in the app would cost the whole session, so this is
 * checked rather than assumed. Four presses is normal coming back from a
 * search; the extra tries are headroom.
 */
function returnToFeed(maxPresses) {
  var presses = 0;
  var limit = maxPresses || 7;

  while (presses < limit) {
    if (onTheFeed()) {
      log("  seed: back on the feed after " + presses + " back press(es)");
      return true;
    }

    // Look again before pressing. A check made while TikTok is still redrawing
    // can report "not the feed" when we are already there - and one back press
    // too many, made from the feed, leaves TikTok altogether. That happened:
    // the way back needs three presses, a stale reading caused a fourth, and
    // the script found itself on the home screen.
    sleep(700);
    if (onTheFeed()) {
      log("  seed: back on the feed after " + presses + " back press(es)");
      return true;
    }

    presses++;
    back();
    sleep(rndInt(900, 1500));
  }

  return onTheFeed();
}

/** Should this session start by searching for our topic? */
function shouldSeedNow() {
  if (!SETTINGS.seed.enabled) return false;

  var keywords = SETTINGS.seed.keywords;
  if (!keywords || keywords.length === 0) return false;

  if (!SETTINGS.seed.once_per_day) return true;

  var state = loadState();
  if (state && state.seeded_on === todayKey()) {
    log("Already searched for our topic today, skipping it");
    return false;
  }
  return true;
}

/**
 * Search for one of our topics and watch a few of the results.
 *
 * Every step is checked before the next one starts. A search flow that half
 * works leaves the script somewhere it cannot browse, so it is better to give
 * up and go back to the feed than to press on hopefully.
 */
function doSeedTopic() {
  var keywords = SETTINGS.seed.keywords;
  if (!keywords || keywords.length === 0) {
    log("  seed: no keywords set, skipping");
    return false;
  }

  var keyword = keywords[rndInt(0, keywords.length - 1)];
  log('  seed: searching for "' + keyword + '"');

  // --- open the search screen ---
  // This button does accept a proper press, unlike the one that sends the
  // search further down.
  var entry = findOnScreen(LABELS.search_entry, 800);
  if (!entry) {
    log("  seed: no Search button on the feed, skipping");
    return false;
  }
  try {
    if (entry.bounds().centerY() > device.height * 0.2) {
      log("  seed: the Search button is not where it should be, skipping");
      return false;
    }
  } catch (e) {
    return false;
  }

  if (!pressStrict(entry) && !tapNode(entry)) {
    log("  seed: could not open search");
    return false;
  }
  sleep(rndInt(1500, 2500));

  // --- type the keyword ---
  var box = null;
  try {
    var boxes = className("android.widget.EditText").find();
    for (var i = 0; i < boxes.length; i++) {
      if (isOnScreen(boxes[i])) { box = boxes[i]; break; }
    }
  } catch (e) { /* handled below */ }

  if (!box) {
    log("  seed: no search box found");
    returnToFeed();
    return false;
  }

  var typed = false;
  try { typed = box.setText(keyword); } catch (e) { /* handled below */ }
  if (!typed) {
    log("  seed: could not type into the search box");
    returnToFeed();
    return false;
  }
  sleep(rndInt(1200, 2200));

  // --- send it ---
  var submit = findOnScreen(LABELS.search_submit, 1000);
  if (!submit || !tapNode(submit)) {
    log("  seed: could not send the search");
    returnToFeed();
    return false;
  }
  sleep(rndInt(2000, 3000));

  // Suggestions disappearing is how we know the search went through. Do not
  // take a successful tap as proof.
  if (findOnScreen(LABELS.search_suggestions, 800)) {
    log("  seed: the search did not go through");
    returnToFeed();
    return false;
  }

  // --- open one of the results ---
  var results = [];
  try {
    var found = LABELS.search_result[0]().find();
    for (var j = 0; j < found.length; j++) {
      if (isOnScreen(found[j])) results.push(found[j]);
    }
  } catch (e) { /* handled below */ }

  if (results.length === 0) {
    log("  seed: no results on screen");
    returnToFeed();
    return false;
  }

  log("  seed: " + results.length + " result(s) showing");
  var pick = results[rndInt(0, Math.min(results.length, 4) - 1)];
  if (!pressNode(pick)) {
    log("  seed: could not open a result");
    returnToFeed();
    return false;
  }
  sleep(rndInt(2000, 3000));

  // Deliberately not onTheFeed here: we are inside the search results, which
  // is where we want to be. We only need to know a video actually came up.
  if (!aVideoIsPlaying()) {
    log("  seed: opening the result did not lead anywhere watchable");
    returnToFeed();
    return false;
  }

  // --- watch a few, then leave ---
  var toWatch = Math.round(rndFromRange(SETTINGS.seed.videos_to_watch));
  log("  seed: watching " + toWatch + " of them");

  for (var k = 0; k < toWatch && !stopRequested; k++) {
    watchFor(pickWatchMs());
    if (stopRequested) break;

    // Liking here is the point of the exercise: these are videos we chose.
    if (chance(activeRates.like)) doLike();

    humanPause(200, 900);
    swipeToNextVideo(false);
    sleep(rndInt(600, 1300));
  }

  if (!returnToFeed()) {
    console.error("  seed: could not get back to the feed - ending the session");
    stopRequested = true;
    return false;
  }

  stats.seeded++;
  saveState({ seeded_on: todayKey() });
  return true;
}

// -------------------------------------------------- leaving a note behind

/** The time now, as "2026-07-22 18:57". */
function timestamp() {
  var d = new Date();
  function two(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
         " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

/**
 * Write down how this session went.
 *
 * A farm is a dozen phones nobody is looking at. Without this, the only record
 * of a session is a console on a screen in a drawer, and a phone that quietly
 * stopped working three days ago looks exactly like one that is fine.
 *
 * Kept small and bounded: the last session in full, plus a short history.
 */
function writeStatus(startedAt) {
  var summary = {
    device_id: SETTINGS.device_id || "(unnamed)",
    finished_at: timestamp(),
    ran_minutes: Number(((Date.now() - startedAt) / 60000).toFixed(1)),
    ended_because: endReason,
    videos: stats.videos,
    liked: stats.like,
    saved: stats.save,
    shared: stats.share,
    comments_read: stats.comments,
    searched_topic: stats.seeded > 0,
    buttons_not_found: stats.misses
  };

  try {
    var previous = {};
    if (files.exists(SETTINGS.watchdog.status_file)) {
      try {
        previous = JSON.parse(files.read(SETTINGS.watchdog.status_file)) || {};
      } catch (e) {
        previous = {};   // a corrupted note is not worth stopping over
      }
    }

    var recent = previous.recent instanceof Array ? previous.recent : [];
    recent.unshift(summary);
    recent = recent.slice(0, SETTINGS.watchdog.keep_recent_sessions);

    files.write(SETTINGS.watchdog.status_file, JSON.stringify({
      device_id: summary.device_id,
      tiktok_package: tiktokPackage,
      last_session: summary,
      recent: recent
    }, null, 2));
  } catch (e) {
    console.warn("Could not write the status note: " + e);
  }
}

// ------------------------------------------------------- going easy at first

/** How many whole days since the account was created, or null if unknown. */
function accountAgeDays() {
  var started = SETTINGS.ramp_up.account_started;
  if (!started) return null;

  var parts = String(started).split("-");
  if (parts.length !== 3) {
    console.warn("account_started should look like 2026-07-22 - ignoring it");
    return null;
  }

  var then = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(then.getTime())) {
    console.warn("account_started is not a real date - ignoring it");
    return null;
  }

  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

/**
 * The rates to use right now. A young account gets the held-down rates from
 * the matching stage; anything older gets the full rates.
 */
function currentRates() {
  var age = accountAgeDays();
  if (age === null) return SETTINGS.rates;

  var stages = SETTINGS.ramp_up.stages;
  for (var i = 0; i < stages.length; i++) {
    if (age < stages[i].first_days) return stages[i].rates;
  }
  return SETTINGS.rates;
}

function describeRates(rates) {
  return "like " + (rates.like * 100) + "%, save " + (rates.save * 100) +
         "%, comments " + (rates.read_comments * 100) + "%, share " +
         (rates.share * 100) + "%";
}

// ------------------------------------------------------------- the day's plan

/**
 * What the script remembers between runs.
 *
 * Without this, every restart would begin a fresh run of sessions. Android
 * restarts apps often enough that the phone would end up browsing far more
 * than intended, in bursts, which is exactly the shape we are avoiding.
 */
function loadState() {
  try {
    var path = SETTINGS.schedule.state_file;
    if (files.exists(path)) {
      var parsed = JSON.parse(files.read(path));
      if (parsed && parsed.day) return parsed;
    }
  } catch (e) {
    console.warn("Could not read the saved plan (" + e + ") - starting fresh");
  }
  return null;
}

/**
 * Save some fields, leaving anything else in the file alone.
 *
 * Two separate things write here - the daily plan, and the note that we have
 * already searched for our topic today. Replacing the whole file would mean
 * whichever wrote last wiped the other.
 */
function saveState(changes) {
  try {
    var current = loadState() || {};
    for (var key in changes) {
      if (changes.hasOwnProperty(key)) current[key] = changes[key];
    }
    files.write(SETTINGS.schedule.state_file, JSON.stringify(current));
  } catch (e) {
    console.warn("Could not save the plan (" + e + ")");
    console.warn("Sessions will not be counted across restarts.");
  }
}

/** Today's date as "2026-07-22", used to notice when a new day starts. */
function todayKey() {
  var now = new Date();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  return now.getFullYear() + "-" +
         (month < 10 ? "0" : "") + month + "-" +
         (day < 10 ? "0" : "") + day;
}

/** Decide how many sessions today gets, and remember it. */
function planForToday() {
  var planned = Math.round(rndFromRange(SETTINGS.schedule.sessions_per_day));
  var lazy = chance(SETTINGS.schedule.chance_of_lazy_day);

  if (lazy) {
    planned = Math.max(1, Math.round(planned / 3));
  }

  var state = {
    day: todayKey(),
    planned_today: planned,
    sessions_today: 0,
    last_session_ended: 0,
    lazy_day: lazy,
    seeded_on: ""     // a new day means we may search for our topic again
  };

  saveState(state);
  console.log("Plan for today: " + planned + " session(s)" +
              (lazy ? "  (a lazy day)" : ""));
  return state;
}

/** Load today's plan, making a new one if the day has rolled over. */
function planForNow() {
  var state = loadState();
  if (!state || state.day !== todayKey()) return planForToday();

  console.log("Today so far: " + state.sessions_today + " of " +
              state.planned_today + " session(s) done" +
              (state.lazy_day ? "  (a lazy day)" : ""));
  return state;
}

/** Is the clock inside one of the hours the account is meant to be awake? */
function isWithinActiveHours() {
  var hour = new Date().getHours();
  var windows = SETTINGS.schedule.active_hours;

  for (var i = 0; i < windows.length; i++) {
    if (hour >= windows[i][0] && hour < windows[i][1]) return true;
  }
  return false;
}

// ------------------------------------------------------------- one session

/** Open TikTok, browse for a while, then leave it. */
function runOneSession() {
  var minutes = settingValue(SETTINGS.session_minutes);

  stats = { videos: 0, like: 0, save: 0, share: 0, comments: 0, seeded: 0,
            back: 0, misses: 0 };
  endReason = "unknown";
  consecutiveMisses = 0;
  activeRates = currentRates();

  console.log("");
  console.log("=== Session starting: " + minutes.toFixed(1) + " minutes, " +
              describeRates(activeRates) + " ===");

  if (!openTikTok()) {
    console.error("Could not open TikTok. Is the screen unlocked?");
    return false;
  }

  var startedAt = Date.now();
  try {
    if (shouldSeedNow()) doSeedTopic();

    // Searching for a topic takes a couple of minutes, and it counts as part
    // of the session rather than being added on top - otherwise a session that
    // seeds runs noticeably longer than the schedule planned for it. Always
    // leave a little time for ordinary browsing afterwards.
    var spentSeeding = (Date.now() - startedAt) / 60000;
    var leftToBrowse = Math.max(1, minutes - spentSeeding);
    if (spentSeeding > 0.5) {
      log("Searching took " + spentSeeding.toFixed(1) + " min, so browsing for "
          + leftToBrowse.toFixed(1) + " min");
    }

    if (!stopRequested) runSession(leftToBrowse);
  } catch (e) {
    console.error("Session stopped by an error: " + e);
    endReason = "error: " + e;
  } finally {
    printSummary(startedAt);
    writeStatus(startedAt);
  }

  // Leave TikTok rather than sitting in it for hours between sessions.
  try { home(); } catch (e) { /* not fatal */ }
  return true;
}

// ------------------------------------------------------- the long-running loop

/**
 * Wait, but in small pieces, so a stop request is noticed quickly rather than
 * hours later.
 */
function waitQuietly(minutes, reason) {
  var until = Date.now() + minutes * 60 * 1000;
  var announced = false;

  while (Date.now() < until && !stopRequested) {
    if (!announced) {
      log("Waiting " + Math.round(minutes) + " min - " + reason);
      announced = true;
    }
    sleep(30000);
  }
}

/**
 * Run sessions across the day, at the hours the account is meant to be awake,
 * with gaps in between. Keeps going until stopped.
 */
function runOnSchedule() {
  var state = planForNow();

  while (!stopRequested) {
    if (!checkBattery()) {
      waitQuietly(30, "battery too low to browse");
      continue;
    }

    // A new day means a new plan.
    if (state.day !== todayKey()) state = planForToday();

    if (state.sessions_today >= state.planned_today) {
      waitQuietly(rnd(20, 40), "done for today, waiting for tomorrow");
      continue;
    }

    if (!isWithinActiveHours()) {
      // Checked often, because waiting costs the same whatever the number:
      // waitQuietly sleeps in half-minute pieces either way. A longer figure
      // would only mean a session starting up to half an hour after its window
      // opened, for no saving at all.
      waitQuietly(rnd(4, 8), "outside waking hours");
      continue;
    }

    var sinceLast = (Date.now() - state.last_session_ended) / 60000;
    var wantedGap = rndFromRange(SETTINGS.schedule.gap_minutes);
    if (state.last_session_ended > 0 && sinceLast < wantedGap) {
      waitQuietly(Math.min(20, wantedGap - sinceLast), "too soon after the last session");
      continue;
    }

    if (!runOneSession()) {
      waitQuietly(10, "could not start TikTok, trying again later");
      continue;
    }

    state.sessions_today++;
    state.last_session_ended = Date.now();
    saveState(state);
  }

  console.log("");
  console.log("Schedule stopped.");
}

// ---------------------------------------------------------------- start up

// Volume-up stops the session cleanly, so we do not leave TikTok mid-action.
try {
  events.observeKey();
  events.onKeyDown("volume_up", function () {
    stopRequested = true;
    console.warn("Stop requested - finishing the current video");
  });
} catch (e) {
  console.warn("Volume-key stop is unavailable. Stop from AutoJs6 instead.");
}

tiktokPackage = detectTikTokPackage();
if (!tiktokPackage) {
  console.error("TikTok is not installed, or uses a package name we do not know.");
  console.error("Tried: " + TIKTOK_PACKAGES.join(", "));
  exit();
}

// Load this phone's own settings before anything reads them.
var hasOwnConfig = applyDeviceConfig();

console.log("Phone   : " + device.brand + " " + device.model +
            " (Android " + device.release + ")");
console.log("Known as: " + (SETTINGS.device_id || "(unnamed)") +
            (hasOwnConfig ? "" : "  - USING DEFAULTS, no device.json"));
console.log("TikTok  : " + tiktokPackage);

var age = accountAgeDays();
if (age === null) {
  console.log("Account : age unknown - full rates from the start");
  console.log("          (set ramp_up.account_started to go easy on a new one)");
} else {
  console.log("Account : " + age + " days old");
}
console.log("Rates   : " + describeRates(currentRates()));
console.log("Session : " + (SETTINGS.session_minutes instanceof Array
              ? SETTINGS.session_minutes[0] + "-" + SETTINGS.session_minutes[1] +
                " minutes"
              : SETTINGS.session_minutes + " minutes"));
if (SETTINGS.seed.enabled && SETTINGS.seed.keywords.length > 0) {
  console.log("Topics  : " + SETTINGS.seed.keywords.join(", "));
}
console.log("");

// The rates in force for the session about to run. Reset at the start of each
// session, because a long-running schedule can cross into a new ramp-up stage.
var activeRates = currentRates();

if (SETTINGS.schedule.enabled) {
  console.log("Running on a schedule. Press volume up to stop.");
  console.log("Awake hours: " +
              SETTINGS.schedule.active_hours.map(function (w) {
                return w[0] + ":00-" + w[1] + ":00";
              }).join(", "));
  runOnSchedule();
} else {
  // One session, then stop. This is the mode to use while testing.
  runOneSession();
}

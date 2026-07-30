/**
 * main.js - browse the TikTok feed like a person would
 *
 * What it does: opens TikTok, watches videos in the For You feed, and now and
 * then likes one, saves one, reads the comments, or copies a link to share.
 * How often it does each is set in lib/settings.js. It stops by itself when the
 * session time runs out.
 *
 * It never writes anything: no comments, no replies, no messages.
 *
 * Before the first run: run probe.js to find out what the buttons are called
 * on your TikTok version, then check lib/labels.js.
 *
 * To stop early: press the volume-up key, or stop the script from AutoJs6.
 */

// ============================================================================
// THE OTHER FILES THIS ONE NEEDS
// ============================================================================
//
// Parts of this script live in lib/ beside it. tools/run.sh and tools/deploy.sh
// send those files first and refuse to send this one if any of them fails to
// arrive, so a phone is never left with a main.js whose parts are missing.
//
// Confirmed on a Galaxy A8+ running Android 9 by probe_require.js: require()
// works, finds a file in a subfolder, and hands every caller the same object,
// so a module can hold state that the whole script shares.

/**
 * The lib/ folder, worked out from where this script itself is.
 *
 * Not written down as a fixed path, and not left relative either. require()
 * resolves a relative name against the working directory, which on the phones
 * tested happens to be the script's own folder - but that is a coincidence we
 * would rather not depend on, and one that would fail silently somewhere else.
 * Asking the engine where this file is removes the question.
 */
function moduleFolder() {
  try {
    var full = String(engines.myEngine().getSource().getFullPath());
    var cut = full.lastIndexOf("/");
    if (cut > 0) return full.substring(0, cut) + "/lib/";
  } catch (e) { /* fall through */ }

  console.warn("Could not work out where this script is. Looking for its");
  console.warn("other files in ./lib/ and hoping for the best.");
  return "./lib/";
}

var MODULE_FOLDER = moduleFolder();

/**
 * Load one of this script's own files, or stop.
 *
 * Stopping is the point. A module that fails to load leaves the script without
 * something it needs, and carrying on would mean browsing with, say, no button
 * names at all - swiping past everything, pressing nothing, and reporting a
 * healthy session at the end of it. Refusing to start is loud; half-working is
 * not.
 */
function requireModule(name) {
  var path = MODULE_FOLDER + name + ".js";
  try {
    return require(path);
  } catch (e) {
    console.error("Could not load " + path);
    console.error("  " + e);
    console.error("");
    console.error("This script is in several files and one of them is missing");
    console.error("or broken. Send them all again:");
    console.error("  ./tools/deploy.sh");
    exit();
  }
}

// ============================================================================
// SETTINGS - moved to lib/settings.js
// ============================================================================
//
// The defaults, and the reasoning behind each one, are in lib/settings.js. A
// phone changes only what it needs in its own device.json, which deploy.sh puts
// beside this script - see applyDeviceConfig below.

var state = requireModule("state");
var SETTINGS = state.SETTINGS;
var DEVICE_CONFIG_FILE = state.DEVICE_CONFIG_FILE;

// Safe to name locally because nothing ever replaces them - see the rule at the
// top of lib/state.js. Everything that does get replaced is reached as state.x.
var stats = state.stats;
var log = state.log;
var noteMiss = state.noteMiss;
var noteHit = state.noteHit;
var buttonsSeemBroken = state.buttonsSeemBroken;

// The dice and the careful ways of pressing a button, from lib/util.js. Named
// locally so the code below reads the same as it did when they lived here.
var util = requireModule("util");
var rndInt = util.rndInt;
var rnd = util.rnd;
var chance = util.chance;
var rndFromRange = util.rndFromRange;
var settingValue = util.settingValue;
var isOnScreen = util.isOnScreen;
var findOnScreen = util.findOnScreen;
var pressNode = util.pressNode;
var pressStrict = util.pressStrict;
var findSameButtonAgain = util.findSameButtonAgain;
var tapNode = util.tapNode;
var humanPause = util.humanPause;
var escapeForMatch = util.escapeForMatch;

// Opening TikTok and knowing which screen we are on, from lib/feed.js.
var feed = requireModule("feed");
var detectTikTokPackage = feed.detectTikTokPackage;
var isTikTokOnScreen = feed.isTikTokOnScreen;
var openTikTok = feed.openTikTok;
var checkStopSignals = feed.checkStopSignals;
var isScreenOn = feed.isScreenOn;
var onTheFeed = feed.onTheFeed;
var videoFingerprint = feed.videoFingerprint;
var aVideoIsPlaying = feed.aVideoIsPlaying;
var returnToFeed = feed.returnToFeed;
var swipeToNextVideo = feed.swipeToNextVideo;
var pickWatchMs = feed.pickWatchMs;
var watchFor = feed.watchFor;

// The inbox and the one thing that reaches another person, from lib/messages.js.
var messages = requireModule("messages");
var doCheckMessages = messages.doCheckMessages;
var backToFeedFromInbox = messages.backToFeedFromInbox;
var screenItems = messages.screenItems;
var tidyName = messages.tidyName;
var nameIsOn = messages.nameIsOn;

// The day's plan, the gentle start for a young account, and the note left
// behind for whoever checks the farm - all from lib/schedule.js.
var schedule = requireModule("schedule");
var timestamp = schedule.timestamp;
var writeStatus = schedule.writeStatus;
var accountAgeDays = schedule.accountAgeDays;
var currentRates = schedule.currentRates;
var describeRates = schedule.describeRates;
var loadState = schedule.loadState;
var saveState = schedule.saveState;
var todayKey = schedule.todayKey;
var planForToday = schedule.planForToday;
var planForNow = schedule.planForNow;
var isWithinActiveHours = schedule.isWithinActiveHours;
var waitQuietly = schedule.waitQuietly;

// What the script does to a video, from lib/actions.js.
var actions = requireModule("actions");
var doLike = actions.doLike;
var doSave = actions.doSave;
var doReadComments = actions.doReadComments;
var doShare = actions.doShare;
var doSendToFriend = actions.doSendToFriend;

// Searching for a topic, from lib/seeding.js.
var seeding = requireModule("seeding");
var shouldSeedNow = seeding.shouldSeedNow;
var doSeedTopic = seeding.doSeedTopic;

// Which of our accounts this phone is, from lib/identity.js. Read once, so the
// messaging features can act on everyone on the shared roster except ourselves.
var identity = requireModule("identity");
var establishIdentity = identity.establishIdentity;

// ============================================================================
// BUTTON LABELS - moved to lib/labels.js
// ============================================================================
//
// What TikTok's buttons are called now lives in its own file. That is the part
// which goes out of date, and the part somebody has to edit in a hurry when a
// TikTok update stops the farm; it should not be buried in the middle of the
// machinery. Run probe.js and edit lib/labels.js.

var labelsModule = requireModule("labels");
var LABELS = labelsModule.LABELS;
var TIKTOK_PACKAGES = labelsModule.TIKTOK_PACKAGES;

// ============================================================================
// Everything below is the machinery. You should not need to edit it.
// ============================================================================

auto.waitFor();

// Show the console straight away, before this phone's own settings are read.
// A phone that turned it off gets it hidden again a moment later, once those
// settings load. Doing it in this order means the startup messages - including
// the refusal to run a second copy - are on screen for every phone, which is
// exactly when somebody standing over the farm needs to see them.
if (SETTINGS.show_console_window) console.show();


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

/**
 * Settle the console window and the swipe back, which cannot both be had.
 *
 * Call this once, after this phone's own settings are loaded - either of them
 * can be changed there, so deciding any earlier decides on the wrong values.
 *
 * The two settings are kept separate on purpose. Nobody editing a phone's
 * config should have to remember that turning the panel on means turning the
 * swipe off; forgetting would not break anything visibly, it would just quietly
 * make every swipe back a miss. So the code does the remembering, and says so.
 */
function settleConsoleWindow() {
  try {
    if (SETTINGS.show_console_window) console.show();
    else console.hide();
  } catch (e) {
    // Not worth stopping a night's browsing over a window. Say it plainly:
    // somebody watching for the panel should learn why it never appeared.
    console.warn("Could not " + (SETTINGS.show_console_window ? "show" : "hide") +
                 " the console window (" + e + "). Carrying on.");
  }

  if (SETTINGS.show_console_window && SETTINGS.chance_of_swipe_back > 0) {
    SETTINGS.chance_of_swipe_back = 0;
    console.log("Swipe back is off while the console panel is on - the panel");
    console.log("covers the part of the screen that swipe starts from.");
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


function runSession(minutes) {
  var endAt = Date.now() + minutes * 60 * 1000;
  var consecutiveFailures = 0;

  while (Date.now() < endAt && !state.stopRequested) {
    if (!checkBattery()) { state.endReason = "battery_low"; break; }

    if (!isTikTokOnScreen()) {
      console.warn("TikTok is no longer on screen (currentPackage \"" +
                   feed.currentPackageSafe() + "\"), reopening");
      if (!openTikTok()) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          console.error("Stopping: could not get back into TikTok");
          state.endReason = "tiktok_would_not_open";
          break;
        }
        continue;
      }
    }
    consecutiveFailures = 0;

    if (checkStopSignals()) { state.endReason = "needs_a_human"; break; }

    if (buttonsSeemBroken()) {
      console.error("Nothing has been findable for " + state.consecutiveMisses +
                    " tries in a row.");
      console.error("TikTok has probably been updated and renamed things.");
      console.error("Run probe.js and check lib/labels.js.");
      state.endReason = "buttons_not_found";
      break;
    }

    if (!isScreenOn()) {
      console.warn("The screen went off - stopping.");
      state.endReason = "screen_off";
      break;
    }

    stats.videos++;
    var watchMs = pickWatchMs();
    var minutesLeft = Math.round((endAt - Date.now()) / 60000);
    log("Video " + stats.videos + " - watching " + Math.round(watchMs / 1000) +
        "s (" + minutesLeft + " min left in session)");

    watchFor(watchMs);
    if (state.stopRequested) { state.endReason = "stopped_by_hand"; break; }

    // Decide what to do with this video. Each is rolled separately, so a video
    // can get both a like and a save.
    if (chance(state.activeRates.like)) doLike();
    if (chance(state.activeRates.save)) doSave();
    if (chance(state.activeRates.read_comments)) doReadComments();
    if (chance(state.activeRates.share)) doShare();

    // Sending a video to one of our own accounts. Capped for the session as
    // well as being rare per video: one account posting a stream of videos to
    // another all evening is a pattern, and not a human one.
    if (SETTINGS.send_to_friend.enabled &&
        stats.sent < SETTINGS.send_to_friend.max_per_session &&
        chance(SETTINGS.send_to_friend.rate)) {
      doSendToFriend();
    }

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
  if (state.endReason === "unknown") state.endReason = "ran_its_time";

  console.log("");
  console.log("========== SESSION FINISHED ==========");
  console.log("Ran for        : " + minutes + " minutes");
  console.log("Videos watched : " + stats.videos);
  console.log("Liked          : " + stats.like);
  console.log("Saved          : " + stats.save);
  console.log("Shared         : " + stats.share);
  console.log("Comments read  : " + stats.comments);
  if (stats.replies > 0) console.log("Replied to     : " + stats.replies);
  if (stats.sent > 0)    console.log("Sent to friend : " + stats.sent);
  if (stats.seeded > 0) console.log("Topic searched : yes");
  console.log("Swiped back    : " + stats.back);
  console.log("Ended because  : " + state.endReason);
  if (stats.misses > 0) {
    console.warn("Buttons not found: " + stats.misses +
                 " - run probe.js and update lib/labels.js");
  }
  console.log("======================================");
}






/** Open TikTok, browse for a while, then leave it. */
function runOneSession() {
  var minutes = settingValue(SETTINGS.session_minutes);

  state.startSession();
  state.activeRates = currentRates();

  console.log("");
  console.log("=== Session starting: " + minutes.toFixed(1) + " minutes, " +
              describeRates(state.activeRates) + " ===");

  if (!openTikTok()) {
    console.error("Could not open TikTok. Is the screen unlocked?");
    return false;
  }

  // Work out which of our accounts this phone is, but only if a feature needs
  // it. Both messaging features act on "the roster, minus ourselves", so they
  // cannot run without knowing our own name; nothing else does, so a browsing
  // phone should not pay the trip to the profile and back. Done once - after
  // the first session this returns straight away.
  if (SETTINGS.messages.enabled || SETTINGS.send_to_friend.enabled) {
    establishIdentity();
    if (state.selfName) schedule.saveState({ account: state.selfName });
  }

  var startedAt = Date.now();
  try {
    // Messages first, the way somebody checks what came in before they start
    // scrolling. It returns to the feed whatever happens.
    doCheckMessages();

    if (shouldSeedNow()) doSeedTopic();

    // Searching for a topic takes a couple of minutes, and checking messages
    // takes a moment too. Both count as part of the session rather than being
    // added on top - otherwise a session that does them runs noticeably longer
    // than the schedule planned for it. Always leave a little time for
    // ordinary browsing afterwards.
    var spentBefore = (Date.now() - startedAt) / 60000;
    var leftToBrowse = Math.max(1, minutes - spentBefore);
    if (spentBefore > 0.5) {
      log("Messages and searching took " + spentBefore.toFixed(1) +
          " min, so browsing for " + leftToBrowse.toFixed(1) + " min");
    }

    if (!state.stopRequested) runSession(leftToBrowse);
  } catch (e) {
    console.error("Session stopped by an error: " + e);
    state.endReason = "error: " + e;
  } finally {
    printSummary(startedAt);
    writeStatus(startedAt);
  }

  // Leave TikTok rather than sitting in it for hours between sessions.
  try { home(); } catch (e) { /* not fatal */ }
  return true;
}


/**
 * Run sessions across the day, at the hours the account is meant to be awake,
 * with gaps in between. Keeps going until stopped.
 */
function runOnSchedule() {
  var plan = planForNow();

  while (!state.stopRequested) {
    if (!checkBattery()) {
      waitQuietly(30, "battery too low to browse");
      continue;
    }

    // A new day means a new plan.
    if (plan.day !== todayKey()) plan = planForToday();

    if (plan.sessions_today >= plan.planned_today) {
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

    var sinceLast = (Date.now() - plan.last_session_ended) / 60000;
    var wantedGap = rndFromRange(SETTINGS.schedule.gap_minutes);
    if (plan.last_session_ended > 0 && sinceLast < wantedGap) {
      waitQuietly(Math.min(20, wantedGap - sinceLast), "too soon after the last session");
      continue;
    }

    if (!runOneSession()) {
      waitQuietly(10, "could not start TikTok, trying again later");
      continue;
    }

    plan.sessions_today++;
    plan.last_session_ended = Date.now();
    saveState(plan);
  }

  console.log("");
  console.log("Schedule stopped.");
}

// ------------------------------------------------------- only one copy at a time

/**
 * Is another copy of this same script already running on this phone?
 *
 * AutoJs6 keeps a list of the scripts it is running, and each one can say
 * which file it came from. That was measured before this was written
 * (probe_engines.js): two copies of one file were started eight seconds apart,
 * and the second saw the first straight away, within twenty milliseconds of
 * starting.
 *
 * Because the answer lives in memory rather than in a file, there is nothing
 * to leave behind. A phone switched off mid-session comes back with a clean
 * slate, which is not true of a lock written to disk.
 *
 * Ids count upwards, so a smaller id means an older copy. The older one keeps
 * going and the newer stands down. That rule matters for the case where two
 * copies start in the same instant and each sees the other: without it both
 * would politely quit and the phone would do nothing at all.
 */
/**
 * The same file, spelled the same way every time.
 *
 * /sdcard is a link to /storage/emulated/0, so one copy of this script can be
 * running as "/sdcard/脚本/main.js" and another as
 * "/storage/emulated/0/脚本/main.js" - the same file under two names. Started
 * from the AutoJs6 file list you get one spelling; started by tools/run.sh you
 * get the other.
 *
 * Comparing the names as text made those two look like different scripts, so
 * the check below waved both through. Two copies browsed the same phone all
 * evening on 2026-07-23 while a check written to prevent exactly that watched
 * them do it.
 *
 * Falls back to the name as given, which is no worse than what it replaced.
 */
function samePathEveryTime(path) {
  try {
    return String(new java.io.File(path).getCanonicalPath());
  } catch (e) {
    return String(path);
  }
}

function anotherCopyIsRunning() {
  if (!SETTINGS.single_instance) return false;

  var myPath, myId, all;
  try {
    var me = engines.myEngine();
    myPath = samePathEveryTime(me.getSource().getFullPath());
    myId = Number(me.getId());
    all = engines.all();
  } catch (e) {
    // Never refuse to start over a question we could not ask. Nothing
    // restarts this script, so a phone that wrongly stands down is idle until
    // somebody notices - worse than one that runs twice.
    console.warn("Could not check for another copy (" + e + "). Carrying on.");
    return false;
  }

  if (!myPath || isNaN(myId)) {
    console.warn("This build cannot name its own script, so a second copy " +
                 "cannot be spotted. Carrying on.");
    return false;
  }

  for (var i = 0; i < all.length; i++) {
    var otherId;
    try {
      otherId = Number(all[i].getId());
      if (otherId === myId) continue;                                  // this one
      if (samePathEveryTime(all[i].getSource().getFullPath()) !== myPath) continue;
    } catch (e) {
      continue;   // cannot read it, so cannot judge it
    }

    if (otherId < myId) {
      console.error("Another copy of this script is already running " +
                    "(id " + otherId + "; this one is " + myId + ").");
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------- start up

if (anotherCopyIsRunning()) {
  console.error("");
  console.error("Stopping, so two copies do not browse this phone at once.");
  console.error("");
  console.error("Two copies do not collide in any obvious way - both look");
  console.error("healthy, and both count their sessions into the same file, so");
  console.error("the daily limit quietly stops being a limit.");
  console.error("");
  console.error("To hand this phone over to this newer copy instead, stop the");
  console.error("older one from the AutoJs6 task list, then start this again.");
  exit();
}

// Volume-up stops the session cleanly, so we do not leave TikTok mid-action.
try {
  events.observeKey();
  events.onKeyDown("volume_up", function () {
    state.stopRequested = true;
    console.warn("Stop requested - finishing the current video");
  });
} catch (e) {
  console.warn("Volume-key stop is unavailable. Stop from AutoJs6 instead.");
}

state.tiktokPackage = detectTikTokPackage();
if (!state.tiktokPackage) {
  console.error("TikTok is not installed, or uses a package name we do not know.");
  console.error("Tried: " + TIKTOK_PACKAGES.join(", "));
  exit();
}

// Load this phone's own settings before anything reads them.
var hasOwnConfig = applyDeviceConfig();
settleConsoleWindow();

console.log("Phone   : " + device.brand + " " + device.model +
            " (Android " + device.release + ")");
console.log("Known as: " + (SETTINGS.device_id || "(unnamed)") +
            (hasOwnConfig ? "" : "  - USING DEFAULTS, no device.json"));
console.log("TikTok  : " + state.tiktokPackage);

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
state.activeRates = currentRates();

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

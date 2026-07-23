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
 * Favorites gives away nothing about its state, so we watch the count instead:
 * press, and it goes up if we saved and down if we un-saved - and if it went
 * down we press again to put it back. Counts rounded to "1.2K" will not move
 * by one, so those videos are left alone. See docs/WHAT-BROKE.md.
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

  for (var i = 0; i < scrolls && !state.stopRequested; i++) {
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
      state.stopRequested = true;
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
    state.stopRequested = true;
    return false;
  }

  return true;
}

/**
 * Send this video to one of our own accounts.
 *
 * This is the one thing the script does that reaches a person and cannot be
 * undone, so read the guards before changing anything here.
 *
 * The order matters. Nothing is pressed until the panel has been checked for a
 * selection that was already there, because this panel holds several people at
 * once and we have no way to see who is in it.
 */
function doSendToFriend() {
  var settings = SETTINGS.send_to_friend;
  var allowed = settings.send_to || [];
  if (allowed.length === 0) return false;

  var shareButton = findOnScreen(LABELS.share, 1200);
  if (!shareButton) {
    noteMiss();
    return false;
  }

  humanPause(300, 900);
  if (!pressStrict(shareButton)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(1000, 1700));

  if (!sharePanelIsOpen(1200)) {
    log("  send: the panel did not open, skipping");
    return false;
  }

  // Nothing may be selected yet. If Send is already on screen then somebody is
  // in the selection, and since we cannot read who, adding our account to it
  // would send the video to them as well.
  if (findOnScreen(LABELS.share_send_button, 500)) {
    log("  send: somebody is already selected in the panel - backing out");
    closeSharePanel();
    return false;
  }

  // Read the row into one entry per person. TikTok draws two for each - the
  // full name and a shortened copy - so the first one seen wins and the rest
  // only add to the count.
  var band = LABELS.share_people_band;
  var items = screenItems();
  var people = [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y < band[0] || it.y > band[1]) continue;
    if (it.className.indexOf("Button") < 0) continue;

    var name = tidyName(it.label);
    if (!name) continue;
    if (nameIsOn(settings.never_send_to, name)) continue;   // blocked outright

    if (seen[name]) { seen[name].count++; continue; }
    seen[name] = { name: name, label: it.label, node: it.node, count: 1,
                   onList: nameIsOn(allowed, name) };
    people.push(seen[name]);
  }

  // Split into accounts we own and everybody else, because they are not
  // interchangeable: one is somewhere a mistake costs nothing, the other is a
  // real person who never asked to hear from a script.
  var onList = [], others = [];
  for (var p = 0; p < people.length; p++) {
    (people[p].onList ? onList : others).push(people[p]);
  }

  var target = null;
  var goingWide = settings.allow_anyone && others.length > 0 &&
                  chance(settings.chance_of_anyone);

  if (onList.length > 0 && !goingWide) {
    target = onList[rndInt(0, onList.length - 1)];
  } else if (goingWide) {
    target = others[rndInt(0, others.length - 1)];
    log('  send: going outside the list to "' + target.label + '"');
  } else if (onList.length > 0) {
    target = onList[rndInt(0, onList.length - 1)];
  }

  if (!target) {
    log("  send: nobody we may send to is in the panel on this video");
    closeSharePanel();
    return false;
  }

  // Two entries per person is normal. More than that means we are matching
  // something we have not understood, and the middle of an action that cannot
  // be undone is the wrong place to find out what.
  if (target.count > 2) {
    log("  send: " + target.count + ' entries match "' + target.label +
        '" - too ambiguous, backing out');
    closeSharePanel();
    return false;
  }

  var chosenName = target.label;
  var wasAt;
  try {
    wasAt = { x: target.node.bounds().centerX(), y: target.node.bounds().centerY() };
  } catch (e) {
    closeSharePanel();
    return false;
  }

  // Look again before pressing, and insist it is the same entry in the same
  // place. This is the only window in which the row could reorder under us,
  // and the cost of that would be a video sent to a stranger.
  humanPause(400, 900);
  var again = findSameButtonAgain(
    [function () { return descMatches("(?i)^" + escapeForMatch(chosenName) + "$"); },
     function () { return textMatches("(?i)^" + escapeForMatch(chosenName) + "$"); }],
    wasAt.x, wasAt.y, 40);

  if (!again) {
    log('  send: "' + chosenName + '" moved between looking and pressing');
    closeSharePanel();
    return false;
  }

  if (!pressStrict(again)) {
    log("  send: could not select " + chosenName + " properly");
    closeSharePanel();
    return false;
  }
  sleep(rndInt(1200, 2000));

  // Selecting somebody is what makes Send appear. No Send means nothing was
  // selected, and pressing on would be pressing blind.
  var send = findOnScreen(LABELS.share_send_button, 1500);
  if (!send) {
    log("  send: no Send button appeared - nothing was selected, backing out");
    closeSharePanel();
    return false;
  }

  // A moment to look at what is being sent, the way a person would. The
  // message box beside it is never touched.
  humanPause(600, 1600);

  var sent = pressStrict(send);
  if (!sent) {
    log("  send: could not press Send - backing out without sending");
    closeSharePanel();
    return false;
  }

  sleep(rndInt(1500, 2400));
  stats.sent++;
  noteHit();
  log("  send: sent this video to " + chosenName);

  // The panel usually closes itself once the video has gone. Make sure.
  if (sharePanelIsOpen(800) && !closeSharePanel()) {
    console.error("  send: the panel will not close - ending the session");
    state.stopRequested = true;
    return false;
  }

  return true;
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

// ---------------------------------------------------------------- main loop

function runSession(minutes) {
  var endAt = Date.now() + minutes * 60 * 1000;
  var consecutiveFailures = 0;

  while (Date.now() < endAt && !state.stopRequested) {
    if (!checkBattery()) { state.endReason = "battery_low"; break; }

    if (!isTikTokOnScreen()) {
      console.warn("TikTok is no longer on screen, reopening");
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
      console.error("Run probe.js and check the BUTTON LABELS section.");
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
                 " - run probe.js and update the BUTTON LABELS section");
  }
  console.log("======================================");
}

// ------------------------------------------------------ searching for a topic

/** Should this session start by searching for our topic? */
function shouldSeedNow() {
  if (!SETTINGS.seed.enabled) return false;

  var keywords = SETTINGS.seed.keywords;
  if (!keywords || keywords.length === 0) return false;

  if (!SETTINGS.seed.once_per_day) return true;

  var plan = loadState();
  if (plan && plan.seeded_on === todayKey()) {
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

  for (var k = 0; k < toWatch && !state.stopRequested; k++) {
    watchFor(pickWatchMs());
    if (state.stopRequested) break;

    // Liking here is the point of the exercise: these are videos we chose.
    if (chance(state.activeRates.like)) doLike();

    humanPause(200, 900);
    swipeToNextVideo(false);
    sleep(rndInt(600, 1300));
  }

  if (!returnToFeed()) {
    console.error("  seed: could not get back to the feed - ending the session");
    state.stopRequested = true;
    return false;
  }

  stats.seeded++;
  saveState({ seeded_on: todayKey() });
  return true;
}




// ------------------------------------------------------------- one session

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
function anotherCopyIsRunning() {
  if (!SETTINGS.single_instance) return false;

  var myPath, myId, all;
  try {
    var me = engines.myEngine();
    myPath = String(me.getSource().getFullPath());
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
      if (String(all[i].getSource().getFullPath()) !== myPath) continue; // another script
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

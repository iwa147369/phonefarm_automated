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

var settingsModule = requireModule("settings");
var DEVICE_CONFIG_FILE = settingsModule.DEVICE_CONFIG_FILE;
var SETTINGS = settingsModule.SETTINGS;

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

var stopRequested = false;

// Why the session ended, and how many button lookups have failed in a row.
// Both feed the note written for whoever checks the farm later.
var endReason = "unknown";
var consecutiveMisses = 0;
var stats = { videos: 0, like: 0, save: 0, share: 0, comments: 0, seeded: 0, replies: 0, sent: 0,
              back: 0, misses: 0 };
var tiktokPackage = null;

// Set once if tidyName ever has to fall back. Kept outside the function so
// the warning appears a single time instead of on every row of every inbox.
var warnedAboutNames = false;

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
 * Share the video by copying its link, which keeps it inside TikTok.
 *
 * Every press here goes through pressStrict - the panel lists real people. And
 * a panel that fails to close swallows every later swipe, so the session ends
 * rather than carrying on blind.
 */
/**
 * Find a button again, insisting it is the same one as before.
 *
 * While TikTok redraws there are two matching buttons in play - this video's
 * and the next one's. Where a count decides whether to press again, reading the
 * wrong one causes the very damage the check exists to prevent.
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
    stopRequested = true;
    return false;
  }

  return true;
}

/** Make a name safe to put inside a pattern. */
function escapeForMatch(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Is this tidied name one of the names in the list? */
function nameIsOn(list, tidiedName) {
  if (!list || !tidiedName) return false;
  for (var i = 0; i < list.length; i++) {
    if (tidyName(list[i]) === tidiedName) return true;
  }
  return false;
}

// ------------------------------------------------------------------- messages

/**
 * Everything on screen, flattened, with the position of each item.
 *
 * The inbox is built from rows, and a row's name, unread badge and preview line
 * are separate items that only belong together because they sit at the same
 * height. So we need the whole screen at once, not one lookup at a time.
 */
function screenItems() {
  var items = [];

  function walk(node, depth) {
    if (!node || depth > 45) return;
    try {
      if (isOnScreen(node)) {
        var b = node.bounds();
        var desc = node.desc();
        var text = node.text();
        items.push({
          node: node,
          label: (desc && desc !== "null") ? desc : (text || ""),
          className: node.className() || "",
          y: Math.round((b.centerY() / device.height) * 100),
          widthPercent: Math.round((b.width() / device.width) * 100)
        });
      }
      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip anything unreadable */ }
  }

  try { walk(auto.root, 0); } catch (e) { /* no tree at all */ }
  return items;
}

/**
 * How many things on screen carry this label.
 *
 * Counting stickers before and after a press is how we know the press sent one
 * and not two. A press that fires twice would otherwise look like success.
 */
function countMatching(pattern) {
  var items = screenItems();
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    if (pattern.test(items[i].label)) n++;
  }
  return n;
}

/** Are we looking at the inbox list, rather than a conversation? */
function onTheInbox() {
  if (!isTikTokOnScreen()) return false;
  if (findOnScreen(LABELS.message_box, 400)) return false;   // a conversation
  return findOnScreen(LABELS.inbox_tab, 600) !== null;
}

/**
 * Read the inbox into one entry per conversation.
 *
 * Rows are found by grouping everything into horizontal bands. Anything within
 * a few percent of the same height belongs to the same row.
 */
function readInboxRows() {
  var items = screenItems();
  var bands = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y < 15 || it.y > 92) continue;      // header and the bottom tabs

    var placed = null;
    for (var b = 0; b < bands.length; b++) {
      if (Math.abs(bands[b].y - it.y) <= 4) { placed = bands[b]; break; }
    }
    if (!placed) {
      placed = { y: it.y, members: [] };
      bands.push(placed);
    }
    placed.members.push(it);
  }

  var rows = [];
  for (var n = 0; n < bands.length; n++) {
    var members = bands[n].members;
    var name = null, unread = 0, preview = "", pressable = null;

    // A row reads: name, the same name again inside the avatar, the unread
    // count, the message, the time. The name is always FIRST - picking the
    // longest piece of text instead turns the message into the name, and broke
    // the check that keeps us off the "New followers" screen.
    // See docs/WHAT-BROKE.md.
    for (var m = 0; m < members.length; m++) {
      var item = members[m];
      var label = item.label;
      if (!label) continue;

      // The unread count: a small View whose whole label is a number.
      if (/^\d+$/.test(label) && item.widthPercent <= 8) {
        unread = parseInt(label, 10);
        continue;
      }

      // Timestamps, and labels TikTok forgot to turn into words - things like
      // "activebadgeis_active" and "storybadgenone_trueicon". They are never a
      // name and never a message.
      if (/^\s*·/.test(label) || LABELS.internal_label.test(label)) continue;

      if (!name) {
        name = label;              // first text in the row wins
      } else if (!preview && tidyName(label) !== tidyName(name)) {
        // The name appears twice - once as the heading and again inside the
        // avatar, where it stands in for a missing profile picture. Skipping
        // the repeat is what leaves the message itself as the preview.
        preview = label;
      }
    }

    // The row itself is full width. The avatar next to it is pressable too, and
    // pressing that opens the person's profile instead of the conversation.
    for (var p = 0; p < members.length; p++) {
      try {
        if (members[p].node.clickable() && members[p].widthPercent >= 80) {
          pressable = members[p].node;
          break;
        }
      } catch (e) { /* skip */ }
    }

    if (name) {
      rows.push({ name: name, unread: unread, preview: preview,
                  y: bands[n].y, node: pressable });
    }
  }

  return rows;
}

/**
 * Tidy a display name so two spellings of the same name match.
 *
 * TikTok puts an invisible character in front of every name in the inbox - the
 * left-to-right mark, U+200E, which decides which way mixed text reads. It does
 * not show up on screen and it does not show up when you copy the name, but it
 * is there in what we read, and a plain comparison against a name typed into
 * the settings file would fail every time for a reason nobody could see.
 *
 * The pattern is written in numbers, never as the characters themselves.
 * Typed in directly it reads as an empty pair of brackets, works on a laptop,
 * and on the phone deletes every name it is given. See docs/WHAT-BROKE.md.
 */
function tidyName(name) {
  if (!name) return "";

  var out = String(name)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // If cleaning emptied a name that was not empty, the pattern above is doing
  // something other than what it says. Fall back to the plain version rather
  // than hand back an empty string, and say so - the fault that hid last time
  // hid because nothing complained.
  if (!out) {
    if (!warnedAboutNames) {
      warnedAboutNames = true;
      console.error("tidyName emptied \"" + name + "\" - the pattern is wrong " +
                    "on this phone. Falling back to a plain comparison.");
    }
    out = String(name).replace(/\s+/g, " ").trim().toLowerCase();
  }

  return out;
}

/** Is this a row we are allowed to open? */
function mayReplyTo(row) {
  if (!row.name) return false;
  if (LABELS.not_a_conversation.test(row.name)) return false;
  if (LABELS.unusable_name.test(row.name)) return false;
  if (row.unread < 1) return false;

  var wanted = tidyName(row.name);
  if (!wanted) return false;

  var allowed = SETTINGS.messages.reply_to || [];
  for (var i = 0; i < allowed.length; i++) {
    if (tidyName(allowed[i]) === wanted) return true;
  }
  return false;
}

/**
 * Send one sticker in the conversation that is already open.
 *
 * Every check here earns its place. An earlier version of this decided what to
 * press by position - "whatever sits above the message box" - caught a button
 * from this very bar, and sent two stickers nobody asked for.
 */
function reactInConversation(expectedName) {
  // The right conversation. Anything else and we do nothing.
  var header = null;
  var items = screenItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i].y <= 12 && tidyName(items[i].label) === tidyName(expectedName)) {
      header = items[i];
      break;
    }
  }
  if (!header) {
    log("  messages: this is not " + expectedName + " - leaving it alone");
    return false;
  }

  // The message box must be empty and low on screen. Anywhere else means the
  // keyboard is up or a panel is open, and the bar will not be there.
  var box = findOnScreen(LABELS.message_box, 800);
  if (!box) {
    log("  messages: no message box - not a conversation");
    return false;
  }

  // The whole bar has to be drawn before we press any of it.
  for (var b = 0; b < LABELS.quick_send_all.length; b++) {
    var name = LABELS.quick_send_all[b];
    var found = false;
    for (var j = 0; j < items.length; j++) {
      if (items[j].label === name) { found = true; break; }
    }
    if (!found) {
      log("  messages: the send bar is incomplete (no " + name + ") - skipping");
      return false;
    }
  }

  var choices = SETTINGS.messages.reactions || [];
  if (choices.length === 0) return false;
  var choice = choices[rndInt(0, choices.length - 1)];
  var matchers = LABELS.quick_send[choice];
  if (!matchers) {
    log("  messages: " + choice + " is not one we have checked - skipping");
    return false;
  }

  var button = findOnScreen(matchers, 900);
  if (!button) {
    noteMiss();
    return false;
  }

  var wasAt;
  try {
    wasAt = { x: button.bounds().centerX(), y: button.bounds().centerY() };
  } catch (e) {
    return false;
  }

  // Look again before pressing. Nothing on these screens is assumed to hold
  // still: the sticker shelf was seen relabelling itself between two readings
  // a minute and a half apart, with nobody touching the phone.
  humanPause(500, 1100);
  var again = findSameButtonAgain(matchers, wasAt.x, wasAt.y, 40);
  if (!again) {
    log("  messages: the " + choice + " button moved - not pressing");
    return false;
  }

  var before = countMatching(/^stickers$/i);

  // pressStrict, never pressNode: pressNode falls back to tapping a position,
  // and a position on this screen is how the accident happened.
  if (!pressStrict(again)) {
    log("  messages: could not press " + choice + " properly - nothing sent");
    noteMiss();
    return false;
  }

  sleep(rndInt(1800, 2600));

  var after = countMatching(/^stickers$/i);
  if (after === before + 1) {
    log("  messages: sent " + choice + " to " + expectedName);
    stats.replies++;
    noteHit();
    return true;
  }

  if (after > before + 1) {
    console.error("  messages: one press produced " + (after - before) +
                  " stickers - switching messages off for this session");
    SETTINGS.messages.enabled = false;
    return false;
  }

  log("  messages: pressed " + choice + " but nothing arrived");
  noteMiss();
  return false;
}

/**
 * Check the inbox at the start of a session and reply to a few people.
 *
 * Returns to the feed whatever happens. Getting stranded in the inbox would
 * cost the whole session.
 */
function doCheckMessages() {
  var settings = SETTINGS.messages;
  if (!settings.enabled) return;
  if (!settings.reply_to || settings.reply_to.length === 0) return;
  if (!chance(settings.chance_of_checking)) return;

  // Wait for the feed rather than giving up the moment it is not there yet.
  //
  // TikTok takes a few seconds to draw the feed after it opens, and a check
  // made too early answers "not the feed". That skipped the whole thing on one
  // run and said nothing about it - the log jumped straight from "Opening
  // TikTok" to the first video, and the only way to notice was that a line was
  // missing. Silence is the worst way for a feature to fail.
  var readyBy = Date.now() + 8000;
  while (!onTheFeed() && Date.now() < readyBy) sleep(600);
  if (!onTheFeed()) {
    log("  messages: the feed has not come up - skipping messages this session");
    return;
  }

  log("Checking messages first");

  var tab = findOnScreen(LABELS.inbox_tab, 1200);
  if (!tab || !pressStrict(tab)) {
    log("  messages: could not open the inbox");
    return;
  }
  sleep(rndInt(1400, 2200));

  if (!onTheInbox()) {
    log("  messages: the inbox did not open");
    backToFeedFromInbox();
    return;
  }

  var rows = readInboxRows();
  var wanted = [];
  for (var i = 0; i < rows.length; i++) {
    if (mayReplyTo(rows[i])) wanted.push(rows[i]);
  }

  log("  messages: " + rows.length + " conversations, " + wanted.length +
      " unread from people we reply to");

  // When nothing matches, say what WAS unread. Otherwise the only clue is a
  // zero, and there is no way to tell "nothing has come in" apart from "the
  // name in the settings file is spelled differently to the name on screen".
  if (wanted.length === 0) {
    var unread = [];
    for (var u = 0; u < rows.length; u++) {
      if (rows[u].unread > 0 && !LABELS.not_a_conversation.test(rows[u].name)) {
        unread.push('"' + rows[u].name + '" -> compared as "' +
                    tidyName(rows[u].name) + '"  says: "' + rows[u].preview + '"');
      }
    }
    if (unread.length > 0) {
      var listed = [];
      for (var a = 0; a < (settings.reply_to || []).length; a++) {
        listed.push('"' + tidyName(settings.reply_to[a]) + '"');
      }
      log("  messages: reply_to holds " + listed.length + ": " + listed.join(", "));
      log("  messages: unread, but not on the reply_to list:");
      for (var v = 0; v < unread.length; v++) log("      " + unread[v]);
      log("    (name first, then what the message says - if those two look");
      log("     swapped, the rows are being read wrongly)");
    }
  }

  var limit = Math.min(wanted.length, settingValue(settings.max_replies));

  for (var w = 0; w < limit && !stopRequested; w++) {
    var row = wanted[w];

    // Read the list again and make sure this row still says what it said. The
    // inbox is a recycling list: it fills rows in as their pictures arrive, and
    // a row read too early can still be carrying the previous row's name.
    var fresh = readInboxRows();
    var confirmed = null;
    for (var f = 0; f < fresh.length; f++) {
      if (fresh[f].name === row.name && Math.abs(fresh[f].y - row.y) <= 4) {
        confirmed = fresh[f];
        break;
      }
    }
    if (!confirmed || !confirmed.node || !mayReplyTo(confirmed)) {
      log("  messages: " + row.name + " is not where it was - skipping");
      continue;
    }

    if (!pressStrict(confirmed.node)) {
      log("  messages: could not open " + row.name);
      continue;
    }
    sleep(rndInt(1500, 2400));

    // Reading it takes a moment, whether or not we answer.
    humanPause(1200, 3200);

    if (chance(settings.chance_of_replying)) {
      reactInConversation(row.name);
    } else {
      log("  messages: read " + row.name + ", left it without replying");
    }

    humanPause(600, 1500);
    back();
    sleep(rndInt(1000, 1700));

    if (!onTheInbox()) {
      log("  messages: lost the inbox - going back to the feed");
      break;
    }
  }

  backToFeedFromInbox();
}

/**
 * Get back to the feed from the inbox.
 *
 * The inbox is a tab, not a panel, so the back action is not what returns us -
 * pressing Home is. We check we actually arrived, because browsing the wrong
 * screen for a whole session has happened before.
 */
function backToFeedFromInbox() {
  for (var attempt = 0; attempt < 3; attempt++) {
    if (onTheFeed()) return true;

    var home = findOnScreen(LABELS.home_tab, 900);
    if (home) {
      pressStrict(home);
    } else {
      back();
    }
    sleep(rndInt(1200, 1900));
  }

  if (onTheFeed()) return true;

  // Still lost. returnToFeed presses back, checking before each press.
  return returnToFeed(4);
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
  if (endReason === "unknown") endReason = "ran_its_time";

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
    replied: stats.replies,
    sent_to_friend: stats.sent,
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

  stats = { videos: 0, like: 0, save: 0, share: 0, comments: 0, seeded: 0, replies: 0, sent: 0,
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
settleConsoleWindow();

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

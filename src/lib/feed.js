/**
 * lib/feed.js - opening TikTok, and knowing which screen we are on
 *
 * Everything about being in the right place: starting the app, telling the feed
 * apart from everything else, moving between videos, and getting back when we
 * have wandered off.
 *
 * Why "knowing where we are" needs a whole file: a swipe tells us nothing about
 * what it landed on, and TikTok has several screens that look alike to a
 * program. Most of the care here is about refusing to guess. Read
 * docs/WHAT-BROKE.md before changing any of it - the back-press count, the feed
 * marker, and the fingerprint each exist because a simpler version was wrong.
 */

var state = require("./state.js");
var util = require("./util.js");
var LABELS = require("./labels.js").LABELS;
var TIKTOK_PACKAGES = require("./labels.js").TIKTOK_PACKAGES;

var SETTINGS = state.SETTINGS;
var log = state.log;

var rndInt = util.rndInt;
var rnd = util.rnd;
var chance = util.chance;
var rndFromRange = util.rndFromRange;
var findOnScreen = util.findOnScreen;

function detectTikTokPackage() {
  for (var i = 0; i < TIKTOK_PACKAGES.length; i++) {
    if (app.getAppName(TIKTOK_PACKAGES[i])) return TIKTOK_PACKAGES[i];
  }
  return null;
}

function isTikTokOnScreen() {
  return currentPackage() === state.tiktokPackage;
}

function openTikTok() {
  if (isTikTokOnScreen()) return true;

  log("Opening TikTok...");
  app.launchPackage(state.tiktokPackage);

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
  while (slept < totalMs && !state.stopRequested) {
    var step = Math.min(500, totalMs - slept);
    sleep(step);
    slept += step;
  }
}

module.exports = {
  detectTikTokPackage: detectTikTokPackage,
  isTikTokOnScreen: isTikTokOnScreen,
  openTikTok: openTikTok,
  checkStopSignals: checkStopSignals,
  isScreenOn: isScreenOn,
  onTheFeed: onTheFeed,
  videoFingerprint: videoFingerprint,
  aVideoIsPlaying: aVideoIsPlaying,
  returnToFeed: returnToFeed,
  swipeToNextVideo: swipeToNextVideo,
  pickWatchMs: pickWatchMs,
  watchFor: watchFor
};

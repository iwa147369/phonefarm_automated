/**
 * probe_package_check.js - is currentPackage() lying about TikTok being on screen?
 *
 * WHY THIS EXISTS
 *
 * isTikTokOnScreen() is just `currentPackage() === tiktokPackage`. On the farm's
 * Samsung phones a session sometimes ends with "tiktok_would_not_open" while
 * TikTok is plainly on screen: the check reads false, openTikTok tries to
 * relaunch an app that never left, and its whole wait times out.
 *
 * This watches what currentPackage() actually returns across a spell of ordinary
 * browsing - including during and just after a swipe, which is when the fault
 * shows - alongside whether a TikTok element (the Like button) is visible. A
 * line where the Like button is present but currentPackage() is NOT the TikTok
 * package is the bug caught in the act, and it prints exactly which package
 * currentPackage() returned instead, so the fix can be written against it.
 *
 * WHAT IT PRESSES
 *
 * It swipes through the feed - the same gesture browsing uses - and nothing
 * else. No like, no share, no message. Check:
 *
 *   grep -nE "doLike|doShare|doSend|reactIn|click\\(|press" probe_package_check.js
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_package_check.js <phone id>
 */

console.show();

var state = require("./lib/state.js");
var feed = require("./lib/feed.js");
var LABELS = require("./lib/labels.js").LABELS;
var findOnScreen = require("./lib/util.js").findOnScreen;

auto.waitFor();

state.tiktokPackage = feed.detectTikTokPackage();
if (!state.tiktokPackage) {
  console.error("TikTok is not installed under a package name we know. Stopping.");
  exit();
}
console.log("tiktokPackage = " + state.tiktokPackage);

if (!feed.openTikTok()) {
  console.error("Could not open TikTok to begin with. Is it logged in and the");
  console.error("screen unlocked? Nothing was pressed.");
  exit();
}
console.log("on the feed - watching currentPackage() for a while");
console.log("");
console.log("  time   currentPackage()                     like?   verdict");
console.log("  -----  -----------------------------------  ------  -------");

var mismatchWhileVisible = 0;
var samples = 0;
var seenPackages = {};

for (var i = 0; i < 40; i++) {
  // Sample right around a swipe every few iterations, since that is when the
  // fault is reported. The rest of the time just poll.
  var swiping = (i % 4 === 0 && i > 0);
  if (swiping) feed.swipeToNextVideo(false);

  var pkg = "";
  try { pkg = String(currentPackage() || ""); } catch (e) { pkg = "(threw)"; }
  var likeThere = findOnScreen(LABELS.like, 250) !== null;
  var isTk = pkg === state.tiktokPackage;

  seenPackages[pkg] = (seenPackages[pkg] || 0) + 1;
  samples++;

  var verdict = "";
  if (!isTk && likeThere) { verdict = "<-- FALSE NEGATIVE"; mismatchWhileVisible++; }
  else if (!isTk && !likeThere) verdict = "(really off TikTok?)";
  else verdict = "ok";

  var t = new Date();
  var stamp = ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
  console.log("  " + stamp + "  " + (pkg + "                                   ").slice(0, 35) +
              "  " + (likeThere ? "yes   " : "no    ") + "  " +
              (swiping ? "[swipe] " : "") + verdict);

  sleep(swiping ? 300 : 600);
}

console.log("");
console.log("=====================================");
console.log("SUMMARY");
console.log("=====================================");
console.log("  samples: " + samples);
console.log("  times TikTok was visible (Like present) but currentPackage() disagreed: " +
            mismatchWhileVisible);
console.log("  packages currentPackage() returned:");
for (var p in seenPackages) {
  if (seenPackages.hasOwnProperty(p)) {
    console.log("    " + seenPackages[p] + "x  " + JSON.stringify(p));
  }
}
console.log("");
if (mismatchWhileVisible > 0) {
  console.log("  -> confirmed: currentPackage() reports not-TikTok while TikTok is up.");
  console.log("     isTikTokOnScreen() should confirm with a visible element, not");
  console.log("     trust currentPackage() alone.");
} else {
  console.log("  -> no false negative seen this run. Try again while a session is");
  console.log("     actually browsing, or watch for the ad / 'all caught up' screens.");
}
console.log("");
console.log("Nothing was sent or pressed. Only swipes.");

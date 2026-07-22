/**
 * probe_feed_marker.js - find something that only exists on the For You feed
 *
 * THE PROBLEM THIS SOLVES
 *
 * The script decides "we are on the feed" by looking for the Like button. That
 * is wrong: every video player has a Like button - search results, a creator's
 * videos, all of them. So after searching for a topic, the script believed it
 * was back on the feed while it was still inside the search results, and spent
 * the rest of the session browsing there. It reported success the whole time.
 *
 * To fix it we need something that appears on the real feed and nowhere else.
 * Rather than guess, this compares the two screens and prints the difference.
 *
 * WHAT IT DOES
 *
 *   1. Writes down every label on the feed
 *   2. Searches for a word, opens the first result
 *   3. Writes down every label there
 *   4. Prints what is on the feed but NOT in the search results - those are
 *      the candidates for telling the two apart
 *   5. Presses back until one of those candidates reappears, and reports how
 *      many presses that took
 *
 * Step 5 doubles as a test of the fix: if a candidate reappears after pressing
 * back, that candidate works as a marker.
 *
 * HOW TO USE
 *
 *   Open TikTok on the feed, run this, and switch back within 5 seconds.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var SEARCH_WORD = "coffee";

// ---------------------------------------------------------------- helpers

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

function findVisible(matchers, topLimitPercent) {
  var firstAnything = null;
  for (var i = 0; i < matchers.length; i++) {
    var matches;
    try { matches = matchers[i]().find(); } catch (e) { continue; }
    if (!matches) continue;

    for (var j = 0; j < matches.length; j++) {
      if (!isOnScreen(matches[j])) continue;
      if (topLimitPercent !== undefined) {
        try {
          if ((matches[j].bounds().centerY() / device.height) * 100 > topLimitPercent) {
            continue;
          }
        } catch (e) { continue; }
      }
      try { if (matches[j].clickable()) return matches[j]; } catch (e) { }
      if (!firstAnything) firstAnything = matches[j];
    }
  }
  return firstAnything;
}

function pressStrict(node) {
  var target = node;
  for (var level = 0; level < 3 && target; level++) {
    try {
      if (target.clickable()) return target.click();
      var parent = target.parent();
      if (!parent || parent.bounds().height() > device.height * 0.3) return false;
      target = parent;
    } catch (e) { return false; }
  }
  return false;
}

function tapNode(node) {
  try {
    var b = node.bounds();
    return click(b.centerX(), b.centerY());
  } catch (e) { return false; }
}

/**
 * Collect the labels on screen.
 *
 * Only short ones are kept. Captions and creator names change from video to
 * video, so they can never work as a marker; a label like "Following" or
 * "Profile" belongs to the screen itself.
 */
function labelsOnScreen() {
  var found = {};

  function walk(node, depth) {
    if (!node || depth > 40) return;
    try {
      var desc = node.desc();
      var text = node.text();
      var label = (desc && desc !== "null") ? desc : (text || "");

      if (label && label.length <= 24 && isOnScreen(node)) {
        var b = node.bounds();
        var where = Math.round((b.centerY() / device.height) * 100);
        found[label] = { label: label, at: where, clickable: node.clickable() };
      }

      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip unreadable nodes */ }
  }

  var root = auto.root;
  if (root) walk(root, 0);
  return found;
}

function listOf(collected) {
  var out = [];
  for (var key in collected) {
    if (collected.hasOwnProperty(key)) out.push(collected[key]);
  }
  return out;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");
console.log("STEP 1 - what is on the feed");

var onFeed = labelsOnScreen();
var feedList = listOf(onFeed);
console.log("Found " + feedList.length + " short labels:");
for (var a = 0; a < feedList.length; a++) {
  console.log("  " + feedList[a].at + '%  "' + feedList[a].label + '"' +
              (feedList[a].clickable ? "  [press]" : ""));
}

// ---- search and open a result ---------------------------------------------

console.log("");
console.log("STEP 2 - searching and opening a result");

var entry = findVisible([
  function () { return descMatches("(?i)^search$"); },
  function () { return textMatches("(?i)^search$"); }
], 20);

if (!entry || !pressStrict(entry)) {
  console.error("Could not open search. Nothing was changed.");
  exit();
}
sleep(2000);

var box = null;
try {
  var boxes = className("android.widget.EditText").find();
  for (var b = 0; b < boxes.length; b++) {
    if (isOnScreen(boxes[b])) { box = boxes[b]; break; }
  }
} catch (e) { }

if (!box || !box.setText(SEARCH_WORD)) {
  console.error("Could not type the search. Backing out.");
  back(); sleep(1000); back();
  exit();
}
sleep(1500);

var submit = findVisible([
  function () { return textMatches("(?i)^search$"); }
], 20);

if (!submit || !tapNode(submit)) {
  console.error("Could not send the search. Backing out.");
  back(); sleep(1000); back();
  exit();
}
sleep(3000);

var results = [];
try {
  var cards = descMatches("(?i)^video by .*").find();
  for (var c = 0; c < cards.length; c++) {
    if (isOnScreen(cards[c])) results.push(cards[c]);
  }
} catch (e) { }

if (results.length === 0) {
  console.error("No results on screen. Backing out.");
  back(); sleep(1000); back();
  exit();
}

console.log("Opening the first of " + results.length + " results");
if (!pressStrict(results[0]) && !tapNode(results[0])) {
  console.error("Could not open a result. Backing out.");
  back(); sleep(1000); back();
  exit();
}
sleep(3000);

// ---- what is here instead --------------------------------------------------

console.log("");
console.log("STEP 3 - what is on the screen we landed on");

var inResults = labelsOnScreen();
var resultList = listOf(inResults);
console.log("Found " + resultList.length + " short labels:");
for (var r = 0; r < resultList.length; r++) {
  console.log("  " + resultList[r].at + '%  "' + resultList[r].label + '"' +
              (resultList[r].clickable ? "  [press]" : ""));
}

// ---- the difference --------------------------------------------------------

console.log("");
console.log("=====================================");
console.log("ON THE FEED BUT NOT HERE - marker candidates");
console.log("=====================================");

var candidates = [];
for (var key in onFeed) {
  if (onFeed.hasOwnProperty(key) && !inResults.hasOwnProperty(key)) {
    candidates.push(onFeed[key]);
  }
}

if (candidates.length === 0) {
  console.error("Nothing tells the two screens apart by label alone.");
  console.error("We will need another way - report this back.");
} else {
  for (var d = 0; d < candidates.length; d++) {
    console.log("  " + candidates[d].at + '%  "' + candidates[d].label + '"');
  }
}

// ---- does going back bring them back? --------------------------------------

console.log("");
console.log("=====================================");
console.log("STEP 4 - pressing back until a candidate returns");

function aCandidateIsShowing() {
  var now = labelsOnScreen();
  for (var i = 0; i < candidates.length; i++) {
    if (now.hasOwnProperty(candidates[i].label)) return candidates[i].label;
  }
  return null;
}

var presses = 0;
var seen = aCandidateIsShowing();
while (!seen && presses < 8) {
  presses++;
  back();
  sleep(1300);
  seen = aCandidateIsShowing();
}

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");

if (seen) {
  console.log('Back on the feed after ' + presses + ' press(es).');
  console.log('The first candidate to reappear was "' + seen + '".');
  console.log("");
  console.log("That is the label to use as the feed marker.");
} else {
  console.error("No candidate came back after " + presses + " presses.");
  console.error("Either we are still lost, or the candidates are no good.");
}

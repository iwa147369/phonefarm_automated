/**
 * probe_search_result.js - which part of a search result opens the video?
 *
 * WHY THIS EXISTS
 *
 * `main.js` searches for a topic and then watches a few of the results, because
 * that is the strongest signal an account can send about what it cares about.
 * On the farm phones it searched, arrived, and reported "no results on screen"
 * while the results were plainly there.
 *
 * `probe_search.js` showed why. It reads the results screen on a Galaxy A8+
 * running the `com.zhiliaoapp.musically` build like this:
 *
 *     11%  FrameLayout [press]  "Videos" / "Sounds" / "LIVE" / "Hashtags"
 *     55%  Button [press]  "#coffee Iced Coffee Latte. 60 ml Coffee."
 *     58%  Button [press]  "ack_drink"
 *     60%  TextView        "Aug 30, 2025"
 *     59%  Button [press]  "x17.6K"
 *
 * There is no "Video by ..." anywhere, which is what `LABELS.search_result`
 * looks for - that was measured on a Xiaomi running the `trill` build, where
 * each result carries one long spoken description. Here a result is a cell made
 * of several separate buttons.
 *
 * So the label has to change. But knowing how to *recognise* a result is only
 * half of it: the script also has to press one, and a cell has several things
 * in it. Pressing the creator's name opens their profile, not the video. That
 * is not dangerous, but it is not browsing either - and the script would sit
 * there believing it was watching results.
 *
 * This probe presses one, and one only, and then reports what actually opened.
 *
 * WHAT IT PRESSES
 *
 * One kind of thing per run, chosen by TRY below. Change it and run it again.
 * Nothing else in the results screen is touched, and no result is ever liked,
 * followed or shared.
 *
 *   "views"    the play-count button, "x17.6K"     <- the default
 *   "caption"  the long caption button
 *   "creator"  the account name button
 *   "nothing"  press nothing at all, just list what is there
 *
 * HOW TO USE
 *
 *   1. Open TikTok and stop on the feed
 *   2. ./tools/run.sh probe_search_result.js <phone id>
 *   3. Switch back to TikTok within 5 seconds
 *
 * Read the VERDICT. Then set TRY to the next kind and run it again, so all
 * three are measured rather than the first plausible one being adopted.
 */

console.show();

/** Which part of a result to press. See the list above. */
var TRY = "views";

/** The word to search for. Anything harmless will do. */
var SEARCH_WORD = "coffee";

auto.waitFor();

var W = device.width;
var H = device.height;

console.log("");
console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("It will press ONE thing: the " + TRY + " part of one result.");
sleep(5000);

// ---------------------------------------------------------------- small helpers

function onScreen(node) {
  try {
    var b = node.bounds();
    return b.width() > 0 && b.height() > 0 &&
           b.centerY() >= 0 && b.centerY() < H;
  } catch (e) {
    return false;
  }
}

function labelOf(node) {
  try {
    var d = node.desc();
    if (d) return String(d);
  } catch (e) { /* keep going */ }
  try {
    var t = node.text();
    if (t) return String(t);
  } catch (e) { /* keep going */ }
  return "";
}

function whereOnScreen(node) {
  try {
    return Math.round(node.bounds().centerY() / H * 100) + "%";
  } catch (e) {
    return "?";
  }
}

/** Tap a node where it sits. Some TikTok buttons refuse a proper press. */
function tapNode(node) {
  try {
    var b = node.bounds();
    return click(b.centerX(), b.centerY());
  } catch (e) {
    return false;
  }
}

function everythingOnScreen() {
  var out = [];
  try {
    var found = className(/.*/).find();
    for (var i = 0; i < found.length; i++) {
      if (!onScreen(found[i])) continue;
      var label = labelOf(found[i]);
      if (!label) continue;
      out.push({ node: found[i], label: label });
    }
  } catch (e) { /* handled by the caller */ }
  return out;
}

// ---------------------------------------------------------------- searching

console.log("");
console.log("=====================================");
console.log("SEARCHING FOR \"" + SEARCH_WORD + "\"");
console.log("=====================================");

var searchButton = null;
var items = everythingOnScreen();
for (var i = 0; i < items.length; i++) {
  if (/^search$/i.test(items[i].label) && items[i].node.bounds().centerY() < H * 0.2) {
    searchButton = items[i].node;
    break;
  }
}

if (!searchButton) {
  console.error("No Search button near the top of the feed. Are we on the feed?");
  exit();
}

// A proper press is refused here on this build - measured by probe_search.js -
// so the tap goes to the button's own coordinates, which we read from it.
tapNode(searchButton);
sleep(2500);

var box = null;
try {
  var boxes = className("android.widget.EditText").find();
  for (var b = 0; b < boxes.length; b++) {
    if (onScreen(boxes[b])) { box = boxes[b]; break; }
  }
} catch (e) { /* reported below */ }

if (!box) {
  console.error("No search box appeared. Stopping without pressing anything.");
  exit();
}

var typed = false;
try { typed = box.setText(SEARCH_WORD); } catch (e) { /* reported below */ }
if (!typed) {
  console.error("Could not type into the box. Stopping.");
  exit();
}
sleep(1800);

// The button beside the box, tapped where it sits for the same reason.
var submit = null;
items = everythingOnScreen();
for (i = 0; i < items.length; i++) {
  if (/^search$/i.test(items[i].label) && items[i].node.bounds().centerY() < H * 0.2) {
    submit = items[i].node;
  }
}
if (submit) tapNode(submit);
sleep(4500);

// ---------------------------------------------------------------- what is there

console.log("");
console.log("=====================================");
console.log("WHAT A RESULT IS MADE OF");
console.log("=====================================");

/**
 * Sort what is on screen into the parts of a result.
 *
 * The tabs across the top ("Videos", "Sounds", "Hashtags") are not results and
 * pressing one would change the whole screen, so they are kept out by position:
 * everything above a fifth of the way down is chrome, not content.
 */
function sortResults() {
  var found = { views: [], caption: [], creator: [], other: [] };
  var all = everythingOnScreen();

  for (var i = 0; i < all.length; i++) {
    var label = all[i].label;
    var y;
    try { y = all[i].node.bounds().centerY(); } catch (e) { continue; }
    if (y < H * 0.2) continue;                       // the tabs and the search box

    var pressable = false;
    try { pressable = all[i].node.clickable(); } catch (e) { /* assume not */ }

    if (/^x[\d.,]+[KMB]?$/i.test(label)) {
      found.views.push(all[i]);
    } else if (/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(label)) {
      found.other.push(all[i]);                      // the date
    } else if (label.length > 25) {
      found.caption.push(all[i]);
    } else if (pressable) {
      found.creator.push(all[i]);
    } else {
      found.other.push(all[i]);
    }
  }
  return found;
}

var parts = sortResults();

function show(name, list) {
  console.log("");
  console.log("  " + name + " (" + list.length + ")");
  for (var i = 0; i < list.length && i < 6; i++) {
    var text = list[i].label;
    if (text.length > 46) text = text.substring(0, 46) + "...";
    console.log("    " + whereOnScreen(list[i].node) + "  \"" + text + "\"");
  }
}

show("play counts", parts.views);
show("captions", parts.caption);
show("account names", parts.creator);
show("everything else", parts.other);

if (parts.views.length === 0 && parts.caption.length === 0) {
  console.error("");
  console.error("Nothing here looks like a result. Either the search did not go");
  console.error("through, or this build lays the screen out differently again.");
  console.error("Nothing was pressed.");
  exit();
}

// ---------------------------------------------------------------- pressing one

if (TRY === "nothing") {
  console.log("");
  console.log("TRY is \"nothing\", so nothing was pressed. Set it and run again.");
  exit();
}

var chosen = null;
if (TRY === "views") chosen = parts.views[0];
else if (TRY === "caption") chosen = parts.caption[0];
else if (TRY === "creator") chosen = parts.creator[0];

if (!chosen) {
  console.warn("");
  console.warn("Nothing of kind \"" + TRY + "\" is on screen, so nothing was pressed.");
  exit();
}

console.log("");
console.log("=====================================");
console.log("PRESSING THE " + TRY.toUpperCase() + " OF THE FIRST RESULT");
console.log("=====================================");
console.log("  \"" + chosen.label + "\" at " + whereOnScreen(chosen.node));

var pressedProperly = false;
try { pressedProperly = chosen.node.clickable() && chosen.node.click(); } catch (e) { }
if (!pressedProperly) {
  console.log("  a proper press was refused, tapping where it sits instead");
  tapNode(chosen.node);
} else {
  console.log("  a proper press was accepted");
}

sleep(4000);

// ---------------------------------------------------------------- what opened

console.log("");
console.log("=====================================");
console.log("WHAT OPENED");
console.log("=====================================");

var after = everythingOnScreen();
var sawLike = false, sawTabs = false, sawFollow = false, sawForYou = false;

for (i = 0; i < after.length; i++) {
  var l = after[i].label;
  if (/^(un)?like\b/i.test(l)) sawLike = true;
  if (/^(sounds|hashtags|live)$/i.test(l)) sawTabs = true;
  if (/^follow\b/i.test(l)) sawFollow = true;
  if (/^for you$/i.test(l)) sawForYou = true;
}

console.log("  a Like button          : " + (sawLike ? "yes" : "no"));
console.log("  the results tabs still : " + (sawTabs ? "yes - we did not leave" : "no"));
console.log("  a Follow button        : " + (sawFollow ? "yes" : "no"));
console.log("  the feed marker For You: " + (sawForYou ? "yes" : "no"));

var opened = sawLike && !sawTabs;

// ---------------------------------------------------------------- getting back

console.log("");
console.log("=====================================");
console.log("GETTING BACK TO THE FEED");
console.log("=====================================");

var presses = 0;
for (var p = 0; p < 6; p++) {
  var here = everythingOnScreen();
  var home = false;
  for (i = 0; i < here.length; i++) {
    if (/^for you$/i.test(here[i].label)) { home = true; break; }
  }
  if (home) break;

  back();
  presses++;
  sleep(1500);
}

console.log("  back presses needed: " + presses);

var backHome = false;
var last = everythingOnScreen();
for (i = 0; i < last.length; i++) {
  if (/^for you$/i.test(last[i].label)) { backHome = true; break; }
}
console.log("  on the feed now    : " + (backHome ? "yes" : "NO - check the phone"));

// ---------------------------------------------------------------- verdict

console.log("");
console.log("=====================================");
console.log("VERDICT");
console.log("=====================================");

if (opened) {
  console.log("  Pressing the " + TRY + " opened a video.");
  console.log("");
  console.log("  So a result can be recognised by its " + TRY + " and opened by");
  console.log("  pressing it. That is what lib/labels.js should match, and it");
  console.log("  took " + presses + " back press(es) to return.");
} else if (sawTabs) {
  console.log("  Pressing the " + TRY + " did nothing - we are still on the");
  console.log("  results screen. Try another kind.");
} else if (sawFollow && !sawLike) {
  console.log("  That opened an account's page, not a video. Try another kind.");
} else {
  console.log("  Something opened, but it does not look like a video: no Like");
  console.log("  button, and the results tabs are gone. Look at the phone before");
  console.log("  trusting this.");
}

console.log("");
console.log("Nothing was liked, followed or shared.");

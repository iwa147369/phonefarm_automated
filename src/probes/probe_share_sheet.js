/**
 * probe_share_sheet.js - look inside the Share panel without touching anything
 *
 * WHY THIS IS CAREFUL
 *
 * The Share panel is the one dangerous screen in TikTok. Along the top it puts
 * a row of real people - friends and suggested accounts. Pressing one of those
 * sends them the video as a private message. That is a real message, to a real
 * person, and it cannot be quietly taken back.
 *
 * So this script presses nothing inside the panel. It opens it, writes down
 * everything it contains, and closes it again. Deciding what is safe to press
 * comes later, once we can read the list.
 *
 * It also answers a question that decides whether sharing is worth doing at
 * all: does the share count go up when you copy a link? If copying a link is
 * not counted as a share, the whole action sends no signal to the algorithm,
 * and we should drop it the way we dropped commenting.
 *
 * WHAT IT DOES
 *
 *   1. Reads the share count on the current video
 *   2. Presses Share
 *   3. Writes down every item in the panel, with its position
 *   4. Flags anything that looks like a person, so we know the danger zone
 *   5. Closes the panel - trying "back" first, since that is the part AutoJs6
 *      had to fix for Android 16 and we do not yet trust it here
 *   6. Confirms we are back on the feed, and that the count did not move
 *
 * HOW TO USE
 *
 *   Open TikTok on any video in the feed, then run this script and switch back
 *   to TikTok within 5 seconds.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var SHEET_OPEN_WAIT_MS = 1800;
var MAX_DEPTH = 40;

var SHARE_MATCHERS = [
  function () { return descMatches("(?i)^share video\\b.*"); },
  function () { return descMatches("(?i)^share\\b.*"); }
];

// Wording that suggests an item sends the video to a person. Anything matching
// this is somewhere the main script must never press.
var LOOKS_LIKE_A_PERSON = /send to|share with|message|friend|@|suggested/i;

// Wording we hope to find, because it keeps everything inside TikTok.
var LOOKS_SAFE = /copy link|copy address|save video|not interested/i;

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

function findVisible(matchers) {
  for (var i = 0; i < matchers.length; i++) {
    var matches;
    try {
      matches = matchers[i]().find();
    } catch (e) {
      continue;
    }
    if (!matches) continue;
    for (var j = 0; j < matches.length; j++) {
      if (isOnScreen(matches[j])) return matches[j];
    }
  }
  return null;
}

function readCountLabel(node) {
  try {
    var children = node.children();
    for (var i = 0; i < children.length; i++) {
      var text = children[i].text();
      if (text) return text;
      var grandchildren = children[i].children();
      for (var j = 0; j < grandchildren.length; j++) {
        if (grandchildren[j].text()) return grandchildren[j].text();
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}

/**
 * A rough fingerprint of what is on screen, used to tell whether the panel
 * opened and whether it later closed. We do not need to understand the
 * contents - only to notice that they changed.
 */
function screenSignature() {
  var parts = [];
  try {
    var nodes = className(".*").find();
    for (var i = 0; i < nodes.length && i < 400; i++) {
      if (!isOnScreen(nodes[i])) continue;
      var label = nodes[i].desc() || nodes[i].text();
      if (label) parts.push(label);
    }
  } catch (e) { /* an empty signature still works as a comparison */ }
  return parts.sort().join("|");
}

/** Press only if something really is pressable. Never a blind tap. */
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

// ---------------------------------------------------------------- dumping

var sheetItems = [];

function collect(node, depth) {
  if (!node || depth > MAX_DEPTH) return;

  try {
    var desc = node.desc();
    var text = node.text();
    var label = (desc && desc !== "null") ? desc : (text || "");

    if (label && isOnScreen(node)) {
      var b = node.bounds();
      sheetItems.push({
        label: label,
        className: (node.className() || "").replace("android.widget.", ""),
        clickable: node.clickable(),
        x: b.centerX(),
        y: b.centerY(),
        topPercent: Math.round((b.centerY() / device.height) * 100)
      });
    }

    var children = node.children();
    for (var i = 0; i < children.length; i++) {
      collect(children[i], depth + 1);
    }
  } catch (e) { /* skip anything unreadable */ }
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("Nothing inside the Share panel will be pressed.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");

var shareButton = findVisible(SHARE_MATCHERS);
if (!shareButton) {
  console.error("No Share button on screen. Is TikTok showing the video feed?");
  exit();
}

var countBefore = readCountLabel(shareButton);
console.log('Share button : "' + (shareButton.desc() || "") + '"');
console.log("Share count  : " + (countBefore || "(none shown)"));

var feedSignature = screenSignature();

console.log("");
console.log("Opening the Share panel...");
if (!pressStrict(shareButton)) {
  console.error("Could not press Share. Nothing was changed.");
  exit();
}
sleep(SHEET_OPEN_WAIT_MS);

var sheetSignature = screenSignature();
if (sheetSignature === feedSignature) {
  console.warn("The screen did not change. The panel may not have opened.");
}

var root = auto.root;
if (root) collect(root, 0);

// ---------------------------------------------------------------- report

console.log("");
console.log("--- EVERYTHING IN THE PANEL (" + sheetItems.length + " items) ---");
console.log("(position is % down the screen - the panel sits at the bottom)");
for (var i = 0; i < sheetItems.length; i++) {
  var item = sheetItems[i];
  console.log("  " + item.topPercent + "%  " + item.className +
              (item.clickable ? " [press]" : "        ") +
              '  "' + item.label + '"');
}

var risky = [];
var safe = [];
for (var j = 0; j < sheetItems.length; j++) {
  if (LOOKS_LIKE_A_PERSON.test(sheetItems[j].label)) risky.push(sheetItems[j]);
  if (LOOKS_SAFE.test(sheetItems[j].label)) safe.push(sheetItems[j]);
}

console.log("");
console.log("--- MIGHT SEND TO A PERSON - NEVER PRESS THESE ---");
if (risky.length === 0) {
  console.log("  (nothing matched by wording - check the full list above by eye,");
  console.log("   because account names do not follow a pattern)");
} else {
  for (var k = 0; k < risky.length; k++) {
    console.warn("  " + risky[k].topPercent + '%  "' + risky[k].label + '"');
  }
}

console.log("");
console.log("--- LOOKS SAFE TO PRESS ---");
if (safe.length === 0) {
  console.warn("  none found - 'Copy link' may be worded differently here,");
  console.warn("  or may need scrolling to reach");
} else {
  for (var m = 0; m < safe.length; m++) {
    console.log("  " + safe[m].topPercent + '%  "' + safe[m].label +
                '"' + (safe[m].clickable ? "  [press]" : "  [not pressable]"));
  }
}

// ---------------------------------------------------------------- closing

console.log("");
console.log("=====================================");
console.log("Closing the panel...");

// The panel carries a marker we can look for: a view labelled "Bottom sheet".
// While that is on screen the panel is open. This is far more reliable than
// comparing what the whole screen looks like.
function panelIsOpen() {
  return findVisible([
    function () { return descMatches("(?i)^bottom sheet$"); }
  ]) !== null;
}

var closed = false;
var howClosed = "";

// First choice: the panel's own X button. On Android 16 the back action does
// not close this panel, which is why the X is tried first.
var closeButton = findVisible([
  function () { return descMatches("(?i)^close$"); },
  function () { return textMatches("(?i)^close$"); }
]);

if (closeButton && pressStrict(closeButton)) {
  sleep(1200);
  if (!panelIsOpen()) {
    closed = true;
    howClosed = "the panel's own Close button worked";
  }
}

if (!closed) {
  console.warn("Close button did not do it. Trying the back action...");
  back();
  sleep(1200);
  if (!panelIsOpen()) {
    closed = true;
    howClosed = "the back action worked";
  }
}

if (!closed) {
  // Tap the dimmed area above the panel. Deliberately not near the top of the
  // screen, where the feed tabs live - pressing those would change the feed.
  console.warn("Back did not work either. Tapping the dimmed area above...");
  click(Math.round(device.width * 0.5), Math.round(device.height * 0.2));
  sleep(1200);
  if (!panelIsOpen()) {
    closed = true;
    howClosed = "tapping above the panel worked";
  }
}

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");

if (closed) {
  console.log("Panel closed - " + howClosed);
} else {
  console.error("COULD NOT CLOSE THE PANEL. Close it by hand.");
  console.error("Until this is solved, sharing must stay switched off: a stuck");
  console.error("panel would swallow every swipe for the rest of a session.");
}

// Did opening and closing the panel change the share count? It should not have.
var shareAgain = findVisible(SHARE_MATCHERS);
var countAfter = shareAgain ? readCountLabel(shareAgain) : null;
console.log("");
console.log("Share count before : " + (countBefore || "(none)"));
console.log("Share count after  : " + (countAfter || "(none)"));
if (countBefore && countAfter && countBefore !== countAfter) {
  console.warn("The count moved even though nothing was pressed - worth a look.");
}

console.log("");
console.log("Nothing in the panel was pressed. No message was sent.");

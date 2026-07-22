/**
 * probe_comment_panel.js - look inside the Comments panel without touching it
 *
 * WHY THIS IS CAREFUL
 *
 * Opening comments to see what people are saying is normal behaviour, and
 * worth copying. But the comments panel is the most dangerous screen in the
 * app for us:
 *
 *   - It has a text box and a send button. We deliberately decided never to
 *     comment. One stray tap could undo that decision.
 *   - Every comment has its own heart. A stray tap there likes a stranger's
 *     comment, in public, under our account's name.
 *
 * So inside this panel the rule is: scroll, never tap. This script presses
 * nothing at all. It opens the panel, writes down what is in it and where, and
 * closes it again.
 *
 * WHAT WE NEED TO LEARN
 *
 *   1. Does this panel use the same "Bottom sheet" marker as the Share panel?
 *      If so, the existing open/closed check works here too.
 *   2. How does it close? The Share panel ignores the back action on Android
 *      16 and needs its own Close button. This one may differ.
 *   3. Where is the text box, and where are the comment hearts? We need a
 *      band of screen that is safe to swipe through, well away from both.
 *
 * HOW TO USE
 *
 *   Open TikTok on any video in the feed, then run this script and switch back
 *   to TikTok within 5 seconds.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var PANEL_OPEN_WAIT_MS = 2000;
var MAX_DEPTH = 40;

var COMMENT_MATCHERS = [
  function () { return descMatches("(?i)^read or add comments\\b.*"); },
  function () { return descMatches("(?i).*\\bcomments?\\b.*"); }
];

// Anything matching these must never be touched by the main script.
var LOOKS_LIKE_TYPING = /add comment|write|say something|reply|post|send|emoji|@ ?mention/i;
var LOOKS_LIKE_A_HEART = /^like$|^unlike$|like comment|likes? this/i;

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

function panelIsOpen() {
  return findVisible([
    function () { return descMatches("(?i)^bottom sheet$"); }
  ]) !== null;
}

// ---------------------------------------------------------------- dumping

var items = [];

function collect(node, depth) {
  if (!node || depth > MAX_DEPTH) return;

  try {
    var desc = node.desc();
    var text = node.text();
    var label = (desc && desc !== "null") ? desc : (text || "");

    if (isOnScreen(node)) {
      var b = node.bounds();
      var editable = false;
      try { editable = node.editable(); } catch (e) { /* older builds */ }

      if (label || editable) {
        items.push({
          label: label || "(no label)",
          className: (node.className() || "").replace("android.widget.", ""),
          clickable: node.clickable(),
          editable: editable,
          scrollable: node.scrollable(),
          topPercent: Math.round((b.top / device.height) * 100),
          bottomPercent: Math.round((b.bottom / device.height) * 100),
          yPercent: Math.round((b.centerY() / device.height) * 100)
        });
      }
    }

    var children = node.children();
    for (var i = 0; i < children.length; i++) {
      collect(children[i], depth + 1);
    }
  } catch (e) { /* skip anything unreadable */ }
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("Nothing inside the Comments panel will be pressed.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");

var commentButton = findVisible(COMMENT_MATCHERS);
if (!commentButton) {
  console.error("No Comments button on screen. Is TikTok showing the feed?");
  exit();
}

console.log('Comments button : "' + (commentButton.desc() || "") + '"');

console.log("");
console.log("Opening the Comments panel...");
if (!pressStrict(commentButton)) {
  console.error("Could not press it. Nothing was changed.");
  exit();
}
sleep(PANEL_OPEN_WAIT_MS);

console.log("Uses the same \"Bottom sheet\" marker as the Share panel : " +
            (panelIsOpen() ? "YES" : "NO"));

var root = auto.root;
if (root) collect(root, 0);

// ---------------------------------------------------------------- report

console.log("");
console.log("--- EVERYTHING IN THE PANEL (" + items.length + " items) ---");
console.log("(position is % down the screen)");
for (var i = 0; i < items.length; i++) {
  var it = items[i];
  var flags = "";
  if (it.clickable) flags += " [press]";
  if (it.editable) flags += " [TYPING]";
  if (it.scrollable) flags += " [scrolls]";
  console.log("  " + it.yPercent + "%  " + it.className + flags +
              '  "' + it.label + '"');
}

var typing = [];
var hearts = [];
var scrollers = [];
for (var j = 0; j < items.length; j++) {
  if (items[j].editable || LOOKS_LIKE_TYPING.test(items[j].label)) {
    typing.push(items[j]);
  }
  if (LOOKS_LIKE_A_HEART.test(items[j].label)) hearts.push(items[j]);
  if (items[j].scrollable) scrollers.push(items[j]);
}

console.log("");
console.log("--- TEXT BOX AND SEND - NEVER GO NEAR THESE ---");
if (typing.length === 0) {
  console.log("  (none matched - check the list above by eye)");
} else {
  for (var k = 0; k < typing.length; k++) {
    console.warn("  " + typing[k].yPercent + '%  "' + typing[k].label + '"');
  }
}

console.log("");
console.log("--- COMMENT HEARTS - NEVER PRESS ---");
if (hearts.length === 0) {
  console.log("  (none matched by wording - they may carry no label at all,");
  console.log("   which is another reason to never tap inside this panel)");
} else {
  for (var m = 0; m < hearts.length; m++) {
    console.warn("  " + hearts[m].yPercent + '%  "' + hearts[m].label + '"');
  }
}

console.log("");
console.log("--- THE SCROLLING LIST ---");
if (scrollers.length === 0) {
  console.warn("  nothing reports itself as scrollable - we will have to swipe");
  console.warn("  inside the panel by position instead");
} else {
  for (var n = 0; n < scrollers.length; n++) {
    console.log("  covers " + scrollers[n].topPercent + "% to " +
                scrollers[n].bottomPercent + "% of the screen  " +
                scrollers[n].className);
  }
}

// Work out a band that is safe to swipe through: inside the list, and clear of
// anything that types.
var safeTop = null, safeBottom = null;
if (scrollers.length > 0) {
  safeTop = scrollers[0].topPercent;
  safeBottom = scrollers[0].bottomPercent;
  for (var p = 0; p < typing.length; p++) {
    if (typing[p].yPercent < safeBottom && typing[p].yPercent > safeTop) {
      safeBottom = typing[p].yPercent - 5;
    }
  }
  console.log("");
  console.log("Suggested safe band to swipe in: " + safeTop + "% to " +
              safeBottom + "% down the screen");
}

// ---------------------------------------------------------------- closing

console.log("");
console.log("=====================================");
console.log("Closing the panel...");

var closed = false;
var howClosed = "";

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
  console.warn("No Close button, or it did nothing. Trying the back action...");
  back();
  sleep(1200);
  if (!panelIsOpen()) {
    closed = true;
    howClosed = "the back action worked";
  }
}

if (!closed) {
  console.warn("Back did not work either. Tapping the dimmed area above...");
  click(Math.round(device.width * 0.5), Math.round(device.height * 0.1));
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
  console.error("Until this is solved, opening comments must stay switched off.");
}

console.log("");
console.log("Nothing in the panel was pressed. Nothing was typed or liked.");

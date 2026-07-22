/**
 * probe_share_select.js - pick one person in the Share panel, then stop
 *
 * WHAT IS LEFT TO FIND OUT
 *
 * Sharing a video to one of our own accounts is what would put something in
 * their inbox for the reply feature to answer. Everything about that flow is
 * now known except the last step:
 *
 *   - the people row carries real names, so we match by name, never position
 *   - all of them are Buttons that accept a proper press
 *   - the panel's own Search refuses to be pressed, and we do not need it
 *
 * Missing: what the send button is called, and how the panel changes once
 * somebody is chosen. That only appears after choosing somebody, so this
 * chooses somebody - and then stops.
 *
 * WHY CHOOSING IS SAFE AND SENDING IS NOT
 *
 * Choosing a person is reported to select them, not send to them; the send is
 * a second press. This probe makes the first press and not the second.
 *
 * If that turns out to be wrong, the video goes to Watch Narrative, which is
 * our own account. That is the reason the target is fixed in the file below
 * rather than taken from whatever happens to be first in the row. A wrong
 * guess should land somewhere it does no harm.
 *
 * WHAT IT WILL NOT PRESS
 *
 * Anything called Send, Repost, Not interested, Report, Promote, Download or
 * Add to Story. Those are matched and marked in the log instead. The people
 * row and the row of app icons sit 8% of the screen apart, about 220 pixels,
 * which is why nothing here is ever pressed by position.
 *
 * HOW TO USE
 *
 *   Open TikTok on any video in the feed. Run this and switch back within 5
 *   seconds. Afterwards, open the conversation with Watch Narrative and check
 *   that no video arrived - that is the real proof, and it is done by eye.
 */

// ---------------------------------------------------------------- settings

/** The only name this script will select. Our own account. */
var SHARE_TO = "Watch Narrative";

var DELAY_BEFORE_START_MS = 5000;
var PANEL_OPEN_WAIT_MS = 2500;
var AFTER_SELECT_MS = 2000;
var MAX_DEPTH = 45;

var PEOPLE_BAND = [72, 86];
var NEVER_PRESS = /^send$|^send to$|^repost$|^not interested$|^report$|^promote$|^download$|^add to story$|^cast$/i;

auto.waitFor();
console.show();

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

function labelOf(node) {
  try {
    var desc = node.desc();
    var text = node.text();
    if (desc && desc !== "null") return desc;
    return text || "";
  } catch (e) {
    return "";
  }
}

/** Strip the invisible marks TikTok puts around names, then compare loosely. */
function tidyName(name) {
  if (!name) return "";
  return String(name)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function snapshot() {
  var items = [];

  function walk(node, depth) {
    if (!node || depth > MAX_DEPTH) return;
    try {
      if (isOnScreen(node)) {
        var b = node.bounds();
        items.push({
          node: node,
          label: labelOf(node),
          className: (node.className() || "").replace("android.widget.", "")
                                             .replace("android.view.", ""),
          clickable: node.clickable(),
          selected: node.selected(),
          x: Math.round((b.centerX() / device.width) * 100),
          y: Math.round((b.centerY() / device.height) * 100)
        });
      }
      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip anything unreadable */ }
  }

  try { walk(auto.root, 0); } catch (e) { /* no tree */ }
  return items;
}

function findVisible(matchers) {
  for (var i = 0; i < matchers.length; i++) {
    var found;
    try { found = matchers[i]().find(); } catch (e) { continue; }
    if (!found) continue;
    for (var j = 0; j < found.length; j++) {
      if (isOnScreen(found[j])) return found[j];
    }
  }
  return null;
}

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
  return findVisible([function () { return descMatches("(?i)^bottom sheet$"); }]) !== null;
}

function closePanel() {
  var close = findVisible([
    function () { return descMatches("(?i)^close$"); },
    function () { return textMatches("(?i)^close$"); }
  ]);
  if (close && pressStrict(close)) {
    sleep(1400);
    if (!panelIsOpen()) return true;
  }
  back();
  sleep(1400);
  return !panelIsOpen();
}

function describe(items) {
  var out = {};
  for (var i = 0; i < items.length; i++) {
    var key = items[i].label + "@" + items[i].x + "," + items[i].y;
    out[key] = items[i];
  }
  return out;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log('Will select "' + SHARE_TO + '" and then stop. Nothing is sent.');
sleep(DELAY_BEFORE_START_MS);

var shareButton = findVisible([
  function () { return descMatches("(?i)^share video\\b.*"); },
  function () { return descMatches("(?i)^share\\b.*"); }
]);
if (!shareButton) {
  console.error("No Share button. Is TikTok showing a video?");
  exit();
}

console.log("");
console.log("Opening the Share panel...");
if (!pressStrict(shareButton)) {
  console.error("Could not press Share. Nothing was changed.");
  exit();
}
sleep(PANEL_OPEN_WAIT_MS);

if (!panelIsOpen()) {
  console.error("The panel did not open.");
  exit();
}

// -------------------------------------------------- find the one we may press

var before = snapshot();
var wanted = tidyName(SHARE_TO);
var target = null;

for (var i = 0; i < before.length; i++) {
  var it = before[i];
  if (it.y < PEOPLE_BAND[0] || it.y > PEOPLE_BAND[1]) continue;
  if (it.className !== "Button") continue;          // skips the panel container
  if (!it.clickable) continue;
  if (NEVER_PRESS.test(it.label)) continue;
  if (tidyName(it.label) !== wanted) continue;      // exact name, nothing less
  target = it;
  break;
}

console.log("");
console.log("=====================================");
if (!target) {
  console.error('"' + SHARE_TO + '" is not in the row on this video.');
  console.error("Nothing was pressed. Closing again.");
  closePanel();
  exit();
}

console.log('Found "' + target.label + '" at ' + target.x + "%," + target.y + "%");
console.log("  selected before pressing: " + target.selected);

// -------------------------------------------------- the one press

console.log("");
console.log("Selecting it. This should NOT send.");
if (!pressStrict(target.node)) {
  console.error("It refused a proper press. Nothing was changed.");
  closePanel();
  exit();
}
sleep(AFTER_SELECT_MS);

var after = snapshot();

// -------------------------------------------------- what changed

var was = describe(before);
var fresh = [];
for (var j = 0; j < after.length; j++) {
  var key = after[j].label + "@" + after[j].x + "," + after[j].y;
  if (!was[key] && after[j].label) fresh.push(after[j]);
}

console.log("");
console.log("=====================================");
console.log("WHAT APPEARED AFTER SELECTING");
console.log("=====================================");
if (fresh.length === 0) {
  console.warn("  Nothing new. Either the press did not register, or the panel");
  console.warn("  shows the change somewhere we cannot read.");
} else {
  for (var k = 0; k < fresh.length; k++) {
    var f = fresh[k];
    var flag = NEVER_PRESS.test(f.label) ? "  <-- DO NOT PRESS" : "";
    console.log("  " + f.y + "%  " + f.className +
                (f.clickable ? " [press]" : "") +
                (f.selected ? " [selected]" : "") +
                '  "' + f.label + '"' + flag);
  }
}

// Did the person we chose come back marked as chosen? That is how the real
// script would confirm it picked the right one before pressing send.
console.log("");
console.log("--- IS OUR CHOICE MARKED AS CHOSEN? ---");
var markedFound = false;
for (var m = 0; m < after.length; m++) {
  if (tidyName(after[m].label) === wanted && after[m].className === "Button") {
    console.log('  "' + after[m].label + '" at ' + after[m].x + "%  selected=" +
                after[m].selected);
    markedFound = true;
  }
}
if (!markedFound) {
  console.warn("  It is no longer in the row. The panel may have changed shape.");
}

// -------------------------------------------------- the send button

console.log("");
console.log("--- WHAT WOULD SEND IT ---");
var sendish = [];
for (var s = 0; s < after.length; s++) {
  if (/send|share now|^post$/i.test(after[s].label)) sendish.push(after[s]);
}
if (sendish.length === 0) {
  console.warn("  Nothing that looks like a send button.");
  console.warn("  If the video has already gone, this is why. Check the");
  console.warn("  conversation by hand.");
} else {
  for (var t = 0; t < sendish.length; t++) {
    console.log("  " + sendish[t].y + "%  " + sendish[t].className +
                (sendish[t].clickable ? " [press]" : "") +
                '  "' + sendish[t].label + '"');
  }
  console.log("");
  console.log("  That is the button the real script would press, and the one");
  console.log("  this probe is deliberately leaving alone.");
}

// -------------------------------------------------- leave without sending

console.log("");
console.log("=====================================");
console.log("Closing WITHOUT sending...");

var shut = closePanel();
if (!shut) {
  back();
  sleep(1200);
  shut = closePanel();
}

console.log("");
if (shut) {
  console.log("Panel closed. No send button was pressed.");
} else {
  console.error("THE PANEL IS STILL OPEN. Close it by hand, and do not press");
  console.error("anything inside it.");
}

console.log("");
console.log("NOW CHECK BY EYE: open the conversation with " + SHARE_TO + ".");
console.log("If a video arrived, then selecting sends after all, and that");
console.log("changes how the real flow has to be built.");

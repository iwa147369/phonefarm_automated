/**
 * probe_send_reaction.js - send ONE sticker from the quick-send bar, properly
 *
 * THIS ONE REALLY DOES SEND SOMETHING
 *
 * Every other probe reads. This one presses a button that puts a sticker in
 * someone's inbox, and that cannot be taken back. It is the last thing we do
 * not know: a blind tap sends, by accident - but does a proper press send?
 *
 * WHAT WENT WRONG LAST TIME, AND WHAT STOPS IT HERE
 *
 * probe_messages.js sent two stickers nobody asked for. It picked its target
 * by position ("anything above the message box is a message"), caught a
 * button instead, and when that button refused a real press it fell back to
 * holding a screen position for 700ms. Three guards come from that:
 *
 *   1. THERE IS NO COORDINATE FALLBACK. If the proper press does not work,
 *      this script stops and says so. It never holds a position. If the
 *      button cannot be pressed the honest answer is that this route is dead,
 *      not that we should tap harder.
 *
 *   2. IT ONLY RUNS IN ONE NAMED CONVERSATION. Set ONLY_IN_CONVERSATION
 *      below. If the name in the header does not match, it refuses. Opening
 *      the wrong chat by mistake is now harmless.
 *
 *   3. IT CHECKS THE SCREEN IS THE ONE IT EXPECTS before pressing anything -
 *      the message box empty and in its usual place, the bar fully present,
 *      the target still where it was a moment ago.
 *
 * WHAT IT PROVES
 *
 * A sent sticker shows up in the conversation as an element labelled
 * "Stickers". The script counts those before and after. Exactly one more
 * means the press worked and did it once. Two more would mean it fired twice,
 * which we need to know about just as much.
 *
 * HOW TO USE
 *
 *   Open the conversation named below, BY HAND. Do not tap the message box -
 *   that hides the bar. Run this and switch back within 5 seconds.
 */

// ---------------------------------------------------------------- settings

/** The only conversation this script is allowed to touch. */
var ONLY_IN_CONVERSATION = "Watch Narrative";

/**
 * The three we understand. Effects and Cards are left out because nobody has
 * checked what they open - they may well be panels rather than sends.
 */
var SAFE_REACTIONS = ["Heart", "Lol", "ThumbsUp"];

var DELAY_BEFORE_START_MS = 5000;
var AFTER_PRESS_MS = 2500;
var MOVE_TOLERANCE_PERCENT = 5;
var PARENT_LEVELS = 3;

// Where the message box sits when the bar is up. If it is anywhere else the
// keyboard is open, or a panel is, and we are not in the state we tested.
var EXPECTED_BOX_Y = 97;
var BOX_Y_TOLERANCE = 6;

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

function snapshot() {
  var items = [];

  function walk(node, depth) {
    if (!node || depth > 45) return;
    try {
      if (isOnScreen(node)) {
        var b = node.bounds();
        var editable = false;
        try { editable = node.editable(); } catch (e) { /* older builds */ }
        items.push({
          node: node,
          label: labelOf(node),
          editable: editable,
          x: Math.round((b.centerX() / device.width) * 100),
          y: Math.round((b.centerY() / device.height) * 100)
        });
      }
      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip anything unreadable */ }
  }

  walk(auto.root, 0);
  return items;
}

function findByLabel(items, label) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].label === label) return items[i];
  }
  return null;
}

function countStickers(items) {
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].label === "Stickers") n++;
  }
  return n;
}

/**
 * Press a node the way main.js does: the node itself if it is clickable,
 * otherwise a parent within reach. There is no third option on purpose.
 */
function pressProperly(node) {
  var target = node;
  for (var level = 0; level < PARENT_LEVELS && target; level++) {
    try {
      if (target.clickable()) {
        return target.click() ? level : -1;
      }
      target = target.parent();
    } catch (e) {
      return -1;
    }
  }
  return -1;
}

function stop(why) {
  console.error("");
  console.error("STOPPED: " + why);
  console.error("Nothing was sent.");
  exit();
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("This one WILL send a sticker, if every check passes.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");
console.log("CHECKS BEFORE ANYTHING IS PRESSED");
console.log("=====================================");

var before = snapshot();
if (before.length === 0) stop("nothing readable on screen.");

// --- are we in a conversation at all?
var box = null;
for (var i = 0; i < before.length; i++) {
  if (before[i].editable) { box = before[i]; break; }
}
if (!box) stop("no message box, so this is not a conversation.");

// --- is it the one we are allowed to touch?
var header = null;
for (var j = 0; j < before.length; j++) {
  if (before[j].y <= 12 && before[j].label === ONLY_IN_CONVERSATION) {
    header = before[j];
    break;
  }
}
if (!header) {
  stop('this is not "' + ONLY_IN_CONVERSATION + '". ' +
       "Only that conversation is allowed.");
}
console.log('  conversation  : "' + ONLY_IN_CONVERSATION + '"  OK');

// --- is the box empty and where we expect?
if (box.label !== "Message...") {
  stop('the message box says "' + box.label + '" instead of "Message...". ' +
       "Something has been typed.");
}
if (Math.abs(box.y - EXPECTED_BOX_Y) > BOX_Y_TOLERANCE) {
  stop("the message box is at " + box.y + "%, expected about " +
       EXPECTED_BOX_Y + "%. The keyboard or a panel is probably open - " +
       "close it, then run this again.");
}
console.log("  message box   : empty, at " + box.y + "%  OK");

// --- is the whole bar there?
var barLabels = ["Heart", "Lol", "ThumbsUp", "Effects", "Cards"];
var missing = [];
for (var k = 0; k < barLabels.length; k++) {
  if (!findByLabel(before, barLabels[k])) missing.push(barLabels[k]);
}
if (missing.length > 0) {
  stop("the quick-send bar is incomplete - missing " + missing.join(", ") +
       ". Do not tap the message box; that hides the bar.");
}
console.log("  quick-send bar: all 5 present  OK");

var stickersBefore = countStickers(before);
console.log("  stickers now  : " + stickersBefore);

// --- pick one
var choice = SAFE_REACTIONS[Math.floor(Math.random() * SAFE_REACTIONS.length)];
var target = findByLabel(before, choice);
if (!target) stop('"' + choice + '" vanished between checks.');
console.log("");
console.log('  picked at random: "' + choice + '" at ' +
            target.x + "%," + target.y + "%");

// --- read it again. The sticker pack strip changed between two runs 100
//     seconds apart, so nothing on this screen is assumed to hold still.
sleep(600);
var recheck = snapshot();
var again = findByLabel(recheck, choice);
if (!again) stop('"' + choice + '" is no longer on screen.');
if (Math.abs(again.x - target.x) > MOVE_TOLERANCE_PERCENT ||
    Math.abs(again.y - target.y) > MOVE_TOLERANCE_PERCENT) {
  stop('"' + choice + '" moved from ' + target.x + "%," + target.y +
       "% to " + again.x + "%," + again.y + "%. The screen is not settled.");
}
console.log("  still in place after a second look  OK");

// ---------------------------------------------------------------- the send

console.log("");
console.log("=====================================");
console.log('SENDING "' + choice + '"');
console.log("=====================================");

var level = pressProperly(again.node);

if (level < 0) {
  console.error("");
  console.error("The proper press did not work.");
  console.error("");
  console.error("There is no fallback here, and that is deliberate. Holding a");
  console.error("screen position is what sent two stickers by accident. If a");
  console.error("real press cannot work this route is not usable, and tapping");
  console.error("harder would only hide that.");
  exit();
}

console.log("  pressed " + (level === 0 ? "the button itself" :
            level + " level(s) up the tree"));

sleep(AFTER_PRESS_MS);

// ---------------------------------------------------------------- did it work

var after = snapshot();
var stickersAfter = countStickers(after);

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");
console.log("  stickers before : " + stickersBefore);
console.log("  stickers after  : " + stickersAfter);

var added = stickersAfter - stickersBefore;

if (added === 1) {
  console.log("");
  console.log("  WORKED, exactly once.");
  console.log("  A proper press sends. No position was tapped at any point,");
  console.log("  so this works the same on any screen size.");
} else if (added === 0) {
  console.warn("");
  console.warn("  The press went through but no sticker appeared.");
  console.warn("  Either it opened something instead, or the send is still in");
  console.warn("  flight. Look at the phone before running this again.");
} else if (added > 1) {
  console.error("");
  console.error("  " + added + " stickers appeared from ONE press.");
  console.error("  The press is firing more than once. Do not build on this");
  console.error("  until that is understood.");
} else {
  console.error("");
  console.error("  The count went DOWN. The screen is not what we think it is.");
}

// The message box must be untouched. If a sticker press can put text in it,
// that changes what a stray press costs.
var boxAfter = null;
for (var m = 0; m < after.length; m++) {
  if (after[m].editable) { boxAfter = after[m]; break; }
}
console.log("");
if (!boxAfter) {
  console.warn("  The message box is gone - the screen changed unexpectedly.");
} else if (boxAfter.label !== "Message...") {
  console.error('  The message box now says "' + boxAfter.label + '".');
  console.error("  Clear it by hand.");
} else {
  console.log("  Message box still empty. Nothing was typed.");
}

console.log("");
console.log("Sent to: " + ONLY_IN_CONVERSATION);

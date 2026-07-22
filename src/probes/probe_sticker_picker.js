/**
 * probe_sticker_picker.js - open the sticker picker and measure how hard it is
 *
 * WHY THIS EXISTS
 *
 * The reaction route is already proven: hold a message, seven labelled emoji
 * buttons appear, tap one. Before settling on it we want to know what the
 * sticker route would actually cost, rather than assuming it is worse.
 *
 * THE RULE HERE IS STRICTER THAN ANY PROBE SO FAR
 *
 * In the comments panel a stray tap likes a stranger's comment. Here a stray
 * tap almost certainly SENDS a sticker to whoever this conversation is with,
 * with no confirmation step, and it cannot be taken back.
 *
 * So: this script presses exactly one thing - the button that opens the
 * picker. Inside the picker it presses nothing at all. It does not tap to
 * dismiss, either, because a tap that misses the empty area lands on a
 * sticker. If the back action will not close it, the script stops and asks you
 * to close it by hand.
 *
 * WHAT WE NEED TO LEARN
 *
 *   1. Do the stickers carry labels we can match, or is it a grid of pictures
 *      with nothing to match on? This decides everything. Unlabelled means
 *      tapping by position, and position does not survive the move from this
 *      Xiaomi to the Samsung farm phones with different screens.
 *   2. Is there a tab strip (Stickers / GIFs / Emojis)? Each tab is another
 *      screen to handle.
 *   3. Does the grid scroll? A scrolling grid means the same position shows a
 *      different sticker depending on where it happens to be scrolled.
 *   4. Is there a Send button, or does a tap send immediately? We cannot test
 *      this without sending, but a visible Send button would tell us.
 *
 * HOW TO USE
 *
 *   Open, BY HAND, a conversation with one of your own farm accounts. Run this
 *   script and switch back to TikTok within 5 seconds.
 *
 *   Use your own account, not a real person. If something goes wrong despite
 *   the care above, it should go wrong at an account you control.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var PICKER_OPEN_WAIT_MS = 2500;
var MAX_DEPTH = 45;

var STICKER_BUTTON = [
  function () { return descMatches("(?i)^open stickers, ?gifs and emojis$"); },
  function () { return descMatches("(?i).*\\bstickers?\\b.*"); }
];

var LOOKS_LIKE_SENDING = /^send$|send message/i;
var LOOKS_LIKE_A_TAB = /^(stickers?|gifs?|emojis?|emoticons?|recent|favou?rites|memes?)$/i;

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

function collect(root) {
  var items = [];

  function walk(node, depth) {
    if (!node || depth > MAX_DEPTH) return;
    try {
      if (isOnScreen(node)) {
        var label = labelOf(node);
        var b = node.bounds();
        var editable = false;
        try { editable = node.editable(); } catch (e) { /* older builds */ }

        items.push({
          label: label,
          className: (node.className() || "").replace("android.widget.", ""),
          clickable: node.clickable(),
          editable: editable,
          scrollable: node.scrollable(),
          xPercent: Math.round((b.centerX() / device.width) * 100),
          yPercent: Math.round((b.centerY() / device.height) * 100),
          topPercent: Math.round((b.top / device.height) * 100),
          bottomPercent: Math.round((b.bottom / device.height) * 100),
          widthPercent: Math.round((b.width() / device.width) * 100)
        });
      }
      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip anything unreadable */ }
  }

  walk(root, 0);
  return items;
}

function composerText(items) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].editable) return items[i].label;
  }
  return null;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("Only the picker button will be pressed. Nothing inside it.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");

var before = collect(auto.root);
if (before.length === 0) {
  console.error("Nothing readable on screen. Is TikTok in front?");
  exit();
}

var textBefore = composerText(before);
if (textBefore === null) {
  console.error("No message box on screen, so this is not a conversation.");
  console.error("Open a conversation with your own account first.");
  exit();
}
console.log('Message box says: "' + textBefore + '"');

var button = findVisible(STICKER_BUTTON);
if (!button) {
  console.error("No sticker button found. Nothing was pressed.");
  exit();
}
console.log('Sticker button   : "' + labelOf(button) + '"');

console.log("");
console.log("Opening the picker...");
if (!pressStrict(button)) {
  console.error("Could not press it. Nothing was changed.");
  exit();
}
sleep(PICKER_OPEN_WAIT_MS);

var after = collect(auto.root);

console.log("Items on screen: " + before.length + " before, " + after.length + " after.");
if (after.length <= before.length + 3) {
  console.warn("Almost nothing changed. The picker may not have opened.");
}

// ---------------------------------------------------------------- what is in it

// Anything that was not there before belongs to the picker.
var wasThere = {};
for (var i = 0; i < before.length; i++) {
  wasThere[before[i].label + "@" + before[i].yPercent + "," + before[i].xPercent] = true;
}
var fresh = [];
for (var j = 0; j < after.length; j++) {
  var key = after[j].label + "@" + after[j].yPercent + "," + after[j].xPercent;
  if (!wasThere[key]) fresh.push(after[j]);
}

console.log("");
console.log("--- WHAT THE PICKER ADDED (" + fresh.length + " items) ---");
console.log("(position is % down the screen)");
for (var k = 0; k < fresh.length; k++) {
  var it = fresh[k];
  var flags = "";
  if (it.clickable) flags += " [press]";
  if (it.scrollable) flags += " [scrolls]";
  if (it.editable) flags += " [TYPING]";
  console.log("  " + it.yPercent + "%  " + it.className + flags +
              '  "' + (it.label || "(NO LABEL)") + '"');
}

// ---------------------------------------------------------------- the verdict

// The question that decides everything: can we tell one sticker from another?
var pressable = [];
for (var m = 0; m < fresh.length; m++) {
  if (fresh[m].clickable) pressable.push(fresh[m]);
}

var labelled = [];
var blank = [];
for (var n = 0; n < pressable.length; n++) {
  if (pressable[n].label && pressable[n].label !== "null") {
    labelled.push(pressable[n]);
  } else {
    blank.push(pressable[n]);
  }
}

console.log("");
console.log("--- CAN WE TELL THE STICKERS APART? ---");
console.log("  pressable things in the picker : " + pressable.length);
console.log("  with a label we could match on : " + labelled.length);
console.log("  with no label at all           : " + blank.length);

if (blank.length > labelled.length) {
  console.warn("");
  console.warn("  MOSTLY UNLABELLED.");
  console.warn("  To pick a sticker we would have to tap a position in the");
  console.warn("  grid. This phone is 1220x2712; the farm phones are older");
  console.warn("  Samsungs with different screens, where that position lands");
  console.warn("  somewhere else - or on nothing.");
} else if (labelled.length > 0) {
  console.log("");
  console.log("  Labelled. We could match a sticker by name, the same way we");
  console.log("  match every other button. Names seen:");
  for (var p = 0; p < Math.min(labelled.length, 12); p++) {
    console.log("    " + labelled[p].xPercent + "%," + labelled[p].yPercent +
                '%  "' + labelled[p].label + '"');
  }
}

// Tabs mean more than one screen to handle.
var tabs = [];
for (var q = 0; q < fresh.length; q++) {
  if (LOOKS_LIKE_A_TAB.test(fresh[q].label)) tabs.push(fresh[q]);
}
console.log("");
console.log("--- TABS ---");
if (tabs.length === 0) {
  console.log("  None found. One screen to handle, which is the simple case.");
} else {
  for (var r = 0; r < tabs.length; r++) {
    console.log("  " + tabs[r].xPercent + "% across, " + tabs[r].yPercent +
                '% down  "' + tabs[r].label + '"');
  }
  console.log("  Each tab is a separate screen, and the picker remembers which");
  console.log("  one was last open - so we cannot assume where we land.");
}

// A scrolling grid means position is not even stable within one phone.
var scrollers = [];
for (var s = 0; s < fresh.length; s++) {
  if (fresh[s].scrollable) scrollers.push(fresh[s]);
}
console.log("");
console.log("--- DOES THE GRID SCROLL? ---");
if (scrollers.length === 0) {
  console.log("  Nothing reports itself as scrollable.");
} else {
  for (var t = 0; t < scrollers.length; t++) {
    console.warn("  yes - covers " + scrollers[t].topPercent + "% to " +
                 scrollers[t].bottomPercent + "% of the screen");
  }
  console.warn("  So the same spot shows a different sticker depending on how");
  console.warn("  far the grid happens to be scrolled. Tapping by position is");
  console.warn("  then not just unportable, it is unpredictable on one phone.");
}

// Is there a confirmation step, or does a tap send straight away?
var sendButtons = [];
for (var u = 0; u < after.length; u++) {
  if (LOOKS_LIKE_SENDING.test(after[u].label)) sendButtons.push(after[u]);
}
console.log("");
console.log("--- IS THERE A SEND STEP? ---");
if (sendButtons.length === 0) {
  console.warn("  No Send button visible. That points to a tap sending the");
  console.warn("  sticker straight away, with nothing to undo it.");
  console.warn("  Not proven - proving it means sending one.");
} else {
  for (var v = 0; v < sendButtons.length; v++) {
    console.log("  " + sendButtons[v].yPercent + '%  "' + sendButtons[v].label + '"');
  }
  console.log("  A separate Send step would make this much safer than it looks.");
}

// The message box must still be empty. If the picker typed into it, that
// matters a great deal: it would mean a stray tap leaves text behind.
var textAfter = composerText(after);
console.log("");
console.log("--- DID ANYTHING GET TYPED? ---");
if (textAfter === textBefore) {
  console.log('  No. The message box still says "' + textAfter + '".');
} else {
  console.warn('  The message box changed: "' + textBefore + '" -> "' +
               textAfter + '"');
  console.warn("  Clear it by hand before leaving this conversation.");
}

// ---------------------------------------------------------------- closing

console.log("");
console.log("=====================================");
console.log("Closing the picker with the back action...");
back();
sleep(1500);

var now = collect(auto.root);
console.log("Items on screen now: " + now.length + " (was " + before.length +
            " before the picker opened)");

if (now.length <= before.length + 3) {
  console.log("Picker closed.");
} else {
  console.error("THE PICKER MAY STILL BE OPEN. Close it by hand.");
  console.error("Deliberately not tapping to dismiss it: a tap that misses the");
  console.error("empty area lands on a sticker, and that sends it.");
}

console.log("");
console.log("Nothing in the picker was pressed. Nothing was sent.");

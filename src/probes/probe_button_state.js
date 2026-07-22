/**
 * probe_button_state.js - find out how a button shows that it is already on
 *
 * The main script must never undo something a real person did. Before it
 * presses Like or Favorites, it has to know whether that video is already
 * liked or already saved. This finds out how to tell.
 *
 * For each button it reads the label, presses it, reads the label again, then
 * presses it a second time to put the video back exactly as it was.
 *
 * The account ends up unchanged: each action is added and then removed. If a
 * restore fails, the script says so loudly rather than staying quiet.
 *
 * How to use:
 *   1. Open TikTok on a video you have NOT liked and have NOT saved
 *   2. Run this script and switch back to TikTok within 5 seconds
 *   3. Read the summary at the end
 *
 * Already answered for TikTok 46.1.3, kept here for the next app update:
 *   Like, not liked  ->  "Like video. 186 likes"   selected false
 *   Like, liked      ->  "Like"                    selected true
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var PAUSE_AFTER_PRESS_MS = 1500;

var BUTTONS = [
  {
    name: "Like",
    matchers: [
      function () { return descMatches("(?i)^(un)?like video\\b.*"); },
      function () { return descMatches("(?i)^(un)?like\\b.*"); }
    ]
  },
  {
    name: "Favorites",
    matchers: [
      function () { return descMatches("(?i)^add or remove this video from favou?rites.*"); },
      function () { return descMatches("(?i).*\\bfavou?rites?\\b.*"); }
    ]
  }
];

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

/** Find the button belonging to the video actually on screen. */
function findButton(matchers) {
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

/** Everything we can learn about the button's current state. */
function readState(matchers) {
  var node = findButton(matchers);
  if (!node) return null;
  return {
    desc: node.desc() || "",
    selected: node.selected(),
    checked: (function () {
      try { return node.checked(); } catch (e) { return "n/a"; }
    })(),
    node: node
  };
}

function press(node) {
  var target = node;
  for (var level = 0; level < 3 && target; level++) {
    try {
      if (target.clickable()) {
        if (target.click()) return true;
        break;
      }
      var parent = target.parent();
      if (!parent || parent.bounds().height() > device.height * 0.3) break;
      target = parent;
    } catch (e) {
      break;
    }
  }
  try {
    var b = node.bounds();
    return click(b.centerX(), b.centerY());
  } catch (e2) {
    return false;
  }
}

function sameState(a, b) {
  return a && b && a.desc === b.desc && a.selected === b.selected &&
         a.checked === b.checked;
}

function describeState(state) {
  return '"' + state.desc + '"   selected=' + state.selected +
         "   checked=" + state.checked;
}

// ---------------------------------------------------------------- one button

/**
 * Returns a result object describing what we learned, and whether the video
 * was left the way we found it.
 */
function testButton(button) {
  var result = { name: button.name, ok: false, restored: true, note: "" };

  console.log("");
  console.log("--- " + button.name + " ---");

  var before = readState(button.matchers);
  if (!before) {
    result.note = "button not found on screen";
    console.warn("  not found");
    return result;
  }
  console.log("  off : " + describeState(before));

  if (before.selected === true) {
    result.note = "already on before we started - use a different video";
    console.warn("  this video already has " + button.name + " switched on,");
    console.warn("  so we cannot learn anything. Nothing was changed.");
    return result;
  }

  if (!press(before.node)) {
    result.note = "could not press it";
    console.error("  could not press. Nothing was changed.");
    return result;
  }
  sleep(PAUSE_AFTER_PRESS_MS);

  var after = readState(button.matchers);
  if (!after) {
    result.restored = false;
    result.note = "lost the button after pressing - CHECK BY HAND";
    console.error("  lost track of the button after pressing.");
    console.error("  THE VIDEO MAY BE LEFT CHANGED - please check by hand.");
    return result;
  }
  console.log("  on  : " + describeState(after));

  // Put it back.
  if (!press(after.node)) {
    result.restored = false;
    result.note = "could not undo - CHECK BY HAND";
    console.error("  could not press it again. THE CHANGE IS STILL THERE -");
    console.error("  please undo it by hand.");
    return result;
  }
  sleep(PAUSE_AFTER_PRESS_MS);

  var restored = readState(button.matchers);
  result.restored = sameState(before, restored);
  if (!result.restored) {
    console.warn("  could not confirm it went back - please check by hand.");
  }

  if (sameState(before, after)) {
    result.note = "nothing changed - the label and flags look identical";
    console.warn("  nothing about the button changed when switched on.");
    console.warn("  We cannot tell the two states apart. Report this back.");
    return result;
  }

  result.ok = true;
  result.before = before;
  result.after = after;
  return result;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("Use a video you have NOT liked and NOT saved.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");

var results = [];
for (var i = 0; i < BUTTONS.length; i++) {
  results.push(testButton(BUTTONS[i]));
}

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");

for (var j = 0; j < results.length; j++) {
  var r = results[j];
  console.log("");
  if (r.ok) {
    console.log(r.name + ":");
    console.log("  off = " + describeState(r.before));
    console.log("  on  = " + describeState(r.after));
  } else {
    console.warn(r.name + ": " + r.note);
  }
}

console.log("");
var allRestored = true;
for (var k = 0; k < results.length; k++) {
  if (!results[k].restored) allRestored = false;
}
if (allRestored) {
  console.log("The video was put back the way it was. Nothing left behind.");
} else {
  console.warn("Something could not be undone. Please check this video by hand.");
}

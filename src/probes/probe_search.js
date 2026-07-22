/**
 * probe_search.js - work out how to search for a topic and get back again
 *
 * WHY WE WANT THIS
 *
 * TikTok decides what to show us based on what we watch. Searching for a topic
 * and watching the results is the strongest way to tell it what we are
 * interested in - much stronger than waiting for the right video to appear on
 * its own. We do this at the start of a session to steer the feed.
 *
 * WHAT IT FOUND, ON TIKTOK 46.1.3
 *
 *   Opening search   the magnifying glass at the top of the feed, which does
 *                    accept an ordinary press
 *   Sending it       a Button whose *text* is "Search" beside the box. It
 *                    reports itself pressable and refuses to be pressed, so it
 *                    has to be tapped at its own coordinates
 *   The results      cards labelled "Video by <creator>, <caption>, Liked by N"
 *   Getting back     three to five presses of back, depending on how far into
 *                    the results you went
 *
 * Run it again after a TikTok update: it still tries all three ways of sending
 * the search and reports which one worked, so a change shows up immediately.
 *
 * WHAT THIS SCRIPT DOES
 *
 * It walks through the search in stages, printing what it finds at each one,
 * and finishes by getting back to the feed and checking it really is there.
 *
 * It types a harmless word into the search box. Nothing is posted, and nothing
 * is sent to anyone - the only trace is a line in our own search history,
 * which is the point of the exercise.
 *
 * It does NOT open any result. Choosing which result is safe to open comes
 * after we can see what the results screen contains.
 *
 * HOW TO USE
 *
 *   Open TikTok on the feed, then run this script and switch back within 5
 *   seconds.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var SEARCH_WORD = "coffee";   // harmless and common, just to see what happens

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

/**
 * Find something on screen, preferring one that can actually be pressed.
 *
 * This matters here. The search screen carries the word "Search" three times:
 * on the text box, on a picture of a magnifying glass, and on the button that
 * sends the search. Only the last one responds to a press. Taking whichever
 * matched first found the picture and got stuck.
 */
function findVisible(matchers, topLimitPercent) {
  var firstAnything = null;

  for (var i = 0; i < matchers.length; i++) {
    var matches;
    try {
      matches = matchers[i]().find();
    } catch (e) {
      continue;
    }
    if (!matches) continue;

    for (var j = 0; j < matches.length; j++) {
      if (!isOnScreen(matches[j])) continue;

      if (topLimitPercent !== undefined) {
        try {
          var pct = (matches[j].bounds().centerY() / device.height) * 100;
          if (pct > topLimitPercent) continue;
        } catch (e) { continue; }
      }

      try {
        if (matches[j].clickable()) return matches[j];
      } catch (e) { /* treat as not pressable */ }

      if (!firstAnything) firstAnything = matches[j];
    }
  }

  // Nothing pressable matched, so hand back whatever we did find - pressStrict
  // will try its parents.
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
    } catch (e) {
      return false;
    }
  }
  return false;
}

/** Print everything on screen, with where it is and what it can do. */
function dumpScreen(title) {
  var lines = [];

  function walk(node, depth) {
    if (!node || depth > 40) return;
    try {
      var desc = node.desc();
      var text = node.text();
      var label = (desc && desc !== "null") ? desc : (text || "");
      var editable = false;
      try { editable = node.editable(); } catch (e) { /* older builds */ }

      if (isOnScreen(node) && (label || editable)) {
        var b = node.bounds();
        var flags = "";
        if (node.clickable()) flags += " [press]";
        if (editable) flags += " [TYPING]";
        if (node.scrollable()) flags += " [scrolls]";
        lines.push("  " + Math.round((b.centerY() / device.height) * 100) +
                   "%  " + (node.className() || "").replace("android.widget.", "") +
                   flags + '  "' + (label || "(no label)") + '"');
      }

      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip unreadable nodes */ }
  }

  var root = auto.root;
  if (root) walk(root, 0);

  console.log("");
  console.log("--- " + title + " (" + lines.length + " items) ---");
  for (var k = 0; k < lines.length && k < 60; k++) console.log(lines[k]);
  if (lines.length > 60) console.log("  ... " + (lines.length - 60) + " more");
  return lines.length;
}

/** Are we looking at the video feed? The Like button only exists there. */
function onTheFeed() {
  return findVisible([
    function () { return descMatches("(?i)^(un)?like video\\b.*"); }
  ]) !== null;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("No result will be opened. Nothing is posted.");
sleep(DELAY_BEFORE_START_MS);

console.log("");
console.log("=====================================");

if (!onTheFeed()) {
  console.warn("This does not look like the video feed. Carrying on anyway.");
}

// ---- Stage 1: open search -------------------------------------------------

console.log("");
console.log("STAGE 1 - opening search");

// Only look in the top fifth of the screen. The Share panel has a button
// called "Search" too, and it sits far lower.
var searchEntry = findVisible([
  function () { return descMatches("(?i)^search$"); },
  function () { return textMatches("(?i)^search$"); }
], 20);

if (!searchEntry) {
  console.error("No Search button near the top of the feed.");
  console.error("Look at the dump below for what is actually up there.");
  dumpScreen("THE FEED AS WE SEE IT");
  exit();
}

try {
  console.log("Found it at " +
              Math.round((searchEntry.bounds().centerY() / device.height) * 100) +
              "% down the screen");
} catch (e) { /* not important */ }

if (!pressStrict(searchEntry)) {
  console.error("Could not press it. Nothing was changed.");
  exit();
}
sleep(2000);

dumpScreen("THE SEARCH SCREEN, BEFORE TYPING");

// ---- Stage 2: find the box and type ---------------------------------------

console.log("");
console.log("STAGE 2 - typing \"" + SEARCH_WORD + "\"");

var box = null;
try {
  var editables = className("android.widget.EditText").find();
  for (var i = 0; i < editables.length; i++) {
    if (isOnScreen(editables[i])) { box = editables[i]; break; }
  }
} catch (e) { /* fall through */ }

if (!box) {
  console.error("No text box found. Cannot search.");
  console.error("Getting back to the feed...");
} else {
  try {
    console.log('Box says: "' + (box.text() || box.desc() || "(empty)") + '"');
  } catch (e) { /* not important */ }

  var typed = false;
  try {
    typed = box.setText(SEARCH_WORD);
  } catch (e) {
    console.warn("setText failed: " + e);
  }
  console.log("Typed into the box: " + (typed ? "yes" : "NO"));
  sleep(1500);

  dumpScreen("AFTER TYPING - look for what sends the search");

  // ---- Stage 3: send it ---------------------------------------------------

  console.log("");
  console.log("STAGE 3 - sending the search");

  // There are two plausible ways to send a search, and we do not yet know
  // which one TikTok accepts. Try each, and report exactly what happened -
  // guessing again would just waste another run.

  function describeNode(node) {
    try {
      return (node.className() || "?").replace("android.widget.", "") +
             ' "' + (node.desc() || node.text() || "") + '"' +
             " clickable=" + node.clickable() +
             " at " + Math.round((node.bounds().centerY() / device.height) * 100) + "%";
    } catch (e) {
      return "(could not read the node)";
    }
  }

  var sent = false;

  // Way 1: the Search button beside the box.
  //
  // Known to be refused on TikTok 46.1.3 - the button reports itself pressable
  // and ignores the press anyway. Tried first regardless, because if a later
  // version fixes it this is the tidiest way in, and we would want to know.
  //
  // Note that once we have typed, the box no longer says "Search" - it says
  // what we typed - so the only things left with that name are this button and
  // a magnifying glass picture. findVisible prefers the pressable one.
  console.log("");
  console.log("Way 1: the Search button beside the box");

  var sendButton = findVisible([
    function () { return descMatches("(?i)^search$"); },
    function () { return textMatches("(?i)^search$"); }
  ], 20);

  if (!sendButton) {
    console.warn("  nothing matched near the top of the screen");
  } else {
    console.log("  chose: " + describeNode(sendButton));
    var pressed = pressStrict(sendButton);
    console.log("  pressing it: " + (pressed ? "accepted" : "REFUSED"));
    if (pressed) {
      sleep(2500);
      // If suggestions are gone, the search went through.
      sent = !textMatches("(?i)^press and hold on a suggestion.*").exists();
      console.log("  suggestions still showing: " + (sent ? "no" : "yes"));
    }
  }

  // Way 2: tap the first suggestion. TikTok offers our own word back as the
  // top suggestion, so this searches for the same thing.
  if (!sent) {
    console.log("");
    console.log("Way 2: tapping the first suggestion");

    var suggestion = null;
    try {
      var rows = textMatches("(?i)^" + SEARCH_WORD + "$").find();
      for (var r = 0; r < rows.length; r++) {
        // Skip the text box itself, which now holds the same word.
        var isBox = false;
        try { isBox = rows[r].editable(); } catch (e) { }
        var lowEnough = false;
        try {
          lowEnough = (rows[r].bounds().centerY() / device.height) > 0.10;
        } catch (e) { }
        if (!isBox && lowEnough && isOnScreen(rows[r])) {
          suggestion = rows[r];
          break;
        }
      }
    } catch (e) { /* fall through */ }

    if (!suggestion) {
      console.warn("  no suggestion row matched \"" + SEARCH_WORD + "\"");
    } else {
      console.log("  chose: " + describeNode(suggestion));
      var tapped = pressStrict(suggestion);
      console.log("  pressing it: " + (tapped ? "accepted" : "REFUSED"));
      if (tapped) {
        sleep(2500);
        sent = !textMatches("(?i)^press and hold on a suggestion.*").exists();
        console.log("  suggestions still showing: " + (sent ? "no" : "yes"));
      }
    }
  }

  // Way 3: tap the Search button where it sits on screen.
  //
  // TikTok builds this button to respond to a real touch, not to the press
  // that Android's accessibility layer offers - which is why way 1 was
  // refused even though the button says it is pressable. A tap at its own
  // coordinates is not a blind guess: we take them from the button itself.
  //
  // This is safe here in a way it would not be inside the Share or Comments
  // panels. Nothing dangerous sits nearby - the only neighbour is "Clear
  // search field", which does no harm.
  if (!sent && sendButton) {
    console.log("");
    console.log("Way 3: tapping the Search button where it sits");
    try {
      var box2 = sendButton.bounds();
      console.log("  tapping at " + box2.centerX() + "," + box2.centerY());
      click(box2.centerX(), box2.centerY());
      sleep(2500);
      sent = !textMatches("(?i)^press and hold on a suggestion.*").exists();
      console.log("  suggestions still showing: " + (sent ? "no" : "yes"));
    } catch (e) {
      console.warn("  could not tap it: " + e);
    }
  }

  console.log("");
  console.log("Search sent: " + (sent ? "YES" : "NO"));

  sleep(2000);
  dumpScreen(sent ? "THE RESULTS SCREEN" : "STILL NOT SEARCHED");
}

// ---- Stage 4: get back ----------------------------------------------------

console.log("");
console.log("=====================================");
console.log("STAGE 4 - getting back to the feed");

var attempts = 0;
while (!onTheFeed() && attempts < 5) {
  attempts++;
  back();
  sleep(1200);
}

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");

if (onTheFeed()) {
  console.log("Back on the feed after " + attempts + " press(es) of back.");
} else {
  console.error("NOT back on the feed after " + attempts + " tries.");
  console.error("This is the thing that must work before searching is used at");
  console.error("all - a session that gets lost here is a wasted session.");
  dumpScreen("WHERE WE ENDED UP");
}

console.log("");
console.log("No result was opened. Nothing was posted.");

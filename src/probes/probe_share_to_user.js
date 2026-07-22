/**
 * probe_share_to_user.js - study the Share panel's people row. Send nothing.
 *
 * WHAT WE ARE DECIDING
 *
 * Whether the script can share a video to one of our own accounts, which is
 * what would put something in their inbox for the reply feature to answer. Two
 * ways to reach a person, and they fail very differently:
 *
 *   the suggested row  - "the third face along". If that row reorders between
 *                        reading it and pressing it, the video goes to whoever
 *                        moved into third place. A stranger, permanently.
 *
 *   the search box     - "the account whose name is exactly this". Get it
 *                        wrong and nothing is found, so nothing is sent.
 *
 * The second one fails by doing nothing, and that is the whole argument for it.
 * This probe measures whether the first one is as unstable as it looks, and
 * whether the second one is usable at all.
 *
 * WHAT THIS TOUCHES
 *
 *   Share (to open the panel), Search inside the panel, the search box, and
 *   Close. That is all.
 *
 *   It never presses a person. It never presses Send. Selecting somebody is
 *   reported to need a second press to actually send, and that is probably
 *   true - but "probably" is not a thing to spend an irreversible action on,
 *   and a video sent to a stranger cannot be taken back.
 *
 * HOW TO USE
 *
 *   Open TikTok on any video in the feed. Run this and switch back within 5
 *   seconds. It takes about a minute and a half, because it reads the people
 *   row, waits, and reads it again to see whether it moved.
 */

// ---------------------------------------------------------------- settings

/**
 * A name to type into the panel's search box, to see what a result looks like.
 * Use one of your own accounts. Leave it empty to open search without typing.
 */
var SEARCH_FOR = "minhchiune";

var DELAY_BEFORE_START_MS = 5000;
var PANEL_OPEN_WAIT_MS = 2500;
var SETTLE_SECONDS = 60;
var MAX_DEPTH = 45;

// The band the panel puts people in. Read from the panel itself, not assumed -
// this is only a starting guess for the report.
var PEOPLE_BAND = [72, 86];

var NEVER_PRESS = /^send$|^send to$|^repost$|^not interested$|^report$|^promote$/i;

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
    if (!node || depth > MAX_DEPTH) return;
    try {
      if (isOnScreen(node)) {
        var b = node.bounds();
        var editable = false;
        try { editable = node.editable(); } catch (e) { /* older builds */ }
        items.push({
          node: node,
          label: labelOf(node),
          className: (node.className() || "").replace("android.widget.", "")
                                             .replace("android.view.", ""),
          clickable: node.clickable(),
          editable: editable,
          x: Math.round((b.centerX() / device.width) * 100),
          y: Math.round((b.centerY() / device.height) * 100),
          w: Math.round((b.width() / device.width) * 100)
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

/** Press only something genuinely pressable. Never a screen position. */
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

/** Everything sitting in the band where the panel lists people. */
function peopleRow(items) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y < PEOPLE_BAND[0] || it.y > PEOPLE_BAND[1]) continue;
    if (!it.label) continue;
    if (NEVER_PRESS.test(it.label)) continue;
    out.push(it);
  }
  out.sort(function (a, b) { return a.x - b.x; });
  return out;
}

function describeRow(row) {
  var parts = [];
  for (var i = 0; i < row.length; i++) {
    parts.push(row[i].x + '%:"' + row[i].label + '"');
  }
  return parts.join("  ");
}

function closePanel() {
  var close = findVisible([
    function () { return descMatches("(?i)^close$"); },
    function () { return textMatches("(?i)^close$"); }
  ]);
  if (close && pressStrict(close)) {
    sleep(1200);
    if (!panelIsOpen()) return true;
  }
  back();
  sleep(1200);
  return !panelIsOpen();
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("Nothing will be sent. No person will be pressed.");
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
console.log("=====================================");
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

// ------------------------------------------------- 1. who is in the people row

var first = snapshot();
var rowFirst = peopleRow(first);

console.log("");
console.log("=====================================");
console.log("1. THE SUGGESTED PEOPLE ROW");
console.log("=====================================");

if (rowFirst.length === 0) {
  console.warn("  Nothing found between " + PEOPLE_BAND[0] + "% and " +
               PEOPLE_BAND[1] + "%. The panel may be laid out differently on");
  console.warn("  this version. Everything on screen is dumped at the end.");
} else {
  console.log("  " + rowFirst.length + " entries, left to right:");
  for (var i = 0; i < rowFirst.length; i++) {
    var p = rowFirst[i];
    console.log("    " + p.x + "% across  " + p.className +
                (p.clickable ? " [press]" : "") + '  "' + p.label + '"');
  }
  console.log("");
  console.log("  Names we could match on: " + rowFirst.length);
  console.log("  (unlike the sticker grid, which had none at all)");
}

// ------------------------------------------------- 2. does that row hold still

console.log("");
console.log("=====================================");
console.log("2. DOES THE ROW HOLD STILL?");
console.log("=====================================");
console.log("  Waiting " + SETTLE_SECONDS + " seconds, touching nothing, then");
console.log("  reading the same row again.");
console.log("");
console.log("  This is the question that decides the design. The sticker shelf");
console.log("  relabelled itself between two readings 100 seconds apart with");
console.log("  nobody touching the phone. If this row does the same, then");
console.log("  'the third person along' means a different person by the time");
console.log("  we press it - and it would be a stranger, permanently.");

var before = describeRow(rowFirst);
sleep(SETTLE_SECONDS * 1000);

if (!panelIsOpen()) {
  console.warn("");
  console.warn("  The panel closed by itself while we waited. That is worth");
  console.warn("  knowing too: it means the panel cannot be left sitting open.");
} else {
  var rowSecond = peopleRow(snapshot());
  var after = describeRow(rowSecond);

  console.log("");
  console.log("  before : " + before);
  console.log("  after  : " + after);
  console.log("");
  if (before === after) {
    console.log("  UNCHANGED. Position held for a minute.");
    console.log("  That is not proof it always holds - only that it did once.");
  } else {
    console.warn("  IT MOVED.");
    console.warn("  Picking somebody by their place in this row is unsafe, and");
    console.warn("  searching by name is the only route left.");
  }
}

// ------------------------------------------------- 3. the search box

console.log("");
console.log("=====================================");
console.log("3. SEARCHING INSIDE THE PANEL");
console.log("=====================================");

if (!panelIsOpen()) {
  console.warn("  The panel is shut, so this part cannot run. Run it again.");
} else {
  var search = null;
  var items = snapshot();
  for (var s = 0; s < items.length; s++) {
    if (/^search$/i.test(items[s].label) && items[s].y >= 65 && items[s].y <= 80) {
      search = items[s];
      break;
    }
  }

  if (!search) {
    console.warn("  No Search inside the panel. Then the suggested row is the");
    console.warn("  only way in, and its stability above decides everything.");
  } else {
    console.log('  Found "Search" at ' + search.x + "%," + search.y + "%");
    if (!pressStrict(search)) {
      console.warn("  It refused a proper press. Not tapping a position for it.");
    } else {
      sleep(1800);
      var opened = snapshot();

      var box = null;
      for (var b = 0; b < opened.length; b++) {
        if (opened[b].editable) { box = opened[b]; break; }
      }

      console.log("");
      console.log("  --- what search looks like ---");
      for (var o = 0; o < opened.length; o++) {
        var it = opened[o];
        if (!it.label && !it.editable) continue;
        console.log("    " + it.y + "%  " + it.className +
                    (it.clickable ? " [press]" : "") +
                    (it.editable ? " [TYPING]" : "") +
                    '  "' + (it.label || "(no label)") + '"');
      }

      if (!box) {
        console.warn("");
        console.warn("  No box to type in. Search here may just filter the row.");
      } else if (!SEARCH_FOR) {
        console.log("");
        console.log("  A box to type in, at " + box.y + "%. Set SEARCH_FOR at the");
        console.log("  top of this file to see what a result looks like.");
      } else {
        console.log("");
        console.log('  Typing "' + SEARCH_FOR + '" into the box...');
        var typed = false;
        try { typed = box.node.setText(SEARCH_FOR); } catch (e) { /* refused */ }

        if (!typed) {
          console.warn("  The box refused setText. Worth knowing - the seeding");
          console.warn("  flow hit the same thing on the main search screen.");
        } else {
          sleep(2500);
          var results = snapshot();
          console.log("");
          console.log("  --- results ---");
          var shown = 0;
          for (var r = 0; r < results.length; r++) {
            var res = results[r];
            if (!res.label || res.y < 20) continue;
            if (NEVER_PRESS.test(res.label)) {
              console.warn("    " + res.y + "%  DO NOT PRESS  \"" + res.label + '"');
              continue;
            }
            console.log("    " + res.y + "%  " + res.className +
                        (res.clickable ? " [press]" : "") + '  "' + res.label + '"');
            shown++;
          }
          if (shown === 0) {
            console.warn("    Nothing came back. Either the name is spelled");
            console.warn("    differently, or results need longer to arrive.");
          } else {
            console.log("");
            console.log('    Look for "' + SEARCH_FOR + '" in that list. If it is');
            console.log("    there with a name we can match exactly, this is the");
            console.log("    route: name in, that account out, and a wrong name");
            console.log("    finds nothing rather than finding a stranger.");
          }
        }
      }
    }
  }
}

// ------------------------------------------------- close up

console.log("");
console.log("=====================================");
console.log("Closing...");

var shut = closePanel();
if (!shut) {
  // A second go: search may have opened a screen of its own on top.
  back();
  sleep(1200);
  shut = closePanel();
}

if (shut) {
  console.log("Panel closed.");
} else {
  console.error("THE PANEL IS STILL OPEN. Close it by hand.");
}

console.log("");
console.log("No person was pressed. No Send was pressed. Nothing was sent.");

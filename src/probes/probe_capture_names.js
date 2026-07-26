/**
 * probe_capture_names.js - the exact names to put in reply_to and send_to
 *
 * WHY THIS EXISTS
 *
 * The two features that reach another person - replying in a conversation, and
 * sending a video to a friend - are matched by name. And the names cannot be
 * typed: TikTok's inbox puts an invisible character in front of each one, so a
 * name typed by hand never matches the name on screen. probe_tidyname.js was
 * written after an early version deleted every name it was given for exactly
 * this reason.
 *
 * So the names have to be copied off the phone. This reads them and prints each
 * one twice: once as JSON.stringify, which shows every hidden character as
 * \uXXXX, and once tidied the way main.js tidies it before comparing. The tidied
 * form is what goes into reply_to and send_to.
 *
 * WHAT IT PRESSES
 *
 * Only navigation, and nothing that reaches a person:
 *
 *   - the Inbox tab, to see the conversations
 *   - the Share button on a feed video, to see the people row
 *   - Close / back, to get out again
 *
 * It presses NO conversation, NO person in the share row, NO Send, and types
 * nothing. You can check that yourself:
 *
 *   grep -nE "setText|\\.send|reactIn|doSend|sendReaction" probe_capture_names.js
 *
 * The share panel lists real accounts and one press there messages them, so the
 * people row is only read, never touched.
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_capture_names.js <phone id>
 *
 * Nothing needs to be open; it opens TikTok itself. Read the two lists at the
 * end. The name you want is usually one of your own accounts that appears in
 * BOTH - a conversation you can reply into, and a person you can send a video to.
 */

console.show();

var state = require("./lib/state.js");
var feed = require("./lib/feed.js");
var LABELS = require("./lib/labels.js").LABELS;
var tidyName = require("./lib/messages.js").tidyName;

auto.waitFor();

// openTikTok launches state.tiktokPackage, which main.js sets at startup. A
// probe has to set it too, or launchPackage(null) opens nothing and the whole
// run ends at "Could not open TikTok" - which is exactly what happened first.
state.tiktokPackage = feed.detectTikTokPackage();
if (!state.tiktokPackage) {
  console.error("TikTok is not installed under a package name we know. Stopping.");
  exit();
}

var W = device.width;
var H = device.height;

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
  try { var d = node.desc(); if (d) return String(d); } catch (e) { }
  try { var t = node.text(); if (t) return String(t); } catch (e) { }
  return "";
}

/**
 * The value to put in the config file.
 *
 * The invisible characters are removed and the whitespace tidied, but the case
 * is left alone so the name stays readable - reply_to in the example config
 * holds "Nguyễn Anh Phong Hồ", not a lowercased version. main.js runs tidyName
 * over both sides when it compares, so case does not matter to the match; it
 * only matters to the person reading the file.
 */
function forConfig(name) {
  return String(name)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findByLabel(candidates, timeoutMs) {
  var deadline = Date.now() + (timeoutMs || 1500);
  do {
    for (var i = 0; i < candidates.length; i++) {
      var found;
      try { found = candidates[i]().find(); } catch (e) { continue; }
      if (!found) continue;
      for (var j = 0; j < found.length; j++) {
        if (onScreen(found[j])) return found[j];
      }
    }
    sleep(150);
  } while (Date.now() < deadline);
  return null;
}

function tapNode(node) {
  try { var b = node.bounds(); return click(b.centerX(), b.centerY()); }
  catch (e) { return false; }
}

// ---------------------------------------------------------------- open TikTok

console.log("");
console.log("=====================================");
console.log("OPENING TIKTOK");
console.log("=====================================");

if (!feed.openTikTok()) {
  console.error("Could not open TikTok. Is the screen unlocked and TikTok");
  console.error("logged in? Nothing was pressed.");
  exit();
}
console.log("  on the feed");

// ---------------------------------------------------------------- the inbox

console.log("");
console.log("=====================================");
console.log("CONVERSATIONS IN THE INBOX  (for reply_to)");
console.log("=====================================");

var inboxTab = findByLabel(LABELS.inbox_tab, 1500);
if (!inboxTab) {
  console.warn("  No Inbox tab found. Skipping the inbox.");
} else {
  tapNode(inboxTab);
  sleep(2500);

  // Conversation rows are the tappable items below the top of the screen. The
  // very top holds "New followers" / "Activity" and the like, which are not
  // people - kept out by position, exactly as readInboxRows does.
  var seen = {};
  var names = [];
  var items;
  try { items = className(/.*/).find(); } catch (e) { items = []; }

  for (var i = 0; i < items.length; i++) {
    if (!onScreen(items[i])) continue;
    var y;
    try { y = items[i].bounds().centerY(); } catch (e) { continue; }
    if (y < H * 0.22) continue;                 // headers, not conversations

    var raw = labelOf(items[i]);
    if (!raw) continue;
    var t = forConfig(raw);
    if (!t || t.length < 2) continue;
    if (/^\d+$/.test(t)) continue;              // unread-count badges
    if (seen[raw]) continue;
    seen[raw] = true;
    names.push(raw);
  }

  if (names.length === 0) {
    console.warn("  No conversations read. The inbox may be empty, or this may");
    console.warn("  not be the inbox. Look at the phone.");
  } else {
    for (i = 0; i < names.length; i++) {
      console.log("");
      console.log("  on screen : " + JSON.stringify(names[i]));
      console.log("  for config: " + JSON.stringify(forConfig(names[i])));
      console.log("  match key : " + JSON.stringify(tidyName(names[i])));
    }
  }

  // Back to the feed. Navigation only.
  feed.returnToFeed(5);
}

// ---------------------------------------------------------------- share panel

console.log("");
console.log("=====================================");
console.log("PEOPLE IN THE SHARE PANEL  (for send_to)");
console.log("=====================================");

if (!feed.onTheFeed()) {
  console.warn("  Not back on the feed, so not opening the share panel.");
} else {
  var shareBtn = findByLabel(LABELS.share, 1500);
  if (!shareBtn) {
    console.warn("  No Share button on this video. Skipping the people row.");
  } else {
    // The Favorites/Share label may sit on a child; climb to something pressable.
    var target = shareBtn;
    for (var lvl = 0; lvl < 3 && target; lvl++) {
      var ok = false;
      try { ok = target.clickable(); } catch (e) { }
      if (ok) break;
      try { target = target.parent(); } catch (e) { target = null; }
    }
    if (target) { try { target.click(); } catch (e) { tapNode(shareBtn); } }
    else tapNode(shareBtn);
    sleep(2500);

    // The people row sits at a different height on different builds, so rather
    // than trust one band, dump everything in the panel with its position and
    // let the reader see where the people actually are. The known app names and
    // the panel's own controls are dropped so what is left is candidates.
    var NOT_A_PERSON = /^(copy link|repost|report|share|send|story|save|more|sms|email|facebook|messenger|whatsapp|telegram|twitter|instagram|bottom sheet|not interested|download|add to story|promote|cast|mute|sound|search)/i;
    var people = [];
    var pseen = {};
    var nodes;
    try { nodes = className(/.*/).find(); } catch (e) { nodes = []; }

    for (i = 0; i < nodes.length; i++) {
      if (!onScreen(nodes[i])) continue;
      var yy;
      try { yy = Math.round(nodes[i].bounds().centerY() / H * 100); } catch (e) { continue; }
      if (yy < 45) continue;                 // above the panel entirely

      var praw = labelOf(nodes[i]);
      if (!praw) continue;
      var pt = forConfig(praw);
      if (!pt || pt.length < 2) continue;
      if (NOT_A_PERSON.test(pt)) continue;
      if (pseen[praw]) continue;
      pseen[praw] = true;
      people.push({ raw: praw, y: yy });
    }

    if (people.length === 0) {
      console.warn("  Nothing here looks like a person. Either there are no");
      console.warn("  suggested people on this account, or they were filtered");
      console.warn("  out. Look at the phone.");
    } else {
      for (i = 0; i < people.length; i++) {
        console.log("");
        console.log("  at " + people[i].y + "% down");
        console.log("  on screen : " + JSON.stringify(people[i].raw));
        console.log("  for config: " + JSON.stringify(forConfig(people[i].raw)));
        console.log("  match key : " + JSON.stringify(tidyName(people[i].raw)));
      }
    }

    // Close the panel without pressing anyone. Close button first; back is only
    // a fallback because it does not close the panel on some builds.
    var closeBtn = findByLabel(LABELS.share_panel_close, 1000);
    if (closeBtn) tapNode(closeBtn);
    else back();
    sleep(1500);
    feed.returnToFeed(5);
  }
}

// ---------------------------------------------------------------- verdict

console.log("");
console.log("=====================================");
console.log("NEXT");
console.log("=====================================");
console.log("  Copy the \"for config\" line of your own account into the test");
console.log("  settings: reply_to for the reply, send_to for the video.");
console.log("  A name that appears in BOTH lists can be used for both.");
console.log("");
console.log("Nothing was sent. No conversation and no person was pressed.");

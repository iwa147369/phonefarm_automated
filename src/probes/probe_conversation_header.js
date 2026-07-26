/**
 * probe_conversation_header.js - what does the top of a conversation say?
 *
 * WHY THIS EXISTS
 *
 * The reply feature found the right unread conversation, opened it, and then
 * refused to send: "this is not Iwa - leaving it alone". reactInConversation
 * confirms it is in the right place by reading a header in the top 12% of the
 * screen and matching its name against the inbox row's name. On this build
 * (com.zhiliaoapp.musically, Galaxy A8+) that check failed even though the
 * conversation was the right one - so either the header is not in the top 12%,
 * or the name it shows is spelled differently from the inbox row.
 *
 * This opens the conversation and prints the top quarter of the screen with each
 * item's position and exact label, so the mismatch can be seen and fixed.
 *
 * WHAT IT PRESSES
 *
 * Navigation only: the Inbox tab, the one conversation whose name is in TARGET,
 * and back. It sends nothing, types nothing, and presses nothing on the reply
 * bar. Opening a conversation does not message anyone.
 *
 *   grep -nE "setText|reactIn|quick_send|Heart|Send" probe_conversation_header.js
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_conversation_header.js <phone id>
 *
 * Set TARGET below to the name of the conversation to open (as it reads after
 * tidying - "Iwa"). Read the TOP OF THE CONVERSATION list.
 */

console.show();

/** The conversation to open, matched the way main.js matches names. */
var TARGET = "Iwa";

var state = require("./lib/state.js");
var feed = require("./lib/feed.js");
var LABELS = require("./lib/labels.js").LABELS;
var tidyName = require("./lib/messages.js").tidyName;

auto.waitFor();

state.tiktokPackage = feed.detectTikTokPackage();
if (!state.tiktokPackage) {
  console.error("TikTok is not installed under a package name we know. Stopping.");
  exit();
}

var H = device.height;

function onScreen(node) {
  try {
    var b = node.bounds();
    return b.width() > 0 && b.height() > 0 && b.centerY() >= 0 && b.centerY() < H;
  } catch (e) { return false; }
}

function labelOf(node) {
  try { var d = node.desc(); if (d) return String(d); } catch (e) { }
  try { var t = node.text(); if (t) return String(t); } catch (e) { }
  return "";
}

function yPct(node) {
  try { return Math.round(node.bounds().centerY() / H * 100); } catch (e) { return -1; }
}

function findByLabel(candidates, timeoutMs) {
  var deadline = Date.now() + (timeoutMs || 1500);
  do {
    for (var i = 0; i < candidates.length; i++) {
      var found;
      try { found = candidates[i]().find(); } catch (e) { continue; }
      if (!found) continue;
      for (var j = 0; j < found.length; j++) if (onScreen(found[j])) return found[j];
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
console.log("Opening TikTok and the inbox...");
// openTikTok times out on a cold start on this phone (its splash can take more
// than the 20s it waits), and then TikTok finishes opening a moment later. So a
// false here is not fatal: settle, and carry on if TikTok is on screen anyway.
if (!feed.openTikTok()) {
  sleep(6000);
  if (!feed.isTikTokOnScreen()) {
    console.error("TikTok is not on screen after waiting. Nothing was pressed.");
    exit();
  }
  console.log("  (opened slowly, but it is here now)");
}

var inboxTab = findByLabel(LABELS.inbox_tab, 2500);
if (!inboxTab) { console.error("No Inbox tab. Stopping."); exit(); }
tapNode(inboxTab);
sleep(2500);

// ---------------------------------------------------------------- find the row

console.log("");
console.log("=====================================");
console.log("LOOKING FOR THE \"" + TARGET + "\" CONVERSATION");
console.log("=====================================");

var wantKey = tidyName(TARGET);
var row = null;
var items;
try { items = className(/.*/).find(); } catch (e) { items = []; }

for (var i = 0; i < items.length; i++) {
  if (!onScreen(items[i])) continue;
  if (yPct(items[i]) < 22) continue;               // headers, not conversations
  if (tidyName(labelOf(items[i])) !== wantKey) continue;

  // Climb to something pressable, the way the real code opens a row.
  var target = items[i];
  for (var lvl = 0; lvl < 4 && target; lvl++) {
    var ok = false;
    try { ok = target.clickable(); } catch (e) { }
    if (ok) { row = target; break; }
    try { target = target.parent(); } catch (e) { target = null; }
  }
  if (row) break;
}

if (!row) {
  console.error("  No conversation named \"" + TARGET + "\" on the inbox.");
  console.error("  Either it is not there, or the name reads differently.");
  console.error("  Nothing was pressed.");
  exit();
}

console.log("  found it, opening it (this sends nothing)");
tapNode(row);
sleep(3000);

// ---------------------------------------------------------------- the header

console.log("");
console.log("=====================================");
console.log("TOP OF THE CONVERSATION  (top 25% of screen)");
console.log("=====================================");
console.log("  reactInConversation looks in the top 12% for a name matching");
console.log("  \"" + TARGET + "\" (tidied: \"" + wantKey + "\").");
console.log("");

var top = [];
var nodes;
try { nodes = className(/.*/).find(); } catch (e) { nodes = []; }
for (i = 0; i < nodes.length; i++) {
  if (!onScreen(nodes[i])) continue;
  var y = yPct(nodes[i]);
  if (y < 0 || y > 25) continue;
  var raw = labelOf(nodes[i]);
  if (!raw) continue;
  top.push({ y: y, raw: raw });
}

top.sort(function (a, b) { return a.y - b.y; });

var matchInTop12 = false;
for (i = 0; i < top.length; i++) {
  var key = tidyName(top[i].raw);
  var hit = (top[i].y <= 12 && key === wantKey);
  if (hit) matchInTop12 = true;
  console.log("  " + top[i].y + "%  " + JSON.stringify(top[i].raw) +
              "   tidied=" + JSON.stringify(key) +
              (key === wantKey ? (hit ? "   <-- MATCHES, and in the top 12%"
                                       : "   <-- matches the name, but below 12%")
                               : ""));
}

// ---------------------------------------------------------------- the reply bar

console.log("");
console.log("=====================================");
console.log("THE REPLY BAR  (bottom 15% of screen)");
console.log("=====================================");
console.log("  reactInConversation needs all of quick_send_all drawn before it");
console.log("  will press one: " + LABELS.quick_send_all.join(", "));
console.log("");

var bar = [];
try { nodes = className(/.*/).find(); } catch (e) { nodes = []; }
for (i = 0; i < nodes.length; i++) {
  if (!onScreen(nodes[i])) continue;
  var by = yPct(nodes[i]);
  if (by < 82) continue;
  var braw = labelOf(nodes[i]);
  if (!braw) continue;
  bar.push({ y: by, raw: braw });
}
bar.sort(function (a, b) { return a.y - b.y; });

if (bar.length === 0) {
  console.warn("  Nothing at the bottom. The bar may not be drawn, or the");
  console.warn("  keyboard is covering it.");
} else {
  for (i = 0; i < bar.length; i++) {
    console.log("  " + bar[i].y + "%  " + JSON.stringify(bar[i].raw));
  }
  console.log("");
  for (var q = 0; q < LABELS.quick_send_all.length; q++) {
    var wantBtn = LABELS.quick_send_all[q];
    var present = false;
    for (i = 0; i < bar.length; i++) if (bar[i].raw === wantBtn) present = true;
    console.log("  quick_send_all[" + q + "] \"" + wantBtn + "\": " +
                (present ? "present" : "MISSING"));
  }
}

// ---------------------------------------------------------------- verdict

console.log("");
console.log("=====================================");
console.log("VERDICT");
console.log("=====================================");
if (matchInTop12) {
  console.log("  The name is in the top 12% and matches. reactInConversation");
  console.log("  should accept this - if it did not, look at how the header is");
  console.log("  read rather than at where it is.");
} else {
  var anywhere = false;
  for (i = 0; i < top.length; i++) if (tidyName(top[i].raw) === wantKey) anywhere = true;
  if (anywhere) {
    console.log("  The name is up there but NOT in the top 12%. The header check");
    console.log("  in reactInConversation needs a looser band for this build.");
  } else {
    console.log("  The name \"" + TARGET + "\" does not appear at the top at all.");
    console.log("  The conversation header spells it differently from the inbox");
    console.log("  row. The check should read the header shown here instead.");
  }
}

console.log("");
console.log("Getting back to the feed. Nothing was sent.");
feed.returnToFeed(6);
console.log("Done.");

/**
 * probe_self_name.js - check we can read this account's own display name
 *
 * WHY THIS EXISTS
 *
 * The roster feature needs each phone to know which of our accounts it is
 * running as, so it can message everyone on the shared list EXCEPT itself. That
 * name is only on screen on the Profile tab. This exercises the real reading
 * code in lib/identity.js against the profile of whatever account is logged in,
 * and dumps the top of the screen so a miss can be diagnosed.
 *
 * WHAT IT PRESSES
 *
 * Only navigation, and nothing that reaches a person:
 *
 *   - the Profile tab, to see our own profile
 *   - back / the feed, to get out again
 *
 * It presses NO button on the profile, opens NO menu, and types nothing. Check:
 *
 *   grep -nE "setText|\\.send|reactIn|doSend|Edit|Follow" probe_self_name.js
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_self_name.js <phone id>
 *
 * Nothing needs to be open; it opens TikTok itself. Read the last line: the
 * name it found is what lib/identity.js will store as this phone's own account.
 */

console.show();

var state = require("./lib/state.js");
var feed = require("./lib/feed.js");
var LABELS = require("./lib/labels.js").LABELS;
var identity = require("./lib/identity.js");
var screenItems = require("./lib/messages.js").screenItems;
var tidyName = require("./lib/messages.js").tidyName;
var findOnScreen = require("./lib/util.js").findOnScreen;
var pressStrict = require("./lib/util.js").pressStrict;
var tapNode = require("./lib/util.js").tapNode;

auto.waitFor();

state.tiktokPackage = feed.detectTikTokPackage();
if (!state.tiktokPackage) {
  console.error("TikTok is not installed under a package name we know. Stopping.");
  exit();
}

var W = device.width, H = device.height;

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

// ---- to Profile, exactly the way identity.js does it -----------------------

console.log("");
console.log("=====================================");
console.log("OPENING OUR PROFILE  (Profile tab, by label)");
console.log("=====================================");

var tab = findOnScreen(LABELS.profile_tab, 2500);
if (!tab) {
  console.error("  No Profile tab by label. identity.js would give up here.");
  console.error("  Look at the phone: what is the bottom-right tab called?");
  exit();
}
console.log("  found the Profile tab, opening it");
if (!pressStrict(tab)) tapNode(tab);
sleep(2800);

// ---- the dump, for diagnosis -----------------------------------------------

console.log("");
console.log("=====================================");
console.log("TOP OF THE PROFILE  (what identity.js sees)");
console.log("=====================================");

var items = screenItems();
var top = [];
for (var i = 0; i < items.length; i++) {
  var it = items[i];
  if (it.y > 40) continue;
  if (!it.label) continue;
  var cx, cy;
  try { cx = it.node.bounds().centerX(); cy = it.node.bounds().centerY(); }
  catch (e) { continue; }
  top.push({ label: it.label, cn: it.className, y: it.y,
             cxp: Math.round(cx / W * 100), cyp: Math.round(cy / H * 100) });
}
top.sort(function (a, b) { return a.cyp - b.cyp; });
for (i = 0; i < top.length; i++) {
  var t = top[i];
  var isHandle = /^@[a-z0-9._]{2,}$/.test(tidyName(t.label));
  console.log("  " + t.cyp + "% down, " + t.cxp + "% across, class " +
              String(t.cn).split(".").pop() + (isHandle ? "   <- @handle" : ""));
  console.log("    " + JSON.stringify(t.label) + "  key=" + JSON.stringify(tidyName(t.label)));
}

// ---- the answer: the real reading code -------------------------------------

var found = identity.readNameFromProfile(items);

console.log("");
console.log("=====================================");
console.log("RESULT");
console.log("=====================================");
if (found) {
  console.log("  display name : " + JSON.stringify(found));
  console.log("  match key    : " + JSON.stringify(tidyName(found)));
  console.log("  -> identity.js would run this phone as this account, and");
  console.log("     message everyone on the roster except this name.");
} else {
  console.warn("  Could not read the display name. See the dump above:");
  console.warn("  the name should be the item just above the @handle, centred");
  console.warn("  under it. If it is being filtered, adjust labels.profile_not_name.");
}

// ---- back out --------------------------------------------------------------

var roster = identity.loadRoster();
console.log("");
console.log("  roster on this phone: " +
            (roster.length ? JSON.stringify(roster) : "(none - accounts.json not deployed yet)"));

feed.returnToFeed(6);
console.log("");
console.log("Nothing was sent. No button on the profile was pressed.");

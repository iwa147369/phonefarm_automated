/**
 * lib/identity.js - which of our accounts this phone is running as
 *
 * WHY THIS EXISTS
 *
 * The messaging features - replying to a message, and sending a video - reach a
 * real inbox, so they only ever act on a list of our own accounts. Keeping that
 * list correct on every phone by hand does not scale: there are more accounts
 * than phones, and accounts move between phones. So instead every phone carries
 * the SAME roster of all our accounts (config/accounts.json, deployed
 * identically), and works out at startup which one it is itself, by reading the
 * display name off its own Profile screen. The accounts it may message are then
 * simply "the roster, minus me", with no per-phone editing.
 *
 * READING THE NAME
 *
 * This is build-specific and was settled with probe_self_name.js on a Galaxy
 * A8+ running com.zhiliaoapp.musically (2026-07-29): the display name is the
 * item sitting directly above the "@handle" and centred under it. The @handle
 * is unmistakable - it starts with "@" - so it is found first and the name is
 * taken relative to it, rather than by a fixed position that another build
 * would move. labels.profile_not_name keeps the controls that share that region
 * ("Edit" sits at the very same height as the name) from being mistaken for it.
 */

var state = require("./state.js");
var SETTINGS = state.SETTINGS;
var log = state.log;
var feed = require("./feed.js");
var LABELS = require("./labels.js").LABELS;
var messages = require("./messages.js");
var tidyName = messages.tidyName;
var screenItems = messages.screenItems;
var util = require("./util.js");
var findOnScreen = util.findOnScreen;
var pressStrict = util.pressStrict;
var tapNode = util.tapNode;

/** Strip the invisible characters but keep the case, so the name stays readable. */
function cleanName(raw) {
  return String(raw)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every farm account, the same list on every phone.
 *
 * A missing or unreadable file means an empty roster, which just leaves the
 * messaging features with nobody to act on - the safe direction to fail in.
 */
function loadRoster() {
  try {
    var path = SETTINGS.roster_file;
    if (path && files.exists(path)) {
      var parsed = JSON.parse(files.read(path));
      if (parsed && parsed.accounts instanceof Array) return parsed.accounts;
    }
  } catch (e) {
    log("  identity: could not read the roster (" + e + ")");
  }
  return [];
}

/**
 * The display name from a Profile screen that is already open.
 *
 * Returns the cleaned name, or null while the @handle - and so the name above
 * it - has not drawn yet.
 */
function readNameFromProfile(items) {
  // The @handle first: unmistakable, and everything else is measured from it.
  var handle = null;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y > 40) continue;                       // the top of the profile only
    if (!/^@[a-z0-9._]{2,}$/.test(tidyName(it.label))) continue;
    var hx, hy;
    try { hx = it.node.bounds().centerX(); hy = it.node.bounds().centerY(); }
    catch (e) { continue; }
    if (!handle || hy < handle.y) handle = { x: hx, y: hy };
  }
  if (!handle) return null;

  // The name is the labelled item directly above the handle and centred under
  // it - the closest one that is not itself a handle, a count, or a control.
  var best = null;
  for (i = 0; i < items.length; i++) {
    it = items[i];
    var name = cleanName(it.label);
    if (!name || name.length < 2) continue;
    var key = tidyName(name);
    if (/^@/.test(key)) continue;                          // another handle
    if (/^[0-9][0-9.,]*[kmb]?$/.test(key)) continue;       // a follower/like count
    if (LABELS.profile_not_name.test(key)) continue;       // a control
    var cx, cy;
    try { cx = it.node.bounds().centerX(); cy = it.node.bounds().centerY(); }
    catch (e) { continue; }
    if (cy >= handle.y) continue;                          // must sit above the handle
    if (Math.abs(cx - handle.x) > device.width * 0.30) continue;   // centred under it
    if (!best || cy > best.y) best = { name: name, y: cy };        // closest above
  }
  return best ? best.name : null;
}

/**
 * Open our own profile, read the display name, come back to the feed.
 *
 * Navigation only: it opens no menu and presses nothing that reaches a person.
 * TikTok must already be open on the feed when this is called.
 */
function detectSelfName() {
  var tab = findOnScreen(LABELS.profile_tab, 2500);
  if (!tab) {
    log("  identity: no Profile tab found - cannot read who we are");
    return null;
  }
  if (!pressStrict(tab)) tapNode(tab);

  var name = null;
  var deadline = Date.now() + 6000;
  do {
    name = readNameFromProfile(screenItems());
    if (name) break;
    sleep(400);
  } while (Date.now() < deadline);

  feed.returnToFeed(6);
  return name;
}

/** The roster with our own name removed, matched the tidy way. */
function friendsOf(roster, self) {
  var out = [];
  var me = tidyName(self || "");
  for (var i = 0; i < roster.length; i++) {
    if (me && tidyName(roster[i]) === me) continue;
    out.push(roster[i]);
  }
  return out;
}

/**
 * Work out who this phone is and who it may message, once, and leave both on
 * the shared state for the messaging code to read.
 *
 * Safe to call more than once - it only does the work the first time. Returns
 * the name, or null if it could not be read.
 */
function establishIdentity() {
  if (state.selfName) return state.selfName;     // already done this run

  var roster = loadRoster();
  state.roster = roster;

  var self = detectSelfName();
  state.selfName = self;
  state.friends = self ? friendsOf(roster, self) : roster.slice();

  if (self) {
    log("Running as: " + self);
    if (roster.length === 0) {
      log("  identity: the roster is empty - messaging has nobody to act on");
    } else {
      log("  identity: may message " + state.friends.length + " of " +
          roster.length + " on the roster (everyone but ourselves)");
    }
  } else {
    log("  identity: could not read our own name - messaging falls back to the");
    log("  explicit reply_to / send_to lists, if any are set");
  }
  return self;
}

module.exports = {
  loadRoster: loadRoster,
  detectSelfName: detectSelfName,
  readNameFromProfile: readNameFromProfile,
  friendsOf: friendsOf,
  establishIdentity: establishIdentity,
  cleanName: cleanName
};

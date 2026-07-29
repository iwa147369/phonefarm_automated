/**
 * lib/messages.js - reading the inbox, and replying with a sticker
 *
 * The only part of the script that can affect another person. Everything else
 * watches videos; this presses send.
 *
 * That is why it is written the way it is. Before anything is sent it checks
 * the conversation is one of ours by name, that the message box is empty and
 * where it should be, that all five buttons on the quick-reply bar are drawn,
 * and that the button it chose has not moved since it looked. If any of that
 * fails it gives up. There is deliberately no fallback to tapping a screen
 * position: a tap that lands somewhere unexpected in a conversation cannot be
 * taken back.
 *
 * Names are the other trap. TikTok decorates them with unread marks, times and
 * previews, so a name has to be cleaned before it can be compared - and the
 * first version of that cleaning worked on a laptop and deleted every name it
 * was given on the phone. See probe_tidyname.js and docs/WHAT-BROKE.md.
 */

var state = require("./state.js");
var util = require("./util.js");
var feed = require("./feed.js");
var LABELS = require("./labels.js").LABELS;

var SETTINGS = state.SETTINGS;
var stats = state.stats;
var log = state.log;
var noteMiss = state.noteMiss;
var noteHit = state.noteHit;

var rndInt = util.rndInt;
var chance = util.chance;
var settingValue = util.settingValue;
var isOnScreen = util.isOnScreen;
var findOnScreen = util.findOnScreen;
var pressStrict = util.pressStrict;
var findSameButtonAgain = util.findSameButtonAgain;
var humanPause = util.humanPause;

var isTikTokOnScreen = feed.isTikTokOnScreen;
var onTheFeed = feed.onTheFeed;
var returnToFeed = feed.returnToFeed;

/**
 * Everything on screen, flattened, with the position of each item.
 *
 * The inbox is built from rows, and a row's name, unread badge and preview line
 * are separate items that only belong together because they sit at the same
 * height. So we need the whole screen at once, not one lookup at a time.
 */
function screenItems() {
  var items = [];

  function walk(node, depth) {
    if (!node || depth > 45) return;
    try {
      if (isOnScreen(node)) {
        var b = node.bounds();
        var desc = node.desc();
        var text = node.text();
        items.push({
          node: node,
          label: (desc && desc !== "null") ? desc : (text || ""),
          className: node.className() || "",
          y: Math.round((b.centerY() / device.height) * 100),
          widthPercent: Math.round((b.width() / device.width) * 100)
        });
      }
      var children = node.children();
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    } catch (e) { /* skip anything unreadable */ }
  }

  try { walk(auto.root, 0); } catch (e) { /* no tree at all */ }
  return items;
}

/**
 * How many things on screen carry this label.
 *
 * Counting stickers before and after a press is how we know the press sent one
 * and not two. A press that fires twice would otherwise look like success.
 */
function countMatching(pattern) {
  var items = screenItems();
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    if (pattern.test(items[i].label)) n++;
  }
  return n;
}

/** Are we looking at the inbox list, rather than a conversation? */
function onTheInbox() {
  if (!isTikTokOnScreen()) return false;
  if (findOnScreen(LABELS.message_box, 400)) return false;   // a conversation
  return findOnScreen(LABELS.inbox_tab, 600) !== null;
}

/**
 * Read the inbox into one entry per conversation.
 *
 * Rows are found by grouping everything into horizontal bands. Anything within
 * a few percent of the same height belongs to the same row.
 */
function readInboxRows() {
  var items = screenItems();
  var bands = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y < 15 || it.y > 92) continue;      // header and the bottom tabs

    var placed = null;
    for (var b = 0; b < bands.length; b++) {
      if (Math.abs(bands[b].y - it.y) <= 4) { placed = bands[b]; break; }
    }
    if (!placed) {
      placed = { y: it.y, members: [] };
      bands.push(placed);
    }
    placed.members.push(it);
  }

  var rows = [];
  for (var n = 0; n < bands.length; n++) {
    var members = bands[n].members;
    var name = null, unread = 0, preview = "", pressable = null;

    // A row reads: name, the same name again inside the avatar, the unread
    // count, the message, the time. The name is always FIRST - picking the
    // longest piece of text instead turns the message into the name, and broke
    // the check that keeps us off the "New followers" screen.
    // See docs/WHAT-BROKE.md.
    for (var m = 0; m < members.length; m++) {
      var item = members[m];
      var label = item.label;
      if (!label) continue;

      // The unread count: a small View whose whole label is a number.
      if (/^\d+$/.test(label) && item.widthPercent <= 8) {
        unread = parseInt(label, 10);
        continue;
      }

      // Timestamps, and labels TikTok forgot to turn into words - things like
      // "activebadgeis_active" and "storybadgenone_trueicon". They are never a
      // name and never a message.
      if (/^\s*·/.test(label) || LABELS.internal_label.test(label)) continue;

      if (!name) {
        name = label;              // first text in the row wins
      } else if (!preview && tidyName(label) !== tidyName(name)) {
        // The name appears twice - once as the heading and again inside the
        // avatar, where it stands in for a missing profile picture. Skipping
        // the repeat is what leaves the message itself as the preview.
        preview = label;
      }
    }

    // The row itself is full width. The avatar next to it is pressable too, and
    // pressing that opens the person's profile instead of the conversation.
    for (var p = 0; p < members.length; p++) {
      try {
        if (members[p].node.clickable() && members[p].widthPercent >= 80) {
          pressable = members[p].node;
          break;
        }
      } catch (e) { /* skip */ }
    }

    if (name) {
      rows.push({ name: name, unread: unread, preview: preview,
                  y: bands[n].y, node: pressable });
    }
  }

  return rows;
}

/**
 * Tidy a display name so two spellings of the same name match.
 *
 * TikTok puts an invisible character in front of every name in the inbox - the
 * left-to-right mark, U+200E, which decides which way mixed text reads. It does
 * not show up on screen and it does not show up when you copy the name, but it
 * is there in what we read, and a plain comparison against a name typed into
 * the settings file would fail every time for a reason nobody could see.
 *
 * The pattern is written in numbers, never as the characters themselves.
 * Typed in directly it reads as an empty pair of brackets, works on a laptop,
 * and on the phone deletes every name it is given. See docs/WHAT-BROKE.md.
 */
function tidyName(name) {
  if (!name) return "";

  var out = String(name)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // If cleaning emptied a name that was not empty, the pattern above is doing
  // something other than what it says. Fall back to the plain version rather
  // than hand back an empty string, and say so - the fault that hid last time
  // hid because nothing complained.
  if (!out) {
    if (!state.warnedAboutNames) {
      state.warnedAboutNames = true;
      console.error("tidyName emptied \"" + name + "\" - the pattern is wrong " +
                    "on this phone. Falling back to a plain comparison.");
    }
    out = String(name).replace(/\s+/g, " ").trim().toLowerCase();
  }

  return out;
}

/** Is this a row we are allowed to open? */
function mayReplyTo(row) {
  if (!row.name) return false;
  if (LABELS.not_a_conversation.test(row.name)) return false;
  if (LABELS.unusable_name.test(row.name)) return false;
  if (row.unread < 1) return false;

  var wanted = tidyName(row.name);
  if (!wanted) return false;

  // Never reply to ourselves. TikTok does not normally show a conversation with
  // our own account, but the guard costs nothing.
  if (state.selfName && tidyName(state.selfName) === wanted) return false;

  // Who we may reply to: the explicit list if one is set, otherwise the shared
  // roster with our own name already taken out. state.friends is read live - it
  // is filled in once identity.js has looked, and reassigned, so a local copy
  // would go stale.
  var explicit = SETTINGS.messages.reply_to || [];
  var allowed = explicit.length ? explicit : (state.friends || []);
  for (var i = 0; i < allowed.length; i++) {
    if (tidyName(allowed[i]) === wanted) return true;
  }
  return false;
}

/** Is this tidied name one of the names in the list? */
function nameIsOn(list, tidiedName) {
  if (!list || !tidiedName) return false;
  for (var i = 0; i < list.length; i++) {
    if (tidyName(list[i]) === tidiedName) return true;
  }
  return false;
}

/**
 * Send one sticker in the conversation that is already open.
 *
 * Every check here earns its place. An earlier version of this decided what to
 * press by position - "whatever sits above the message box" - caught a button
 * from this very bar, and sent two stickers nobody asked for.
 */
function reactInConversation(expectedName) {
  // The right conversation. Anything else and we do nothing.
  //
  // Read the header more than once. Opening a conversation on the slower farm
  // phones takes a moment, and a single snapshot taken while it is still drawing
  // finds the name nowhere and gives up on a conversation that is in fact the
  // right one - "this is not Iwa" when it plainly was. This still demands an
  // exact name match in the top 12%, so it can never accept the wrong one; it
  // only waits for the screen to arrive. Measured on a Galaxy A8+ with
  // probe_conversation_header.js: the header reads "Iwa" at 6% down, once drawn.
  var header = null;
  var deadline = Date.now() + 3000;
  do {
    var items = screenItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i].y <= 12 && tidyName(items[i].label) === tidyName(expectedName)) {
        header = items[i];
        break;
      }
    }
    if (header) break;
    sleep(300);
  } while (Date.now() < deadline);

  if (!header) {
    log("  messages: this is not " + expectedName + " - leaving it alone");
    return false;
  }

  // The message box must be empty and low on screen. Anywhere else means the
  // keyboard is up or a panel is open, and the bar will not be there.
  var box = findOnScreen(LABELS.message_box, 800);
  if (!box) {
    log("  messages: no message box - not a conversation");
    return false;
  }

  // The whole bar has to be drawn before we press any of it. Read the screen
  // again here rather than trusting the snapshot taken while the header was
  // still appearing - by now the message box is confirmed, so the bar beside it
  // has had time to draw too.
  var barItems = screenItems();
  for (var b = 0; b < LABELS.quick_send_all.length; b++) {
    var name = LABELS.quick_send_all[b];
    var found = false;
    for (var j = 0; j < barItems.length; j++) {
      if (barItems[j].label === name) { found = true; break; }
    }
    if (!found) {
      log("  messages: the send bar is incomplete (no " + name + ") - skipping");
      return false;
    }
  }

  var choices = SETTINGS.messages.reactions || [];
  if (choices.length === 0) return false;
  var choice = choices[rndInt(0, choices.length - 1)];
  var matchers = LABELS.quick_send[choice];
  if (!matchers) {
    log("  messages: " + choice + " is not one we have checked - skipping");
    return false;
  }

  var button = findOnScreen(matchers, 900);
  if (!button) {
    noteMiss();
    return false;
  }

  var wasAt;
  try {
    wasAt = { x: button.bounds().centerX(), y: button.bounds().centerY() };
  } catch (e) {
    return false;
  }

  // Look again before pressing. Nothing on these screens is assumed to hold
  // still: the sticker shelf was seen relabelling itself between two readings
  // a minute and a half apart, with nobody touching the phone.
  humanPause(500, 1100);
  var again = findSameButtonAgain(matchers, wasAt.x, wasAt.y, 40);
  if (!again) {
    log("  messages: the " + choice + " button moved - not pressing");
    return false;
  }

  var before = countMatching(/^stickers$/i);

  // pressStrict, never pressNode: pressNode falls back to tapping a position,
  // and a position on this screen is how the accident happened.
  if (!pressStrict(again)) {
    log("  messages: could not press " + choice + " properly - nothing sent");
    noteMiss();
    return false;
  }

  sleep(rndInt(1800, 2600));

  var after = countMatching(/^stickers$/i);
  if (after === before + 1) {
    log("  messages: sent " + choice + " to " + expectedName);
    stats.replies++;
    noteHit();
    return true;
  }

  if (after > before + 1) {
    console.error("  messages: one press produced " + (after - before) +
                  " stickers - switching messages off for this session");
    SETTINGS.messages.enabled = false;
    return false;
  }

  log("  messages: pressed " + choice + " but nothing arrived");
  noteMiss();
  return false;
}

/**
 * Check the inbox at the start of a session and reply to a few people.
 *
 * Returns to the feed whatever happens. Getting stranded in the inbox would
 * cost the whole session.
 */
function doCheckMessages() {
  var settings = SETTINGS.messages;
  if (!settings.enabled) return;

  // Who we may reply to: the explicit list if one is set, otherwise the shared
  // roster with our own name removed. Nothing to do if both are empty.
  var effective = (settings.reply_to && settings.reply_to.length)
                    ? settings.reply_to : (state.friends || []);
  if (effective.length === 0) return;
  if (!chance(settings.chance_of_checking)) return;

  // Wait for the feed rather than giving up the moment it is not there yet.
  //
  // TikTok takes a few seconds to draw the feed after it opens, and a check
  // made too early answers "not the feed". That skipped the whole thing on one
  // run and said nothing about it - the log jumped straight from "Opening
  // TikTok" to the first video, and the only way to notice was that a line was
  // missing. Silence is the worst way for a feature to fail.
  var readyBy = Date.now() + 8000;
  while (!onTheFeed() && Date.now() < readyBy) sleep(600);
  if (!onTheFeed()) {
    log("  messages: the feed has not come up - skipping messages this session");
    return;
  }

  log("Checking messages first");

  var tab = findOnScreen(LABELS.inbox_tab, 1200);
  if (!tab || !pressStrict(tab)) {
    log("  messages: could not open the inbox");
    return;
  }
  sleep(rndInt(1400, 2200));

  if (!onTheInbox()) {
    log("  messages: the inbox did not open");
    backToFeedFromInbox();
    return;
  }

  var rows = readInboxRows();
  var wanted = [];
  for (var i = 0; i < rows.length; i++) {
    if (mayReplyTo(rows[i])) wanted.push(rows[i]);
  }

  log("  messages: " + rows.length + " conversations, " + wanted.length +
      " unread from people we reply to");

  // When nothing matches, say what WAS unread. Otherwise the only clue is a
  // zero, and there is no way to tell "nothing has come in" apart from "the
  // name in the settings file is spelled differently to the name on screen".
  if (wanted.length === 0) {
    var unread = [];
    for (var u = 0; u < rows.length; u++) {
      if (rows[u].unread > 0 && !LABELS.not_a_conversation.test(rows[u].name)) {
        unread.push('"' + rows[u].name + '" -> compared as "' +
                    tidyName(rows[u].name) + '"  says: "' + rows[u].preview + '"');
      }
    }
    if (unread.length > 0) {
      var listed = [];
      for (var a = 0; a < effective.length; a++) {
        listed.push('"' + tidyName(effective[a]) + '"');
      }
      var source = (settings.reply_to && settings.reply_to.length)
                     ? "reply_to" : "the roster (minus us)";
      log("  messages: may reply to " + listed.length + " from " + source +
          ": " + listed.join(", "));
      log("  messages: unread, but not on that list:");
      for (var v = 0; v < unread.length; v++) log("      " + unread[v]);
      log("    (name first, then what the message says - if those two look");
      log("     swapped, the rows are being read wrongly)");
    }
  }

  var limit = Math.min(wanted.length, settingValue(settings.max_replies));

  for (var w = 0; w < limit && !state.stopRequested; w++) {
    var row = wanted[w];

    // Read the list again and make sure this row still says what it said. The
    // inbox is a recycling list: it fills rows in as their pictures arrive, and
    // a row read too early can still be carrying the previous row's name.
    var fresh = readInboxRows();
    var confirmed = null;
    for (var f = 0; f < fresh.length; f++) {
      if (fresh[f].name === row.name && Math.abs(fresh[f].y - row.y) <= 4) {
        confirmed = fresh[f];
        break;
      }
    }
    if (!confirmed || !confirmed.node || !mayReplyTo(confirmed)) {
      log("  messages: " + row.name + " is not where it was - skipping");
      continue;
    }

    if (!pressStrict(confirmed.node)) {
      log("  messages: could not open " + row.name);
      continue;
    }
    sleep(rndInt(1500, 2400));

    // Reading it takes a moment, whether or not we answer.
    humanPause(1200, 3200);

    if (chance(settings.chance_of_replying)) {
      reactInConversation(row.name);
    } else {
      log("  messages: read " + row.name + ", left it without replying");
    }

    humanPause(600, 1500);
    back();
    sleep(rndInt(1000, 1700));

    if (!onTheInbox()) {
      log("  messages: lost the inbox - going back to the feed");
      break;
    }
  }

  backToFeedFromInbox();
}

/**
 * Get back to the feed from the inbox.
 *
 * The inbox is a tab, not a panel, so the back action is not what returns us -
 * pressing Home is. We check we actually arrived, because browsing the wrong
 * screen for a whole session has happened before.
 */
function backToFeedFromInbox() {
  for (var attempt = 0; attempt < 3; attempt++) {
    if (onTheFeed()) return true;

    var home = findOnScreen(LABELS.home_tab, 900);
    if (home) {
      pressStrict(home);
    } else {
      back();
    }
    sleep(rndInt(1200, 1900));
  }

  if (onTheFeed()) return true;

  // Still lost. returnToFeed presses back, checking before each press.
  return returnToFeed(4);
}

module.exports = {
  doCheckMessages: doCheckMessages,
  backToFeedFromInbox: backToFeedFromInbox,
  onTheInbox: onTheInbox,
  tidyName: tidyName,
  nameIsOn: nameIsOn,
  screenItems: screenItems
};

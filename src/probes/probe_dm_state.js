/**
 * probe_dm_state.js - read the messages screens. Touch nothing.
 *
 * THIS FILE CONTAINS NO TAP OF ANY KIND
 *
 * No click, no press, no longClick, no gesture, no swipe, no back. It reads
 * the screen and prints what is there. You can check that yourself:
 *
 *     grep -nE "click|press|gesture|swipe|back\(" probe_dm_state.js
 *
 * The last probe promised the same thing in its comments and then sent two
 * stickers, because it fell back to a blind press when a node refused to be
 * long-pressed. There is no fallback here because there is no action here.
 *
 * WHAT WE STILL DO NOT KNOW
 *
 *   1. How do we tell an unread conversation from a read one? Every row on
 *      the inbox said "Sent", meaning outgoing. No badge, no count, nothing
 *      bold. Unread is the trigger for the whole feature, so this has to be
 *      answered first.
 *
 *   2. What makes the quick-send bar - Heart, Lol, ThumbsUp, Effects, Cards -
 *      appear? It was absent at 23:08, present at 23:18, and nobody knows
 *      why. If we cannot bring it up deliberately we cannot build on it.
 *
 *   3. Those five buttons report clickable = false, so pressStrict would
 *      refuse them. Is a parent clickable? If yes, we can press properly and
 *      never go near a blind tap again. This probe answers that by reading
 *      the tree upwards - no press needed to find out.
 *
 * HOW TO USE - RUN IT IN SEVERAL STATES
 *
 *   Run it, switch back to TikTok within 5 seconds, and repeat on:
 *
 *     a) the Inbox list, ideally with at least one genuinely unread message
 *     b) a conversation right after opening it
 *     c) the same conversation after tapping the message box yourself
 *     d) the same conversation after closing the keyboard
 *
 *   Each run prints one STATE line. Comparing those lines across runs is the
 *   whole point - that is how we find what brings the bar up.
 */

auto.waitFor();
console.show();

var DELAY_BEFORE_START_MS = 5000;
var MAX_DEPTH = 45;
var PARENT_LEVELS = 4;

// The quick-send bar we are trying to understand.
var BAR_BUTTONS = /^(heart|lol|thumbsup|effects|cards)$/i;

// Words that would mark a conversation as unread, if any exist.
var UNREAD_WORDS = /unread|new message|^\d+ new|notification/i;

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

function shortClass(node) {
  try {
    return (node.className() || "")
      .replace("android.widget.", "")
      .replace("android.view.", "")
      .replace("androidx.recyclerview.widget.", "")
      .replace("androidx.viewpager.widget.", "");
  } catch (e) {
    return "?";
  }
}

/**
 * How far up the tree we have to go before something is clickable.
 * This is exactly what pressNode() in main.js does, without the press.
 * Returns -1 if nothing in reach is clickable.
 */
function clickableAncestorLevel(node) {
  var target = node;
  for (var level = 0; level < PARENT_LEVELS && target; level++) {
    try {
      if (target.clickable()) return level;
      target = target.parent();
    } catch (e) {
      return -1;
    }
  }
  return -1;
}

// ---------------------------------------------------------------- collecting

var items = [];

function collect(node, depth) {
  if (!node || depth > MAX_DEPTH) return;
  try {
    if (isOnScreen(node)) {
      var b = node.bounds();
      var editable = false;
      try { editable = node.editable(); } catch (e) { /* older builds */ }

      items.push({
        node: node,
        label: labelOf(node),
        className: shortClass(node),
        clickable: node.clickable(),
        longClickable: node.longClickable(),
        editable: editable,
        scrollable: node.scrollable(),
        selected: node.selected(),
        depth: depth,
        x: Math.round((b.centerX() / device.width) * 100),
        y: Math.round((b.centerY() / device.height) * 100),
        top: Math.round((b.top / device.height) * 100),
        bottom: Math.round((b.bottom / device.height) * 100),
        w: Math.round((b.width() / device.width) * 100),
        h: Math.round((b.height() / device.height) * 100)
      });
    }
    var children = node.children();
    for (var i = 0; i < children.length; i++) collect(children[i], depth + 1);
  } catch (e) { /* skip anything unreadable */ }
}

function flags(it) {
  var s = "";
  if (it.clickable) s += " [press]";
  if (it.longClickable) s += " [long]";
  if (it.editable) s += " [TYPING]";
  if (it.scrollable) s += " [scrolls]";
  if (it.selected) s += " [selected]";
  return s;
}

// ---------------------------------------------------------------- run

console.log("Switch to TikTok now. Starting in 5 seconds...");
console.log("This probe reads only. It cannot tap anything.");
sleep(DELAY_BEFORE_START_MS);

collect(auto.root, 0);

if (items.length === 0) {
  console.error("Nothing readable on screen. Is TikTok in front?");
  exit();
}

var composer = null;
var bar = [];
for (var i = 0; i < items.length; i++) {
  if (items[i].editable && !composer) composer = items[i];
  if (BAR_BUTTONS.test(items[i].label)) bar.push(items[i]);
}

console.log("");
console.log("=====================================");

if (composer) {
  reportConversation();
} else {
  reportInbox();
}

// ---------------------------------------------------------------- inbox

function reportInbox() {
  console.log("THE INBOX LIST");
  console.log("=====================================");

  // Group everything into rows by vertical position. A conversation row is a
  // band of the screen; the name, the preview line and any unread marker all
  // sit inside the same band.
  var rows = [];
  var sorted = items.slice().sort(function (a, b) { return a.y - b.y; });

  for (var i = 0; i < sorted.length; i++) {
    var placed = false;
    for (var j = 0; j < rows.length; j++) {
      if (Math.abs(rows[j].y - sorted[i].y) <= 4) {
        rows[j].members.push(sorted[i]);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ y: sorted[i].y, members: [sorted[i]] });
  }

  console.log("");
  console.log("--- ROW BY ROW ---");
  console.log("(small unlabelled shapes are included on purpose - an unread");
  console.log(" dot carries no text, so it can only be found by its size)");

  for (var r = 0; r < rows.length; r++) {
    console.log("");
    console.log("  --- band at " + rows[r].y + "% ---");
    var mem = rows[r].members;
    for (var m = 0; m < mem.length; m++) {
      var it = mem[m];
      var size = it.w + "x" + it.h + "%";
      var name = it.label ? '"' + it.label + '"' : "(no label)";
      console.log("     " + it.className + flags(it) + "  " + size + "  " + name);
    }
  }

  // An unread dot is small, square-ish, and has no label.
  var dots = [];
  var words = [];
  for (var k = 0; k < items.length; k++) {
    var c = items[k];
    if (!c.label && c.w > 0 && c.w <= 6 && c.h > 0 && c.h <= 3 && c.y > 15 && c.y < 90) {
      dots.push(c);
    }
    if (UNREAD_WORDS.test(c.label)) words.push(c);
  }

  console.log("");
  console.log("--- POSSIBLE UNREAD MARKERS ---");
  if (words.length > 0) {
    console.log("  By wording:");
    for (var w = 0; w < words.length; w++) {
      console.log("    " + words[w].y + '%  "' + words[w].label + '"');
    }
  }
  if (dots.length > 0) {
    console.log("  Small unlabelled shapes, which is what a dot looks like:");
    for (var d = 0; d < dots.length; d++) {
      console.log("    " + dots[d].y + "% down, " + dots[d].x + "% across  " +
                  dots[d].className + "  " + dots[d].w + "x" + dots[d].h + "%");
    }
    console.log("");
    console.log("  Compare these against what you can see. If a dot lines up");
    console.log("  with a conversation you have not read, that is our marker.");
  }
  if (words.length === 0 && dots.length === 0) {
    console.warn("  Nothing found either way.");
    console.warn("  If this inbox really does have an unread message, then");
    console.warn("  unread is not exposed to us at all - and the trigger for");
    console.warn("  the feature has to be something else.");
  }

  console.log("");
  console.log("STATE: inbox, " + items.length + " items, " +
              rows.length + " bands, " + dots.length + " dot candidates");
}

// ---------------------------------------------------------------- conversation

function reportConversation() {
  console.log("INSIDE A CONVERSATION");
  console.log("=====================================");
  console.log("");
  console.log("--- EVERYTHING ON SCREEN (" + items.length + " items) ---");
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var name = it.label ? '"' + it.label + '"' : "(no label)";
    console.log("  " + it.y + "%  " + it.className + flags(it) + "  " + name);
  }

  console.log("");
  console.log("--- THE THING THAT KEEPS MOVING ---");
  console.log("  message box sits at " + composer.y + "% down the screen");
  console.log("  (65% when we first looked, 97% when the bar was up, 63% with");
  console.log("   the sticker picker open - so its position tells us a lot)");

  console.log("");
  console.log("--- THE QUICK-SEND BAR ---");
  if (bar.length === 0) {
    console.log("  NOT PRESENT in this state.");
    console.log("  Note what you did to get here - the difference between a");
    console.log("  run with the bar and a run without it is the answer.");
  } else {
    console.log("  PRESENT - " + bar.length + " buttons at " + bar[0].y + "% down:");
    for (var b = 0; b < bar.length; b++) {
      console.log("    " + bar[b].x + "% across  \"" + bar[b].label + '"' +
                  (bar[b].clickable ? "  [press]" : "  clickable=false"));
    }

    // The question that decides whether this route is usable at all.
    console.log("");
    console.log("--- CAN WE PRESS THEM PROPERLY? ---");
    console.log("  Walking up the tree from each button, the way pressNode");
    console.log("  does. No press is being made - this only reads.");
    var worst = -1;
    for (var c = 0; c < bar.length; c++) {
      var level = clickableAncestorLevel(bar[c].node);
      if (level < 0) {
        console.warn('    "' + bar[c].label + '"  nothing clickable within ' +
                     PARENT_LEVELS + " levels");
      } else {
        console.log('    "' + bar[c].label + '"  clickable at ' +
                    (level === 0 ? "itself" : level + " level(s) up"));
      }
      if (level > worst) worst = level;
    }

    console.log("");
    if (worst < 0) {
      console.warn("  NONE of them can be pressed properly.");
      console.warn("  That leaves only a blind tap at a position, which is");
      console.warn("  what sent two stickers by accident. This route is not");
      console.warn("  usable until something else turns up.");
    } else {
      console.log("  Usable. A real press works within " + worst +
                  " level(s) up, so we never need to tap a position.");
      console.log("  That was the blocker. This clears it.");
    }
  }

  console.log("");
  console.log("STATE: conversation, " + items.length + " items, box at " +
              composer.y + "%, bar " + (bar.length ? "PRESENT" : "absent"));
}

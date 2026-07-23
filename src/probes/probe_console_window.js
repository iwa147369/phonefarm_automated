/**
 * probe_console_window.js - where is the console panel, and can it be moved?
 *
 * It touches nothing outside AutoJs6. The only thing it changes is AutoJs6's
 * own console window, which it puts back before it finishes.
 *
 * WHY THIS EXISTS
 *
 * The floating console is the only way to see what a phone is doing without a
 * laptop and a cable, so main.js now shows it. It costs the swipe back to the
 * previous video: the panel sits over the top-left of the screen, and Android
 * gives a whole gesture to whichever window received its first touch, so a
 * swipe that begins inside the panel never reaches TikTok at all. The swipe
 * back begins around 30% down and always did; the swipe forward begins near
 * 74%, below the panel, and works even though it ends inside it.
 *
 * That trade was accepted, not measured, and two things behind it are guesses:
 *
 *   1. The panel is "roughly 2-68% across and 5-45% down". That was read off a
 *      Xiaomi 13T. The farm is Galaxy A9 and A8+ phones with older, narrower
 *      screens, where the same window is a different fraction of the display.
 *
 *   2. Nobody has checked whether the panel can simply be moved out of the way.
 *      If it can, the swipe back costs nothing and can come back.
 *
 * This probe answers both. Run it on a farm phone.
 *
 * WHAT IT CANNOT DO
 *
 * It measures the panel by asking the accessibility service what is on screen.
 * If that service cannot see AutoJs6's own floating window - and some builds
 * hide their overlays from it - the probe will say so rather than print a
 * confident number. A refusal is a real answer here; a wrong rectangle would
 * send us moving swipes to a place that is still covered.
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_console_window.js <phone id>
 *
 * Nothing needs to be open beforehand. Read the VERDICT at the end.
 */

console.show();

auto.waitFor();

var W = device.width;
var H = device.height;

/** Where the two swipes begin, from swipeToNextVideo() in main.js. */
var SWIPE_BACK_START = { yFrom: 0.25, yTo: 0.33, xFrom: 0.40, xTo: 0.60 };
var SWIPE_FORWARD_START = { yFrom: 0.70, yTo: 0.78, xFrom: 0.40, xTo: 0.60 };

console.log("");
console.log("=====================================");
console.log("THE SCREEN");
console.log("=====================================");
console.log("  " + W + " x " + H + " pixels");

// ---------------------------------------------------------------- seeing it

/**
 * Let searches reach windows other than the one in front.
 *
 * The console is a floating window, so by default it is not what a search
 * looks at. Not every build has this switch; without it the measurement below
 * simply finds nothing, which the probe reports honestly.
 */
function allowAllWindows() {
  try {
    if (auto.setWindowFilter) {
      auto.setWindowFilter(function (w) { return true; });
      return "auto.setWindowFilter";
    }
  } catch (e) { /* not on this build */ }
  return "not available";
}

/**
 * The smallest rectangle covering everything AutoJs6 is drawing right now.
 *
 * Anything belonging to another app is ignored. Nodes with no size are ignored
 * too - a zero-width node is a layout artefact, and letting one in would drag
 * the rectangle to the edge of the screen and make the panel look enormous.
 */
function panelBounds() {
  var found = null;
  var counted = 0;
  var nodes;

  try {
    nodes = packageName("org.autojs.autojs6").find();
  } catch (e) {
    return { error: String(e) };
  }

  for (var i = 0; i < nodes.length; i++) {
    var b;
    try {
      b = nodes[i].bounds();
    } catch (e) {
      continue;
    }
    if (!b || b.width() <= 0 || b.height() <= 0) continue;

    counted++;
    if (found === null) {
      found = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    } else {
      if (b.left < found.left) found.left = b.left;
      if (b.top < found.top) found.top = b.top;
      if (b.right > found.right) found.right = b.right;
      if (b.bottom > found.bottom) found.bottom = b.bottom;
    }
  }

  if (found === null) return { error: "nothing belonging to AutoJs6 was on screen" };
  found.nodes = counted;
  return found;
}

function asPercent(box) {
  return Math.round(box.left / W * 100) + "-" + Math.round(box.right / W * 100) +
         "% across, " +
         Math.round(box.top / H * 100) + "-" + Math.round(box.bottom / H * 100) +
         "% down";
}

/** Does a band of the screen begin inside the panel? */
function bandIsCovered(box, band) {
  var yTop = band.yFrom * H;
  var yBottom = band.yTo * H;
  var xLeft = band.xFrom * W;
  var xRight = band.xTo * W;

  return box.left < xRight && box.right > xLeft &&
         box.top < yBottom && box.bottom > yTop;
}

var filterHow = allowAllWindows();
sleep(1200);   // give the window a moment to be drawn

console.log("");
console.log("=====================================");
console.log("WHERE THE PANEL IS");
console.log("=====================================");
console.log("  searched other windows via: " + filterHow);

var before = panelBounds();

if (before.error) {
  console.warn("  Could not measure it: " + before.error);
  console.warn("");
  console.warn("  The accessibility service cannot see AutoJs6's own floating");
  console.warn("  window on this phone, so this probe cannot say where the");
  console.warn("  panel is. Nothing below is worth reading. The safe reading");
  console.warn("  is that the panel stays where it is and the swipe back stays");
  console.warn("  off, which is what main.js already does.");
  exit();
}

console.log("  " + before.left + "," + before.top + " to " +
            before.right + "," + before.bottom +
            "   (" + before.nodes + " parts)");
console.log("  " + asPercent(before));
console.log("");
console.log("  swipe back starts inside it   : " +
            (bandIsCovered(before, SWIPE_BACK_START) ? "YES - it is blocked" : "no"));
console.log("  swipe forward starts inside it: " +
            (bandIsCovered(before, SWIPE_FORWARD_START) ? "YES - it is blocked" : "no"));

// ---------------------------------------------------------------- moving it

console.log("");
console.log("=====================================");
console.log("CAN IT BE MOVED OUT OF THE WAY?");
console.log("=====================================");

var canSetPosition = false;
var canSetSize = false;
try { canSetPosition = typeof console.setPosition === "function"; } catch (e) { }
try { canSetSize = typeof console.setSize === "function"; } catch (e) { }

console.log("  console.setPosition : " + (canSetPosition ? "exists" : "MISSING"));
console.log("  console.setSize     : " + (canSetSize ? "exists" : "MISSING"));

var moved = null;

if (canSetPosition) {
  // Aim for the bottom-right corner, keeping the panel's current size. If the
  // window really does move, both swipes begin in clear space and the swipe
  // back can be turned back on.
  var wantX = Math.round(W * 0.35);
  var wantY = Math.round(H * 0.55);

  console.log("");
  console.log("  asking it to move to " + wantX + "," + wantY + " ...");
  try {
    console.setPosition(wantX, wantY);
    sleep(1500);
    moved = panelBounds();
  } catch (e) {
    console.warn("  setPosition threw: " + e);
  }

  if (moved && !moved.error) {
    console.log("  now at " + moved.left + "," + moved.top + " to " +
                moved.right + "," + moved.bottom);
    console.log("  " + asPercent(moved));

    if (moved.left === before.left && moved.top === before.top) {
      console.warn("  It did not actually move. The call is accepted and ignored.");
      moved = null;
    } else {
      console.log("");
      console.log("  swipe back would start inside it   : " +
                  (bandIsCovered(moved, SWIPE_BACK_START) ? "yes, still blocked" : "NO - clear"));
      console.log("  swipe forward would start inside it: " +
                  (bandIsCovered(moved, SWIPE_FORWARD_START) ? "yes, blocked" : "no"));
    }
  } else if (moved) {
    console.warn("  Could not measure it after moving: " + moved.error);
    moved = null;
  }

  // Put it back. A panel left in a strange place is a small thing, but the next
  // person to run this would measure the wrong rectangle and not know why.
  try {
    console.setPosition(before.left, before.top);
    console.log("");
    console.log("  put back where it was");
  } catch (e) {
    console.warn("");
    console.warn("  Could not put it back: " + e);
    console.warn("  Restart AutoJs6 to reset the panel.");
  }
}

// ---------------------------------------------------------------- verdict

console.log("");
console.log("=====================================");
console.log("VERDICT");
console.log("=====================================");

if (!bandIsCovered(before, SWIPE_BACK_START)) {
  console.log("  On this phone the panel does not cover where the swipe back");
  console.log("  begins. The two can live together as they are, and");
  console.log("  chance_of_swipe_back could be left alone here.");
  console.log("");
  console.log("  Check this on every model before trusting it. The panel is a");
  console.log("  fixed size in pixels, so it covers more of a small screen.");
} else if (moved) {
  console.log("  The panel covers the swipe back where it sits, but it can be");
  console.log("  moved, and moving it clears both swipes.");
  console.log("");
  console.log("  So main.js could place the panel out of the way at startup and");
  console.log("  keep the swipe back, instead of trading one for the other.");
} else {
  console.log("  The panel covers where the swipe back begins, and it cannot be");
  console.log("  moved on this build.");
  console.log("");
  console.log("  Then the trade main.js makes is the right one: showing the");
  console.log("  panel means giving up the swipe back. The other way out is to");
  console.log("  start that swipe to the right of the panel instead, which is a");
  console.log("  change to swipeToNextVideo() and needs its own testing - a");
  console.log("  swipe reports nothing about what it hit.");
}

console.log("");
console.log("TikTok was not touched.");

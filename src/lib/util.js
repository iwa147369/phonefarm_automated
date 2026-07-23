/**
 * lib/util.js - the small pieces everything else is built from
 *
 * Dice, and careful ways of finding and pressing a button. Nothing here knows
 * anything about TikTok or about the session running: give it a list of labels
 * and it hands back a button, give it a button and it presses one.
 *
 * That is why this file exists. A module cannot call back into main.js, so
 * anything two parts of the script both need has to live somewhere they can
 * both reach, and this is the bottom of that pile - it needs nothing itself.
 *
 * Several of these look like they are doing too much. They are not. Read the
 * comment above each one before simplifying it: TikTok keeps the next video's
 * buttons loaded just off the screen, and most of the care here is about not
 * pressing the wrong one.
 */

/** Random whole number between min and max, both included. */
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random number between min and max. */
function rnd(min, max) {
  return Math.random() * (max - min) + min;
}

/** True with probability p (0 to 1). */
function chance(p) {
  return Math.random() < p;
}

/** Pick a random value from a [min, max] pair written in SETTINGS. */
function rndFromRange(pair) {
  return rnd(pair[0], pair[1]);
}

/**
 * Read a setting that may be either a single number or a [min, max] range.
 *
 * This lets any timing in SETTINGS be varied without changing code: write one
 * number to fix it, or two to have it chosen fresh each time.
 */
function settingValue(setting) {
  if (setting instanceof Array) return rndFromRange(setting);
  return setting;
}

/**
 * Is this button actually visible, rather than sitting off the edge?
 *
 * This matters more than it sounds. TikTok keeps the *next* video's buttons
 * loaded just below the screen, so a search for "Like" finds two of them: the
 * video you are watching, and the one you have not seen yet. Pressing the
 * wrong one likes a video that was never on screen.
 */
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
 * Try each label option in turn and return the first visible button.
 * Returns null if none of them match.
 */
function findOnScreen(candidates, timeoutMs) {
  timeoutMs = timeoutMs || 800;
  var deadline = Date.now() + timeoutMs;

  do {
    for (var i = 0; i < candidates.length; i++) {
      var matches;
      try {
        matches = candidates[i]().find();
      } catch (e) {
        continue; // a bad matcher should not end the session
      }
      if (!matches) continue;

      for (var j = 0; j < matches.length; j++) {
        if (isOnScreen(matches[j])) return matches[j];
      }
    }
    sleep(120);
  } while (Date.now() < deadline);

  return null;
}

/**
 * Press a button.
 *
 * Some TikTok buttons carry the label but are not the part that responds to a
 * press - Favorites is like this, where the label sits on a child of the real
 * button. So we walk up a couple of levels looking for something pressable,
 * and tap the screen position as a last resort.
 */
function pressNode(node) {
  if (!node) return false;

  var target = node;
  for (var level = 0; level < 3 && target; level++) {
    try {
      if (target.clickable()) {
        if (target.click()) return true;
        break;
      }
      var parent = target.parent();
      // Stop climbing if the parent is a large container - pressing that would
      // hit something entirely different.
      if (!parent || parent.bounds().height() > device.height * 0.3) break;
      target = parent;
    } catch (e) {
      break;
    }
  }

  try {
    var b = node.bounds();
    // Tap slightly off centre - a real finger is never exact.
    return click(b.centerX() + rndInt(-8, 8), b.centerY() + rndInt(-8, 8));
  } catch (e2) {
    return false;
  }
}

/**
 * Press something, but only if it really is pressable.
 *
 * pressNode falls back to tapping a screen position when it cannot find a
 * pressable view. That is fine out on the feed, where the worst case is a
 * missed button. It is not fine inside the Share panel: along the top of that
 * panel TikTok lists real people, and a blind tap could land on one and send
 * them the video as a private message.
 *
 * So anywhere inside that panel, we use this instead. If we cannot identify
 * something properly pressable, we press nothing at all.
 */
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

/**
 * Find a button again, insisting it is the same one as before.
 *
 * While TikTok redraws there are two matching buttons in play - this video's
 * and the next one's. Where a count decides whether to press again, reading the
 * wrong one causes the very damage the check exists to prevent.
 */
function findSameButtonAgain(candidates, wasAtX, wasAtY, tolerancePx) {
  var deadline = Date.now() + 2000;

  do {
    for (var i = 0; i < candidates.length; i++) {
      var matches;
      try {
        matches = candidates[i]().find();
      } catch (e) {
        continue;
      }
      if (!matches) continue;

      for (var j = 0; j < matches.length; j++) {
        if (!isOnScreen(matches[j])) continue;
        try {
          var b = matches[j].bounds();
          if (Math.abs(b.centerX() - wasAtX) <= tolerancePx &&
              Math.abs(b.centerY() - wasAtY) <= tolerancePx) {
            return matches[j];
          }
        } catch (e) { /* skip unreadable nodes */ }
      }
    }
    sleep(150);
  } while (Date.now() < deadline);

  return null;
}

/**
 * Tap a button where it sits on the screen.
 *
 * Not the same as a blind tap: the coordinates come from the button itself, so
 * we know what is under the finger. Needed because some TikTok buttons refuse
 * a proper press - see the search notes in BUTTON LABELS.
 */
function tapNode(node) {
  try {
    var b = node.bounds();
    return click(b.centerX() + rndInt(-6, 6), b.centerY() + rndInt(-6, 6));
  } catch (e) {
    return false;
  }
}

/** Pause for a human-ish moment before acting. */
function humanPause(minMs, maxMs) {
  sleep(rndInt(minMs || 180, maxMs || 650));
}

/** Make a name safe to put inside a pattern. */
function escapeForMatch(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  rndInt: rndInt,
  rnd: rnd,
  chance: chance,
  rndFromRange: rndFromRange,
  settingValue: settingValue,
  isOnScreen: isOnScreen,
  findOnScreen: findOnScreen,
  pressNode: pressNode,
  pressStrict: pressStrict,
  findSameButtonAgain: findSameButtonAgain,
  tapNode: tapNode,
  humanPause: humanPause,
  escapeForMatch: escapeForMatch
};

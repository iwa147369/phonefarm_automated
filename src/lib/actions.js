/**
 * lib/actions.js - the things done to a video
 *
 * Like, save, read the comments, copy the link, send it to somebody. One
 * function each, all called from the browsing loop in main.js.
 *
 * Two rules run through the whole file, and both were learned the hard way.
 *
 * Never undo what a person did. A liked video says "Like", not "Unlike", so a
 * check that reads the label alone sees a liked video as unliked and presses
 * the button - taking the like back off. The `selected` flag is what we trust.
 *
 * Never leave a panel open. The comments and share panels cover the screen, and
 * one that fails to close swallows every swipe afterwards. The session ends
 * instead of carrying on blind, because a swipe that hits a panel looks exactly
 * like one that worked.
 *
 * docs/WHAT-BROKE.md has the evidence for both.
 */

var state = require("./state.js");
var util = require("./util.js");
var messages = require("./messages.js");
var LABELS = require("./labels.js").LABELS;

var SETTINGS = state.SETTINGS;
var stats = state.stats;
var log = state.log;
var noteMiss = state.noteMiss;
var noteHit = state.noteHit;

var rndInt = util.rndInt;
var rnd = util.rnd;
var chance = util.chance;
var rndFromRange = util.rndFromRange;
var findOnScreen = util.findOnScreen;
var pressNode = util.pressNode;
var pressStrict = util.pressStrict;
var findSameButtonAgain = util.findSameButtonAgain;
var humanPause = util.humanPause;
var escapeForMatch = util.escapeForMatch;

var screenItems = messages.screenItems;
var tidyName = messages.tidyName;
var nameIsOn = messages.nameIsOn;

function doLike() {
  var node = findOnScreen(LABELS.like);
  if (!node) {
    noteMiss();
    log("  like: button not found");
    return false;
  }

  var label = node.desc() || node.text() || "";

  // We have only seen the wording for a video that is NOT yet liked. Printing
  // it here tells us what TikTok says once a video IS liked, so the check just
  // below can be confirmed. Remove this line once we know.
  log('  like: button says "' + label + '"');

  if (LABELS.already_liked.test(label) || node.selected()) {
    log("  like: already liked, leaving it alone");
    return false;
  }

  humanPause(250, 900);
  if (pressNode(node)) {
    stats.like++;
    noteHit();
    log("  like: done");
    return true;
  }
  noteMiss();
  return false;
}

/**
 * Read the number printed under a button, for example the "76" beneath
 * Favorites. It sits in a text label one or two levels inside the button.
 */
function readCountLabel(node) {
  try {
    var children = node.children();
    for (var i = 0; i < children.length; i++) {
      var text = children[i].text();
      if (text) return text;

      var grandchildren = children[i].children();
      for (var j = 0; j < grandchildren.length; j++) {
        var deeper = grandchildren[j].text();
        if (deeper) return deeper;
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}

/**
 * Turn a displayed count into a number.
 *
 * TikTok rounds large numbers, so "1.2K" could be anything from 1150 to 1249.
 * We report whether the number is exact, because a rounded one cannot show a
 * change of a single save.
 */
function parseCount(text) {
  if (!text) return null;

  var cleaned = String(text).trim().replace(/,/g, "");
  var parts = cleaned.match(/^([\d.]+)\s*([KMB]?)$/i);
  if (!parts) return null;

  var value = parseFloat(parts[1]);
  if (isNaN(value)) return null;

  var suffix = parts[2].toUpperCase();
  if (suffix === "K") value *= 1e3;
  else if (suffix === "M") value *= 1e6;
  else if (suffix === "B") value *= 1e9;

  return { value: value, exact: suffix === "" };
}

/**
 * Add the video to Favorites.
 *
 * Favorites gives away nothing about its state, so we watch the count instead:
 * press, and it goes up if we saved and down if we un-saved - and if it went
 * down we press again to put it back. Counts rounded to "1.2K" will not move
 * by one, so those videos are left alone. See docs/WHAT-BROKE.md.
 */
function doSave() {
  var node = findOnScreen(LABELS.save);
  if (!node) {
    noteMiss();
    log("  save: button not found");
    return false;
  }

  var label = node.desc() || node.text() || "";
  if (LABELS.already_saved.test(label) || node.selected()) {
    log("  save: already saved, leaving it alone");
    return false;
  }

  var before = parseCount(readCountLabel(node));
  if (!before || !before.exact) {
    log("  save: count is rounded or missing, cannot tell saved from unsaved" +
        " - skipping to be safe");
    return false;
  }

  // Remember where the button was, so we can be sure we read the same one
  // afterwards rather than the next video's.
  var wasAtX, wasAtY;
  try {
    var box = node.bounds();
    wasAtX = box.centerX();
    wasAtY = box.centerY();
  } catch (e) {
    log("  save: could not fix the button's position - skipping to be safe");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(700, 1200));

  // Read the count again, insisting on the same button in the same place. The
  // old reference points at a view TikTok has since redrawn, and a plain
  // search could return the next video's button instead.
  var afterNode = findSameButtonAgain(LABELS.save, wasAtX, wasAtY, 40);
  if (!afterNode) {
    log("  save: lost sight of the button, so cannot check what happened" +
        " - treating it as saved");
    stats.save++;
    return true;
  }

  var after = parseCount(readCountLabel(afterNode));

  if (after && after.exact && after.value < before.value) {
    // The count fell, so this video was already saved and we just removed it.
    log("  save: it was already saved - undoing");
    humanPause(300, 700);
    pressNode(afterNode);
    sleep(rndInt(500, 900));
    return false;
  }

  stats.save++;
  noteHit();
  log("  save: done");
  return true;
}

/**
 * Scroll down through the comments.
 *
 * A long, slow swipe well inside the list. Long on purpose: a short drag can
 * be read as a tap, and a tap in this panel could hit a Reply button, a heart
 * on someone's comment, or Send Gift.
 *
 * The band is chosen from what the panel actually looks like: the list runs
 * from about 36% to 93% down the screen, the text box sits at 97%, and the
 * header and Close sit at 34%. Staying between 45% and 85% keeps clear of all
 * three even if the swipe drifts.
 */
function scrollComments() {
  var w = device.width;
  var h = device.height;

  var startY = h * rnd(0.80, 0.86);
  var endY = h * rnd(0.42, 0.50);
  var startX = w * rnd(0.35, 0.65);
  var endX = startX + rnd(-w * 0.04, w * 0.04);
  var midX = (startX + endX) / 2 + rnd(-w * 0.05, w * 0.05);
  var midY = (startY + endY) / 2;

  gesture(rndInt(300, 550),
    [Math.round(startX), Math.round(startY)],
    [Math.round(midX), Math.round(midY)],
    [Math.round(endX), Math.round(endY)]);
}

/** Is the Comments panel currently open? */
function commentPanelIsOpen(timeoutMs) {
  return findOnScreen(LABELS.comment_panel_marker, timeoutMs || 400) !== null;
}

/**
 * Open the comments, read a few, and close again.
 *
 * Nothing inside the panel is ever pressed except Close, and that only through
 * pressStrict, which refuses to tap a position blindly. Everything else is
 * done by scrolling.
 */
function doReadComments() {
  var node = findOnScreen(LABELS.comments);
  if (!node) {
    noteMiss();
    log("  comments: button not found");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(1200, 2000));

  if (!commentPanelIsOpen(1500)) {
    log("  comments: the panel did not open, skipping");
    return false;
  }

  // Read what is on screen first, pausing as if actually reading rather than
  // skimming at machine speed. Then scroll - or not, on a video whose comments
  // all fit on one screen.
  var scrolls = rndInt(SETTINGS.comments.scrolls[0],
                       SETTINGS.comments.scrolls[1]);

  sleep(Math.round(rndFromRange(SETTINGS.comments.read_seconds) * 1000));

  for (var i = 0; i < scrolls && !state.stopRequested; i++) {
    scrollComments();
    sleep(Math.round(rndFromRange(SETTINGS.comments.read_seconds) * 1000));
  }

  var closeButton = findOnScreen(LABELS.comment_panel_close, 800);
  if (closeButton) {
    pressStrict(closeButton);
    sleep(rndInt(600, 1000));
  }

  if (commentPanelIsOpen(800)) {
    // Close did not work. Try back, and if that fails too, stop: a panel left
    // open would swallow every swipe for the rest of the session.
    back();
    sleep(rndInt(600, 1000));

    if (commentPanelIsOpen(800)) {
      console.error("  comments: the panel will not close - ending the session");
      console.error("  Set read_comments to 0 in SETTINGS until this is sorted.");
      state.stopRequested = true;
      return false;
    }
  }

  stats.comments++;
  log("  comments: read" +
      (scrolls > 0 ? ", scrolled " + scrolls + " time(s)" : " without scrolling"));
  return true;
}

/** Is the Share panel currently open? */
function sharePanelIsOpen(timeoutMs) {
  return findOnScreen(LABELS.share_panel_marker, timeoutMs || 400) !== null;
}

/**
 * Close the Share panel. Returns true only once it is really gone.
 *
 * We press the panel's own X button. The back action does not work here on
 * Android 16 - that was measured, not guessed - so it is only a fallback.
 */
function closeSharePanel() {
  var closeButton = findOnScreen(LABELS.share_panel_close, 800);
  if (closeButton && pressStrict(closeButton)) {
    sleep(rndInt(500, 900));
    if (!sharePanelIsOpen()) return true;
  }

  back();
  sleep(rndInt(600, 1000));
  return !sharePanelIsOpen();
}

/**
 * Share the video by copying its link, which keeps everything inside TikTok.
 *
 * This is the riskiest thing the script does, for two separate reasons.
 *
 * The panel lists real people along the top, and pressing one sends them the
 * video as a private message. Every press in here goes through pressStrict,
 * which refuses to tap a position blindly, and the only thing we look for is
 * an exact match on "Copy link".
 *
 * And if the panel fails to close, every later swipe lands inside it and the
 * rest of the session is wasted. So we confirm it closed, and stop the session
 * if it did not.
 */
function doShare() {
  var node = findOnScreen(LABELS.share);
  if (!node) {
    noteMiss();
    log("  share: button not found");
    return false;
  }

  humanPause(250, 900);
  if (!pressNode(node)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(900, 1600));

  if (!sharePanelIsOpen(1200)) {
    log("  share: the panel did not open, skipping");
    return false;
  }

  var copied = false;
  var safe = findOnScreen(LABELS.share_sheet_safe_option, 1200);
  if (!safe) {
    log("  share: no Copy link in the panel, backing out without pressing");
  } else {
    humanPause(400, 1100);
    copied = pressStrict(safe);
    if (copied) {
      stats.share++;
      noteHit();
      log("  share: copied link");
    } else {
      log("  share: could not press it safely, leaving it alone");
    }
    sleep(rndInt(500, 1000));
  }

  if (!closeSharePanel()) {
    console.error("  share: the panel will not close - ending the session");
    console.error("  Set share to 0 in SETTINGS until this is sorted out.");
    state.stopRequested = true;
    return false;
  }

  return true;
}

/**
 * Send this video to one of our own accounts.
 *
 * This is the one thing the script does that reaches a person and cannot be
 * undone, so read the guards before changing anything here.
 *
 * The order matters. Nothing is pressed until the panel has been checked for a
 * selection that was already there, because this panel holds several people at
 * once and we have no way to see who is in it.
 */
function doSendToFriend() {
  var settings = SETTINGS.send_to_friend;
  // Who may receive a video: the explicit list if one is set, otherwise the
  // shared roster with our own name removed. state.friends is read live - it is
  // reassigned once by identity.js, so a local copy would go stale.
  var explicit = settings.send_to || [];
  var allowed = explicit.length ? explicit : (state.friends || []);
  if (allowed.length === 0) return false;

  var shareButton = findOnScreen(LABELS.share, 1200);
  if (!shareButton) {
    noteMiss();
    return false;
  }

  humanPause(300, 900);
  if (!pressStrict(shareButton)) {
    noteMiss();
    return false;
  }
  sleep(rndInt(1000, 1700));

  if (!sharePanelIsOpen(1200)) {
    log("  send: the panel did not open, skipping");
    return false;
  }

  // Nothing may be selected yet. If Send is already on screen then somebody is
  // in the selection, and since we cannot read who, adding our account to it
  // would send the video to them as well.
  if (findOnScreen(LABELS.share_send_button, 500)) {
    log("  send: somebody is already selected in the panel - backing out");
    closeSharePanel();
    return false;
  }

  // Read the row into one entry per person. TikTok draws two for each - the
  // full name and a shortened copy - so the first one seen wins and the rest
  // only add to the count.
  var band = LABELS.share_people_band;
  var items = screenItems();
  var people = [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.y < band[0] || it.y > band[1]) continue;
    if (it.className.indexOf("Button") < 0) continue;

    var name = tidyName(it.label);
    if (!name) continue;
    if (LABELS.share_not_people.test(name)) continue;       // a control, not a person
    if (state.selfName && name === tidyName(state.selfName)) continue;  // never ourselves
    if (nameIsOn(settings.never_send_to, name)) continue;   // blocked outright

    if (seen[name]) { seen[name].count++; continue; }
    seen[name] = { name: name, label: it.label, node: it.node, count: 1,
                   onList: nameIsOn(allowed, name) };
    people.push(seen[name]);
  }

  // Split into accounts we own and everybody else, because they are not
  // interchangeable: one is somewhere a mistake costs nothing, the other is a
  // real person who never asked to hear from a script.
  var onList = [], others = [];
  for (var p = 0; p < people.length; p++) {
    (people[p].onList ? onList : others).push(people[p]);
  }

  var target = null;
  var goingWide = settings.allow_anyone && others.length > 0 &&
                  chance(settings.chance_of_anyone);

  if (onList.length > 0 && !goingWide) {
    target = onList[rndInt(0, onList.length - 1)];
  } else if (goingWide) {
    target = others[rndInt(0, others.length - 1)];
    log('  send: going outside the list to "' + target.label + '"');
  } else if (onList.length > 0) {
    target = onList[rndInt(0, onList.length - 1)];
  }

  if (!target) {
    log("  send: nobody we may send to is in the panel on this video");
    closeSharePanel();
    return false;
  }

  // Two entries per person is normal. More than that means we are matching
  // something we have not understood, and the middle of an action that cannot
  // be undone is the wrong place to find out what.
  if (target.count > 2) {
    log("  send: " + target.count + ' entries match "' + target.label +
        '" - too ambiguous, backing out');
    closeSharePanel();
    return false;
  }

  var chosenName = target.label;
  var wasAt;
  try {
    wasAt = { x: target.node.bounds().centerX(), y: target.node.bounds().centerY() };
  } catch (e) {
    closeSharePanel();
    return false;
  }

  // Look again before pressing, and insist it is the same entry in the same
  // place. This is the only window in which the row could reorder under us,
  // and the cost of that would be a video sent to a stranger.
  humanPause(400, 900);
  var again = findSameButtonAgain(
    [function () { return descMatches("(?i)^" + escapeForMatch(chosenName) + "$"); },
     function () { return textMatches("(?i)^" + escapeForMatch(chosenName) + "$"); }],
    wasAt.x, wasAt.y, 40);

  if (!again) {
    log('  send: "' + chosenName + '" moved between looking and pressing');
    closeSharePanel();
    return false;
  }

  if (!pressStrict(again)) {
    log("  send: could not select " + chosenName + " properly");
    closeSharePanel();
    return false;
  }
  sleep(rndInt(1200, 2000));

  // Selecting somebody is what makes Send appear. No Send means nothing was
  // selected, and pressing on would be pressing blind.
  var send = findOnScreen(LABELS.share_send_button, 1500);
  if (!send) {
    log("  send: no Send button appeared - nothing was selected, backing out");
    closeSharePanel();
    return false;
  }

  // A moment to look at what is being sent, the way a person would. The
  // message box beside it is never touched.
  humanPause(600, 1600);

  var sent = pressStrict(send);
  if (!sent) {
    log("  send: could not press Send - backing out without sending");
    closeSharePanel();
    return false;
  }

  sleep(rndInt(1500, 2400));
  stats.sent++;
  noteHit();
  log("  send: sent this video to " + chosenName);

  // The panel usually closes itself once the video has gone. Make sure.
  if (sharePanelIsOpen(800) && !closeSharePanel()) {
    console.error("  send: the panel will not close - ending the session");
    state.stopRequested = true;
    return false;
  }

  return true;
}

module.exports = {
  doLike: doLike,
  doSave: doSave,
  doReadComments: doReadComments,
  doShare: doShare,
  doSendToFriend: doSendToFriend
};

/**
 * lib/seeding.js - telling TikTok what this account is interested in
 *
 * Searching for a topic and watching the results is the strongest signal we can
 * send about what an account cares about, which is the whole point of the farm.
 * Once a day is enough; several searches a day for the same words is not what a
 * person does.
 *
 * Every step is checked before the next one starts. A search that half works
 * leaves the script on a screen it cannot browse, and going back one press too
 * many leaves TikTok altogether - so this gives up and returns to the feed
 * rather than pressing on hopefully. See docs/WHAT-BROKE.md.
 */

var state = require("./state.js");
var util = require("./util.js");
var feed = require("./feed.js");
var actions = require("./actions.js");
var schedule = require("./schedule.js");
var LABELS = require("./labels.js").LABELS;

var SETTINGS = state.SETTINGS;
var stats = state.stats;
var log = state.log;

var rndInt = util.rndInt;
var chance = util.chance;
var rndFromRange = util.rndFromRange;
var isOnScreen = util.isOnScreen;
var findOnScreen = util.findOnScreen;
var pressNode = util.pressNode;
var pressStrict = util.pressStrict;
var tapNode = util.tapNode;
var humanPause = util.humanPause;

var aVideoIsPlaying = feed.aVideoIsPlaying;
var returnToFeed = feed.returnToFeed;
var swipeToNextVideo = feed.swipeToNextVideo;
var pickWatchMs = feed.pickWatchMs;
var watchFor = feed.watchFor;

var doLike = actions.doLike;

var loadState = schedule.loadState;
var saveState = schedule.saveState;
var todayKey = schedule.todayKey;

/** Should this session start by searching for our topic? */
function shouldSeedNow() {
  if (!SETTINGS.seed.enabled) return false;

  var keywords = SETTINGS.seed.keywords;
  if (!keywords || keywords.length === 0) return false;

  if (!SETTINGS.seed.once_per_day) return true;

  var plan = loadState();
  if (plan && plan.seeded_on === todayKey()) {
    log("Already searched for our topic today, skipping it");
    return false;
  }
  return true;
}

/**
 * Search for one of our topics and watch a few of the results.
 *
 * Every step is checked before the next one starts. A search flow that half
 * works leaves the script somewhere it cannot browse, so it is better to give
 * up and go back to the feed than to press on hopefully.
 */
function doSeedTopic() {
  var keywords = SETTINGS.seed.keywords;
  if (!keywords || keywords.length === 0) {
    log("  seed: no keywords set, skipping");
    return false;
  }

  var keyword = keywords[rndInt(0, keywords.length - 1)];
  log('  seed: searching for "' + keyword + '"');

  // --- open the search screen ---
  // This button does accept a proper press, unlike the one that sends the
  // search further down.
  var entry = findOnScreen(LABELS.search_entry, 800);
  if (!entry) {
    log("  seed: no Search button on the feed, skipping");
    return false;
  }
  try {
    if (entry.bounds().centerY() > device.height * 0.2) {
      log("  seed: the Search button is not where it should be, skipping");
      return false;
    }
  } catch (e) {
    return false;
  }

  if (!pressStrict(entry) && !tapNode(entry)) {
    log("  seed: could not open search");
    return false;
  }
  sleep(rndInt(1500, 2500));

  // --- type the keyword ---
  var box = null;
  try {
    var boxes = className("android.widget.EditText").find();
    for (var i = 0; i < boxes.length; i++) {
      if (isOnScreen(boxes[i])) { box = boxes[i]; break; }
    }
  } catch (e) { /* handled below */ }

  if (!box) {
    log("  seed: no search box found");
    returnToFeed();
    return false;
  }

  var typed = false;
  try { typed = box.setText(keyword); } catch (e) { /* handled below */ }
  if (!typed) {
    log("  seed: could not type into the search box");
    returnToFeed();
    return false;
  }
  sleep(rndInt(1200, 2200));

  // --- send it ---
  var submit = findOnScreen(LABELS.search_submit, 1000);
  if (!submit || !tapNode(submit)) {
    log("  seed: could not send the search");
    returnToFeed();
    return false;
  }
  sleep(rndInt(2000, 3000));

  // Suggestions disappearing is how we know the search went through. Do not
  // take a successful tap as proof.
  if (findOnScreen(LABELS.search_suggestions, 800)) {
    log("  seed: the search did not go through");
    returnToFeed();
    return false;
  }

  // --- open one of the results ---
  var results = [];
  try {
    var found = LABELS.search_result[0]().find();
    for (var j = 0; j < found.length; j++) {
      if (isOnScreen(found[j])) results.push(found[j]);
    }
  } catch (e) { /* handled below */ }

  if (results.length === 0) {
    log("  seed: no results on screen");
    returnToFeed();
    return false;
  }

  log("  seed: " + results.length + " result(s) showing");
  var pick = results[rndInt(0, Math.min(results.length, 4) - 1)];
  if (!pressNode(pick)) {
    log("  seed: could not open a result");
    returnToFeed();
    return false;
  }
  sleep(rndInt(2000, 3000));

  // Deliberately not onTheFeed here: we are inside the search results, which
  // is where we want to be. We only need to know a video actually came up.
  if (!aVideoIsPlaying()) {
    log("  seed: opening the result did not lead anywhere watchable");
    returnToFeed();
    return false;
  }

  // --- watch a few, then leave ---
  var toWatch = Math.round(rndFromRange(SETTINGS.seed.videos_to_watch));
  log("  seed: watching " + toWatch + " of them");

  for (var k = 0; k < toWatch && !state.stopRequested; k++) {
    watchFor(pickWatchMs());
    if (state.stopRequested) break;

    // Liking here is the point of the exercise: these are videos we chose.
    if (chance(state.activeRates.like)) doLike();

    humanPause(200, 900);
    swipeToNextVideo(false);
    sleep(rndInt(600, 1300));
  }

  if (!returnToFeed()) {
    console.error("  seed: could not get back to the feed - ending the session");
    state.stopRequested = true;
    return false;
  }

  stats.seeded++;
  saveState({ seeded_on: todayKey() });
  return true;
}

module.exports = {
  shouldSeedNow: shouldSeedNow,
  doSeedTopic: doSeedTopic
};

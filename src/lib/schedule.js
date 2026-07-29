/**
 * lib/schedule.js - what a day looks like, and the note left behind
 *
 * Three things that all answer to the calendar rather than to the screen: how
 * many sessions today gets, how gently a young account should behave, and the
 * file somebody reads later to find out how a phone has been getting on.
 *
 * The day's plan is kept in a file on the phone rather than in memory, because
 * the script is meant to be stopped and started. Losing the count would mean a
 * phone that browses its full allowance again every time somebody restarts it,
 * which is the opposite of what a daily limit is for.
 */

var state = require("./state.js");
var util = require("./util.js");

var SETTINGS = state.SETTINGS;
var stats = state.stats;
var log = state.log;

var chance = util.chance;
var rndFromRange = util.rndFromRange;

/** The time now, as "2026-07-22 18:57". */
function timestamp() {
  var d = new Date();
  function two(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
         " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

/**
 * Write down how this session went.
 *
 * A farm is a dozen phones nobody is looking at. Without this, the only record
 * of a session is a console on a screen in a drawer, and a phone that quietly
 * stopped working three days ago looks exactly like one that is fine.
 *
 * Kept small and bounded: the last session in full, plus a short history.
 */
function writeStatus(startedAt) {
  var summary = {
    device_id: SETTINGS.device_id || "(unnamed)",
    finished_at: timestamp(),
    ran_minutes: Number(((Date.now() - startedAt) / 60000).toFixed(1)),
    ended_because: state.endReason,
    videos: stats.videos,
    liked: stats.like,
    saved: stats.save,
    shared: stats.share,
    comments_read: stats.comments,
    replied: stats.replies,
    sent_to_friend: stats.sent,
    searched_topic: stats.seeded > 0,
    buttons_not_found: stats.misses
  };

  try {
    var previous = {};
    if (files.exists(SETTINGS.watchdog.status_file)) {
      try {
        previous = JSON.parse(files.read(SETTINGS.watchdog.status_file)) || {};
      } catch (e) {
        previous = {};   // a corrupted note is not worth stopping over
      }
    }

    var recent = previous.recent instanceof Array ? previous.recent : [];
    recent.unshift(summary);
    recent = recent.slice(0, SETTINGS.watchdog.keep_recent_sessions);

    files.write(SETTINGS.watchdog.status_file, JSON.stringify({
      device_id: summary.device_id,
      tiktok_package: state.tiktokPackage,
      account: state.selfName || null,
      last_session: summary,
      recent: recent
    }, null, 2));
  } catch (e) {
    console.warn("Could not write the status note: " + e);
  }
}

/** How many whole days since the account was created, or null if unknown. */
function accountAgeDays() {
  var started = SETTINGS.ramp_up.account_started;
  if (!started) return null;

  var parts = String(started).split("-");
  if (parts.length !== 3) {
    console.warn("account_started should look like 2026-07-22 - ignoring it");
    return null;
  }

  var then = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(then.getTime())) {
    console.warn("account_started is not a real date - ignoring it");
    return null;
  }

  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

/**
 * The rates to use right now. A young account gets the held-down rates from
 * the matching stage; anything older gets the full rates.
 */
function currentRates() {
  var age = accountAgeDays();
  if (age === null) return SETTINGS.rates;

  var stages = SETTINGS.ramp_up.stages;
  for (var i = 0; i < stages.length; i++) {
    if (age < stages[i].first_days) return stages[i].rates;
  }
  return SETTINGS.rates;
}

function describeRates(rates) {
  return "like " + (rates.like * 100) + "%, save " + (rates.save * 100) +
         "%, comments " + (rates.read_comments * 100) + "%, share " +
         (rates.share * 100) + "%";
}

/**
 * What the script remembers between runs.
 *
 * Without this, every restart would begin a fresh run of sessions. Android
 * restarts apps often enough that the phone would end up browsing far more
 * than intended, in bursts, which is exactly the shape we are avoiding.
 */
function loadState() {
  try {
    var path = SETTINGS.schedule.state_file;
    if (files.exists(path)) {
      var parsed = JSON.parse(files.read(path));
      if (parsed && parsed.day) return parsed;
    }
  } catch (e) {
    console.warn("Could not read the saved plan (" + e + ") - starting fresh");
  }
  return null;
}

/**
 * Save some fields, leaving anything else in the file alone.
 *
 * Two separate things write here - the daily plan, and the note that we have
 * already searched for our topic today. Replacing the whole file would mean
 * whichever wrote last wiped the other.
 */
function saveState(changes) {
  try {
    var current = loadState() || {};
    for (var key in changes) {
      if (changes.hasOwnProperty(key)) current[key] = changes[key];
    }
    files.write(SETTINGS.schedule.state_file, JSON.stringify(current));
  } catch (e) {
    console.warn("Could not save the plan (" + e + ")");
    console.warn("Sessions will not be counted across restarts.");
  }
}

/** Today's date as "2026-07-22", used to notice when a new day starts. */
function todayKey() {
  var now = new Date();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  return now.getFullYear() + "-" +
         (month < 10 ? "0" : "") + month + "-" +
         (day < 10 ? "0" : "") + day;
}

/** Decide how many sessions today gets, and remember it. */
function planForToday() {
  var planned = Math.round(rndFromRange(SETTINGS.schedule.sessions_per_day));
  var lazy = chance(SETTINGS.schedule.chance_of_lazy_day);

  if (lazy) {
    planned = Math.max(1, Math.round(planned / 3));
  }

  var plan = {
    day: todayKey(),
    planned_today: planned,
    sessions_today: 0,
    last_session_ended: 0,
    lazy_day: lazy,
    seeded_on: ""     // a new day means we may search for our topic again
  };

  saveState(plan);
  console.log("Plan for today: " + planned + " session(s)" +
              (lazy ? "  (a lazy day)" : ""));
  return plan;
}

/** Load today's plan, making a new one if the day has rolled over. */
function planForNow() {
  var plan = loadState();
  if (!plan || plan.day !== todayKey()) return planForToday();

  console.log("Today so far: " + plan.sessions_today + " of " +
              plan.planned_today + " session(s) done" +
              (plan.lazy_day ? "  (a lazy day)" : ""));
  return plan;
}

/** Is the clock inside one of the hours the account is meant to be awake? */
function isWithinActiveHours() {
  var hour = new Date().getHours();
  var windows = SETTINGS.schedule.active_hours;

  for (var i = 0; i < windows.length; i++) {
    if (hour >= windows[i][0] && hour < windows[i][1]) return true;
  }
  return false;
}

/**
 * Wait, but in small pieces, so a stop request is noticed quickly rather than
 * hours later.
 */
function waitQuietly(minutes, reason) {
  var until = Date.now() + minutes * 60 * 1000;
  var announced = false;

  while (Date.now() < until && !state.stopRequested) {
    if (!announced) {
      log("Waiting " + Math.round(minutes) + " min - " + reason);
      announced = true;
    }
    sleep(30000);
  }
}

module.exports = {
  timestamp: timestamp,
  writeStatus: writeStatus,
  accountAgeDays: accountAgeDays,
  currentRates: currentRates,
  describeRates: describeRates,
  loadState: loadState,
  saveState: saveState,
  todayKey: todayKey,
  planForToday: planForToday,
  planForNow: planForNow,
  isWithinActiveHours: isWithinActiveHours,
  waitQuietly: waitQuietly
};

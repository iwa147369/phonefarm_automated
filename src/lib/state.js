/**
 * lib/state.js - what every part of the script shares
 *
 * The counters for the session running now, the reason it will give for
 * stopping, and the few small helpers that read and write them.
 *
 * WHY THIS FILE EXISTS
 *
 * main.js used to keep all of this in ordinary variables at the top of one big
 * file, which worked because there was only one file. Now that the script is in
 * pieces, they need somewhere to live that every piece can reach.
 *
 * WHY IT IS PARKED ON global
 *
 * Because require() alone does not give one shared copy, whatever it looks
 * like. Two require() calls in the same file do hand back the same object - but
 * a require() inside a module has its own cache, so each module gets a fresh
 * copy of everything it asks for. Using the same absolute path does not help;
 * this was measured on a Galaxy A8+, and both spellings gave a fresh copy.
 *
 * That cost an evening. main.js set state.tiktokPackage, feed.js read its own
 * copy, saw null, and reported "Could not open TikTok" while TikTok sat open on
 * the screen. Every piece worked; nothing was shared.
 *
 * global is shared, and was measured to be. So the first file to load this
 * builds the object and parks it there, and every later loader finds it again.
 * One name on global, once, for the whole script.
 *
 * THE ONE RULE
 *
 *   Anything below that gets reassigned must always be reached through this
 *   object: state.endReason = "...", never a local copy of it.
 *
 * Taking a local copy of a number or a string and then assigning to it changes
 * the copy and leaves the real one alone. Nothing reports that. The script
 * would browse perfectly and then write down the wrong reason for stopping, or
 * count nothing at all.
 *
 * Objects are different: a local name for an object still points at the same
 * object, so `var stats = state.stats` is safe. That is only true while nothing
 * ever replaces `stats` with a new one - which is exactly why startSession()
 * below empties it in place instead of building a fresh one.
 *
 * tools/check-shared-state.sh enforces this rather than trusting anyone to
 * remember it.
 */

function buildState() {

  var settingsModule = require("./settings.js");
  var SETTINGS = settingsModule.SETTINGS;

  var state = {

    // ---- settings, passed through so a module needs one require, not two ----

    SETTINGS: SETTINGS,
    DEVICE_CONFIG_FILE: settingsModule.DEVICE_CONFIG_FILE,

    // ---- the session running now ----

    // Emptied in place at the start of each session, never replaced.
    stats: {
      videos: 0, like: 0, save: 0, share: 0, comments: 0, seeded: 0,
      replies: 0, sent: 0, back: 0, misses: 0
    },

    /** Set by the volume-up key. The session finishes the current video, then stops. */
    stopRequested: false,

    /** Why the session ended. Goes into the note left for whoever checks the farm. */
    endReason: "unknown",

    /**
     * How many button lookups have failed in a row.
     *
     * The run matters more than the total: one or two are normal while a video
     * loads, but eight in a row means TikTok has renamed something.
     */
    consecutiveMisses: 0,

    /** Which TikTok this phone has. Worked out once at startup. */
    tiktokPackage: null,

    /**
     * Which of our accounts this phone is running as, read off the Profile
     * screen once at startup. Null until identity.js has looked, or if the name
     * could not be read.
     */
    selfName: null,

    /** Every farm account, shared identically across all phones. */
    roster: null,

    /**
     * The accounts this phone may message: the roster with our own name taken
     * out. Reassigned by identity.js, so it must always be read as state.friends
     * - never copied into a local, or the copy goes stale. See the note above.
     */
    friends: null,

    /** The rates in force right now, which change as an account ages. */
    activeRates: null,

    /** Set once if a name ever has to be compared the crude way, so we say it once. */
    warnedAboutNames: false,

    // ---- the helpers that touch all of the above ----

    log: function (msg) {
      if (SETTINGS.verbose) console.log(msg);
    },

    /** Record that a button could not be found. */
    noteMiss: function () {
      state.stats.misses++;
      state.consecutiveMisses++;
    },

    /** Record that something worked, which ends any run of failures. */
    noteHit: function () {
      state.consecutiveMisses = 0;
    },

    /** Have we lost track of the buttons entirely? */
    buttonsSeemBroken: function () {
      return state.consecutiveMisses >= SETTINGS.watchdog.stop_after_missed_buttons;
    },

    /**
     * Clear everything ready for a new session.
     *
     * The counters are set back to zero one at a time rather than replaced with a
     * fresh object. That looks like the long way round and it is deliberate: a
     * new object would leave every part of the script still holding the old one,
     * writing into something nobody reads. The phone would browse and like
     * normally and report a session of nothing at all.
     */
    startSession: function () {
      var s = state.stats;
      s.videos = 0; s.like = 0; s.save = 0; s.share = 0; s.comments = 0;
      s.seeded = 0; s.replies = 0; s.sent = 0; s.back = 0; s.misses = 0;

      state.endReason = "unknown";
      state.consecutiveMisses = 0;
    }
  };

  return state;
}

// The first file to load this builds it; everybody after that finds it here.
module.exports = global.__farm_state || (global.__farm_state = buildState());

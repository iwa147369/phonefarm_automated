/**
 * probe_engines.js - what can a running script see about other running scripts?
 *
 * READ-ONLY. It starts nothing and stops nothing.
 *
 * WHY THIS EXISTS
 *
 * On 2026-07-23 farm-03 ran two sessions at once: one from 17:04 to 17:18,
 * another from 17:05 to 17:20. Both wrote to the same state file, so the
 * counter said 2 sessions when 5 had run, and the daily cap stopped meaning
 * anything.
 *
 * The fix is a lock: a second copy should see the first and step aside. But
 * before writing that, we need to know what "seeing the first" actually looks
 * like on this phone. There are two possible answers and they lead to very
 * different code:
 *
 *   1. AutoJs6 can list its own running scripts (engines.all()). If each one
 *      reports which file it came from, a second copy can recognise itself and
 *      quit. Nothing is written to disk, so there is no stale lock left behind
 *      by a crash or by the phone being switched off.
 *
 *   2. It cannot. Then the lock has to be a file holding a timestamp, kept
 *      fresh by whoever holds it and treated as abandoned once it goes quiet.
 *      That works, but a phone killed mid-session leaves a lock that has to
 *      time out before anything runs again.
 *
 * Option 1 is much better if it is real. This probe finds out.
 *
 * WHAT IS ALREADY KNOWN, from the first run of this probe
 *
 *   engines.all()                 works
 *   engines.myEngine()            works
 *   getSource().getFullPath()     gives "/sdcard/脚本/probe_engines.js"
 *
 * So scripts can be listed and named. What is NOT yet known is whether two
 * copies of the SAME file both appear and can be told apart. That is the whole
 * question, and it is what this version tests.
 *
 * HOW TO USE
 *
 *   Run it, then run it AGAIN within 40 seconds without stopping the first.
 *
 * The first run does not exit straight away - it waits and keeps looking, so
 * the second run has something to find. Both should end up reporting the
 * other.
 *
 * The first attempt at this probe finished in 0.046 seconds, far too quick for
 * a second copy to overlap with. That is why this one lingers.
 */

console.show();

/** How long to hang about, so a second copy has time to be started. */
var LINGER_SECONDS = 40;
var LOOK_EVERY_MS = 3000;

// ---------------------------------------------------------------- does it exist

console.log("");
console.log("=====================================");
console.log("WHAT THIS SCRIPT CAN SEE");
console.log("=====================================");

if (typeof engines === "undefined") {
  console.error("There is no 'engines' object at all on this build.");
  console.error("A lock will have to be a file. Stop here.");
  exit();
}

var me = null;
try {
  me = engines.myEngine();
} catch (e) {
  console.error("myEngine() FAILED - " + e);
  console.error("A lock will have to be a file. Stop here.");
  exit();
}

/**
 * Ask an engine which file it is running. Different AutoJs builds put this in
 * different places, so try each and report which one answered - the answer
 * decides what the real code is allowed to rely on.
 */
function sourceOf(engine) {
  var found = { how: "nothing worked", value: "" };
  try {
    var src = engine.getSource();
    if (src) {
      found.how = "getSource().toString()";
      found.value = String(src);
      try {
        if (src.getFullPath) {
          found.how = "getSource().getFullPath()";
          found.value = String(src.getFullPath());
        }
      } catch (e) { /* not on this build */ }
    }
  } catch (e) { /* not on this build */ }
  return found;
}

/** An id we can compare between two engines. */
function idOf(engine) {
  try {
    if (engine.getId) return String(engine.getId());
  } catch (e) { /* not on this build */ }
  try {
    if (engine.id !== undefined) return String(engine.id);
  } catch (e) { /* not on this build */ }
  return "(no id)";
}

var myId = idOf(me);
var mySource = sourceOf(me);

console.log("  my id      : " + myId);
console.log("  my source  : " + mySource.value);
console.log("  read via   : " + mySource.how);

if (!mySource.value) {
  console.error("");
  console.error("This engine cannot say which file it came from.");
  console.error("Copies cannot be told apart by name. A lock will have to be");
  console.error("a file. Stop here.");
  exit();
}

// ---------------------------------------------------------------- looking

/**
 * Everything running right now, split into "me" and "other copies of my own
 * file". Anything running a different script is counted but ignored - the
 * lock only ever cares about a second copy of itself.
 */
function look() {
  var out = { total: 0, twins: [], readFailed: false };
  var all;
  try {
    all = engines.all();
  } catch (e) {
    out.readFailed = true;
    return out;
  }

  out.total = all.length;
  for (var i = 0; i < all.length; i++) {
    var id = idOf(all[i]);
    if (id === myId) continue;                     // that is this script
    if (sourceOf(all[i]).value !== mySource.value) continue;   // different script
    out.twins.push(id);
  }
  return out;
}

var first = look();
if (first.readFailed) {
  console.error("engines.all() FAILED. A lock will have to be a file.");
  exit();
}

console.log("  running now: " + first.total +
            "  (other copies of this file: " + first.twins.length + ")");

// ---------------------------------------------------------------- lingering

console.log("");
console.log("=====================================");
console.log("WAITING " + LINGER_SECONDS + "s - START A SECOND COPY NOW");
console.log("=====================================");

var sawTwin = first.twins.length > 0;
var seenIds = {};
var i;
for (i = 0; i < first.twins.length; i++) seenIds[first.twins[i]] = true;

var until = Date.now() + LINGER_SECONDS * 1000;
while (Date.now() < until) {
  sleep(LOOK_EVERY_MS);
  var now = look();

  for (i = 0; i < now.twins.length; i++) {
    if (!seenIds[now.twins[i]]) {
      seenIds[now.twins[i]] = true;
      sawTwin = true;
      console.log("  another copy of this file appeared - id " + now.twins[i]);
    }
  }

  var left = Math.round((until - Date.now()) / 1000);
  if (left % 15 === 0 && left > 0) {
    console.log("  ... " + left + "s left, " + now.total + " script(s) running");
  }
}

// ---------------------------------------------------------------- verdict

console.log("");
console.log("=====================================");
console.log("VERDICT");
console.log("=====================================");

if (sawTwin) {
  console.log("  A second copy of this same file was seen, and its id was");
  console.log("  different from this one's.");
  console.log("");
  console.log("  So a copy CAN recognise another copy while it runs.");
  console.log("  The lock can live in memory: on start, look for another");
  console.log("  engine running the same path, and step aside if there is one.");
  console.log("  No lock file, and nothing left behind by a crash.");
} else {
  console.warn("  No second copy was ever seen.");
  console.warn("");
  console.warn("  If you did start one within the " + LINGER_SECONDS + "s, then");
  console.warn("  copies are invisible to each other and the lock must be a");
  console.warn("  file with a timestamp instead.");
  console.warn("");
  console.warn("  If you did not start one, this proves nothing - run it again");
  console.warn("  and start the second copy while this one is still waiting.");
}

console.log("");
console.log("Nothing was started or stopped.");

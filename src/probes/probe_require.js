/**
 * probe_require.js - can a script on the phone load a second file?
 *
 * It touches nothing outside its own folder. It writes two small test files,
 * tries to load them, and deletes them again.
 *
 * WHY THIS EXISTS
 *
 * main.js is 2800 lines in one file. Splitting it up is only possible if a
 * script running on the phone can load another file, and nothing in this
 * project has ever done that - there is not one require() anywhere in src/. So
 * the whole idea rests on an assumption nobody has tested on these phones.
 *
 * Five things have to be true before any splitting starts, and each one changes
 * what the split would look like:
 *
 *   1. require() exists at all.
 *   2. It finds a file sitting next to the script. If not, every module needs
 *      an absolute path, and the folder on the phone can never move.
 *   3. It finds a file in a subfolder, so modules can live in their own place
 *      rather than being scattered through /sdcard/脚本 next to the probes.
 *   4. Loading the same module twice gives back the same object - and read the
 *      warning below about what this probe can and cannot tell you here.
 *   5. A missing module fails in a way we can catch. Pushing seven files
 *      instead of one means a push can arrive half-finished, and a phone that
 *      runs on stale modules while looking perfectly healthy is the exact
 *      failure this project keeps being bitten by.
 *
 * A "no" to 1 or 2 means the split has to happen on the laptop instead, with
 * the pieces joined into one file at deploy time.
 *
 * HOW TO USE
 *
 *   ./tools/run.sh probe_require.js <phone id>
 *
 * Nothing needs to be open. Read the VERDICT at the end.
 */

console.show();

console.log("");
console.log("=====================================");
console.log("WHERE THIS SCRIPT IS");
console.log("=====================================");

/** The folder this script was started from, or null if it cannot say. */
function myFolder() {
  try {
    var full = String(engines.myEngine().getSource().getFullPath());
    var cut = full.lastIndexOf("/");
    if (cut < 0) return null;
    console.log("  this file : " + full);
    return full.substring(0, cut);
  } catch (e) {
    console.warn("  cannot read own path: " + e);
    return null;
  }
}

var HERE = myFolder();
if (!HERE) {
  console.error("");
  console.error("Without its own path this probe cannot write test files where");
  console.error("they need to be. Stop here.");
  exit();
}

console.log("  folder    : " + HERE);

try {
  console.log("  working dir: " + files.cwd());
} catch (e) {
  console.log("  working dir: cannot read it (" + e + ")");
}

// ---------------------------------------------------------------- test files

var SIBLING = HERE + "/probe_tmp_module.js";
var SUBFOLDER = HERE + "/probe_tmp_lib";
var IN_SUBFOLDER = SUBFOLDER + "/probe_tmp_module.js";

/**
 * A module that reports what it can see from inside itself.
 *
 * `counter` matters as much as `where`: raising it through one handle and
 * reading it through another is how we find out whether two require() calls
 * share one object or make two.
 */
function moduleText(where) {
  return "" +
    "var seesDevice = false;\n" +
    "try { seesDevice = (typeof device !== 'undefined'); } catch (e) { }\n" +
    "module.exports = {\n" +
    "  where: '" + where + "',\n" +
    "  seesDevice: seesDevice,\n" +
    "  counter: 0\n" +
    "};\n";
}

var wrote = true;
try {
  files.write(SIBLING, moduleText("sibling"));
} catch (e) {
  wrote = false;
  console.error("Could not write the test file: " + e);
}

// The subfolder is a nice-to-have, not a reason to stop: if it cannot be made,
// the answer is simply that modules have to sit flat beside the script.
var madeSubfolder = true;
try {
  if (files.createWithDirs) files.createWithDirs(IN_SUBFOLDER);
  else files.ensureDir(IN_SUBFOLDER);
  files.write(IN_SUBFOLDER, moduleText("subfolder"));
} catch (e) {
  madeSubfolder = false;
  console.warn("Could not make the test subfolder: " + e);
}

/** Take the test files away again, whatever happened. */
function tidyUp() {
  try { files.remove(SIBLING); } catch (e) { }
  try { files.remove(IN_SUBFOLDER); } catch (e) { }
  try { files.removeDir(SUBFOLDER); } catch (e) { }

  var left = [];
  try { if (files.exists(SIBLING)) left.push(SIBLING); } catch (e) { }
  try { if (files.exists(IN_SUBFOLDER)) left.push(IN_SUBFOLDER); } catch (e) { }

  if (left.length > 0) {
    console.warn("");
    console.warn("These test files could not be deleted - remove them by hand:");
    for (var i = 0; i < left.length; i++) console.warn("  " + left[i]);
  } else {
    console.log("");
    console.log("Test files cleaned up.");
  }
}

if (!wrote) {
  tidyUp();
  exit();
}

// ---------------------------------------------------------------- does it exist

console.log("");
console.log("=====================================");
console.log("IS THERE A require() AT ALL");
console.log("=====================================");

var haveRequire = false;
try { haveRequire = (typeof require === "function"); } catch (e) { }

console.log("  require : " + (haveRequire ? "exists" : "MISSING"));

if (!haveRequire) {
  console.error("");
  console.error("This build cannot load a second file. main.js has to stay one");
  console.error("file on the phone; any splitting has to be joined back together");
  console.error("on the laptop before it is pushed.");
  tidyUp();
  exit();
}

// ---------------------------------------------------------------- which paths

console.log("");
console.log("=====================================");
console.log("WHICH WAYS OF NAMING A FILE WORK");
console.log("=====================================");

/** Try one way of naming a module. Never throws; reports instead. */
function tryPath(label, path) {
  var got;
  try {
    got = require(path);
  } catch (e) {
    console.log("  " + label + "  ->  no (" + e + ")");
    return null;
  }

  if (!got || !got.where) {
    console.log("  " + label + "  ->  loaded, but exported nothing we recognise");
    return null;
  }

  console.log("  " + label + "  ->  YES, loaded the " + got.where + " file");
  return got;
}

console.log("");
console.log("  a file sitting next to this one:");
var sibling = tryPath("'./probe_tmp_module.js'   ", "./probe_tmp_module.js");
if (!sibling) sibling = tryPath("'probe_tmp_module.js'     ", "probe_tmp_module.js");
if (!sibling) sibling = tryPath("'./probe_tmp_module'      ", "./probe_tmp_module");
if (!sibling) sibling = tryPath("full path                 ", SIBLING);

console.log("");
console.log("  a file in a subfolder:");
var nested = null;
if (!madeSubfolder) {
  console.log("  skipped - the subfolder could not be created");
} else {
  nested = tryPath("'./probe_tmp_lib/...'     ", "./probe_tmp_lib/probe_tmp_module.js");
  if (!nested) nested = tryPath("'probe_tmp_lib/...'       ", "probe_tmp_lib/probe_tmp_module.js");
  if (!nested) nested = tryPath("full path                 ", IN_SUBFOLDER);
}

// ---------------------------------------------------------------- one copy?

console.log("");
console.log("=====================================");
console.log("IS A MODULE SHARED, OR COPIED");
console.log("=====================================");

var shared = null;
if (sibling) {
  sibling.counter = 41;

  var again = null;
  try { again = require("./probe_tmp_module.js"); } catch (e) { }
  if (!again) { try { again = require(SIBLING); } catch (e) { } }

  if (!again) {
    console.warn("  could not load it a second time to compare");
  } else {
    again.counter++;
    shared = (sibling.counter === 42);
    console.log("  set to 41 through one handle, added 1 through the other");
    console.log("  first handle now reads: " + sibling.counter);
    console.log("  " + (shared ? "SHARED - both handles are the same object"
                               : "COPIED - each require() makes a new one"));
  }

  console.log("");
  console.log("  can the module see the phone (device, console, and so on)? " +
              (sibling.seesDevice ? "yes" : "NO"));

  console.warn("");
  console.warn("  READ THIS. Both of those require() calls were made from this");
  console.warn("  one file, and that is the only case they prove. A require()");
  console.warn("  made INSIDE a module has its own cache: it hands that module a");
  console.warn("  fresh copy, even for the same absolute path. So \"shared\" here");
  console.warn("  does not mean one copy for the whole script.");
  console.warn("");
  console.warn("  Measured on a Galaxy A8+ after this probe first said otherwise,");
  console.warn("  and it cost an evening: main.js set a value, another module read");
  console.warn("  its own copy and saw null. Anything that must be shared between");
  console.warn("  modules goes on global - see lib/state.js.");
}

// ---------------------------------------------------------------- when missing

console.log("");
console.log("=====================================");
console.log("WHAT HAPPENS WHEN A MODULE IS ABSENT");
console.log("=====================================");

var missingThrows = false;
try {
  require("./probe_tmp_no_such_file.js");
  console.warn("  requiring a missing file returned quietly - nothing was thrown");
  console.warn("  A half-finished push would go unnoticed. Any check for");
  console.warn("  missing modules has to test the result, not trust a throw.");
} catch (e) {
  missingThrows = true;
  console.log("  it throws, and the throw can be caught:");
  console.log("    " + e);
}

// ---------------------------------------------------------------- verdict

tidyUp();

console.log("");
console.log("=====================================");
console.log("VERDICT");
console.log("=====================================");

if (!sibling && !nested) {
  console.error("  require() exists but loaded nothing. Splitting main.js into");
  console.error("  files on the phone is not possible on this build.");
} else {
  console.log("  Splitting main.js into separate files on the phone works.");
  console.log("");
  console.log("  next to the script : " + (sibling ? "yes" : "no"));
  console.log("  in a subfolder     : " + (nested ? "yes" : "no - keep modules flat"));
  console.log("  shared object      : " + (shared === null ? "unknown"
                                          : shared ? "yes - state can live in a module"
                                                   : "no - pass state in as an argument"));
  console.log("  missing module     : " + (missingThrows ? "throws, so deploy can be checked"
                                          : "silent - deploy needs its own check"));
}

console.log("");
console.log("TikTok was not touched.");

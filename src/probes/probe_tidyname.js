/**
 * probe_tidyname.js - check that cleaning a name works on the phone
 *
 * WHY
 *
 * Account names in the inbox arrive with an invisible character in front of
 * them, so they have to be cleaned before they can be compared against the
 * reply_to list. The first attempt wrote that cleaning as a regular expression
 * made out of the invisible characters themselves:
 *
 *     .replace(/[<invisible characters>]/g, "")
 *
 * On a laptop it did exactly the right thing. On the phone it deleted the whole
 * name, every time, and the log filled up with empty strings. Nobody could see
 * the difference by reading the line, because there is nothing to see.
 *
 * This tries the same job written two ways - with the characters themselves,
 * and with \u escapes that spell out their numbers - and says which survives.
 *
 * It touches nothing and needs no particular screen. Run it from anywhere.
 */

console.show();

// The way it was written. The class below looks empty and is not.
function tidyLiteral(name) {
  if (!name) return "";
  return String(name)
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The same characters, spelled out by number.
function tidyEscaped(name) {
  if (!name) return "";
  return String(name)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Exactly what the inbox hands us: a left-to-right mark, then the name.
var LTR = String.fromCharCode(0x200E);
var cases = [
  { screen: LTR + "minhchiune",          config: "minhchiune" },
  { screen: LTR + "Nguyễn Anh Phong Hồ", config: "Nguyễn Anh Phong Hồ" },
  { screen: LTR + "Watch Narrative",     config: "watch narrative" },
  { screen: "  Spaced  Out  ",           config: "spaced out" }
];

function report(title, fn) {
  console.log("");
  console.log("--- " + title + " ---");
  var passed = 0;
  for (var i = 0; i < cases.length; i++) {
    var fromScreen = fn(cases[i].screen);
    var fromConfig = fn(cases[i].config);
    var ok = fromScreen === fromConfig && fromScreen.length > 0;
    if (ok) passed++;
    console.log("  " + (ok ? "ok  " : "FAIL") +
                '  screen -> "' + fromScreen + '"' +
                '   config -> "' + fromConfig + '"');
  }
  console.log("  " + passed + " of " + cases.length + " matched");
  return passed;
}

console.log("=====================================");
console.log("Cleaning names, two ways");
console.log("=====================================");

var literal = report("characters written into the pattern", tidyLiteral);
var escaped = report("the same characters, spelled by number", tidyEscaped);

console.log("");
console.log("=====================================");
if (escaped === cases.length && literal < cases.length) {
  console.log("RESULT: spelling them by number works, writing them does not.");
  console.log("That is the bug, and the fix.");
} else if (escaped === cases.length && literal === cases.length) {
  console.log("RESULT: both work here. The empty names came from somewhere");
  console.log("else, and this was the wrong thing to suspect.");
} else {
  console.error("RESULT: neither works. Cleaning names needs rethinking, not");
  console.error("rewriting - see what each line above actually produced.");
}
console.log("=====================================");

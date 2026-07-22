/**
 * probe.js - find out what the TikTok buttons are called
 *
 * Android gives every button on screen a text label. This script prints all of
 * them for whatever is currently on screen. We need these labels before the
 * main script can press anything.
 *
 * How to use:
 *   1. Open TikTok and stop on any video in the For You feed.
 *   2. Switch to AutoJs6 and run this script.
 *   3. You have 5 seconds to switch back to TikTok.
 *   4. Read the output, and copy the labels into main.js.
 *
 * Run it again on the share sheet (press Share first) to get those labels too.
 */

auto.waitFor();

var DELAY_BEFORE_SCAN_MS = 5000;
var MAX_DEPTH = 40;

console.show();
console.log("Switch to TikTok now. Scanning in 5 seconds...");
sleep(DELAY_BEFORE_SCAN_MS);

var pkg = currentPackage();
console.log("=====================================");
console.log("App on screen : " + pkg);
console.log("Screen size   : " + device.width + " x " + device.height);
console.log("Android        : " + device.release + " (API " + device.sdkInt + ")");
console.log("Device         : " + device.brand + " " + device.model);
console.log("=====================================");

var root = auto.root;
if (!root) {
  console.error("Could not read the screen. Check that AutoJs6 has accessibility permission.");
  exit();
}

var lines = [];
var interesting = [];

function describe(node, depth) {
  var desc = node.desc();
  var text = node.text();
  var id = node.id();
  var cls = node.className() || "";

  // Only keep nodes that carry a label or can be pressed - the rest is layout noise.
  var hasLabel = (desc && desc !== "null") || (text && text !== "");
  if (!hasLabel && !node.clickable()) return null;

  var b = node.bounds();
  var parts = [];
  parts.push(new Array(depth + 1).join("  "));
  parts.push(cls.replace("android.widget.", "").replace("androidx.", ""));
  if (desc && desc !== "null") parts.push('desc="' + desc + '"');
  if (text && text !== "") parts.push('text="' + text + '"');
  if (id) parts.push("id=" + id);
  if (node.clickable()) parts.push("[clickable]");
  if (node.selected()) parts.push("[selected]");
  parts.push("(" + b.centerX() + "," + b.centerY() + ")");

  return parts.join(" ");
}

function walk(node, depth) {
  if (!node || depth > MAX_DEPTH) return;

  var line = describe(node, depth);
  if (line) {
    lines.push(line);
    // Flag the buttons we actually care about.
    var label = ((node.desc() || "") + " " + (node.text() || "")).toLowerCase();
    if (/like|comment|share|favorit|bookmark|save|follow|profile/.test(label)) {
      interesting.push(line.trim());
    }
  }

  var children = node.children();
  for (var i = 0; i < children.length; i++) {
    walk(children[i], depth + 1);
  }
}

walk(root, 0);

console.log("--- FULL SCREEN CONTENTS (" + lines.length + " items) ---");
for (var i = 0; i < lines.length; i++) {
  console.log(lines[i]);
}

console.log("");
console.log("=====================================");
console.log("--- LIKELY ACTION BUTTONS ---");
console.log("These are the ones to copy into main.js:");
console.log("=====================================");
if (interesting.length === 0) {
  console.log("(none found - the screen may not be the video feed, or TikTok is");
  console.log(" not exposing labels on this version)");
} else {
  for (var j = 0; j < interesting.length; j++) {
    console.log(interesting[j]);
  }
}

// Best effort: also save to a file so it is easier to copy out.
try {
  var path = "/sdcard/tiktok_probe.txt";
  files.write(path, lines.join("\n"));
  console.log("");
  console.log("Saved a copy to " + path);
} catch (e) {
  console.log("");
  console.log("Could not save to file (" + e + "). Copy from this screen instead.");
}

console.log("");
console.log("Done. Scroll up to read everything.");

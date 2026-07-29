/**
 * lib/labels.js - what TikTok's buttons are called
 *
 * This file holds no logic at all. It is a list of names, kept apart from the
 * code because it is the part that goes out of date: TikTok renames a button,
 * everything stops working, and somebody has to come here and fix it. Having it
 * on its own means that person does not have to read 2800 lines of machinery
 * first.
 *
 * To update it, run probe.js on a phone where main.js cannot find a button, and
 * copy what it prints into the matching entry below.
 *
 * The functions it uses to build matchers - descMatches and textMatches - come
 * from AutoJs6 itself and are there without being asked for.
 */

// Each entry is a list of things to try, in order. The first one that matches
// wins. Several options are listed because TikTok words these differently
// between app versions.
//
// "(?i)" at the start means upper and lower case both match.

// Checked against TikTok 46.1.3 (package com.ss.android.ugc.trill) on an
// English phone. The real labels look like this:
//
//   Like       "Like video. 5,142 likes"
//   Comment    "Read or add comments. 27 comments"
//   Favorites  "Add or remove this video from Favorites."
//   Share      "Share video. 116 shares"
//   Follow     "Follow <creator name>"
//
// Note we never match on the id. TikTok scrambles its ids on every release,
// and it gives the Like and Share buttons the *same* id, so ids are useless
// here. The spoken labels are stable and readable, so we use those.

/**
 * Turn patterns into the list of matchers findOnScreen expects.
 *
 * A bare pattern is tried against the spoken description first and the visible
 * text second. "d:" restricts it to the description, "t:" to the text.
 *
 * That distinction is not decoration. On the search screen two different
 * buttons are both called "Search", and which one you get depends entirely on
 * whether you asked for desc or text - see docs/WHAT-BROKE.md.
 */
function labels() {
  var out = [];
  for (var i = 0; i < arguments.length; i++) {
    var p = arguments[i];
    if (p.indexOf("d:") === 0)      out.push(matching(descMatches, p.substring(2)));
    else if (p.indexOf("t:") === 0) out.push(matching(textMatches, p.substring(2)));
    else {
      out.push(matching(descMatches, p));
      out.push(matching(textMatches, p));
    }
  }
  return out;
}

function matching(how, pattern) {
  return function () { return how(pattern); };
}

var LABELS = {
  // Matches both states. Whether it is already liked is checked separately,
  // because we must never turn someone's like back off.
  like: labels("d:(?i)^(un)?like video\\b.*", "d:(?i)^(un)?like\\b.*"),

  // How to tell a video is already liked. Confirmed by pressing the button and
  // watching what changed:
  //
  //   not liked  ->  desc "Like video. 186 likes"   selected false
  //   liked      ->  desc "Like"                    selected true
  //
  // Note the trap: TikTok does NOT say "Unlike". It shortens the label to just
  // "Like" and drops the count. A check looking for the word "unlike" would see
  // a liked video as unliked, press the button, and take the like back off.
  //
  // "selected" is the signal we trust; this pattern is the backstop.
  already_liked: /^like$/i,

  save: labels(
    "d:(?i)^add or remove this video from favou?rites.*",
    "d:(?i).*\\bfavou?rites?\\b.*"),

  // The Favorites label is deliberately neutral - "Add or remove this video
  // from Favorites." reads the same whether or not the video is saved, so it
  // can never tell us the state. Only "selected" can, and doSave relies on it.
  // This pattern is here for TikTok versions that do word the two differently.
  already_saved: /^remove\b|\b(saved|favou?rited)\b/i,

  share: labels("d:(?i)^share video\\b.*", "d:(?i)^share\\b.*"),

  // ---- Inside the Share panel ----
  //
  //   71%  "Send to", Search, Close
  //   79%  real account names - pressing one messages them
  //   87%  Repost, COPY LINK, Messenger, WhatsApp, Facebook, Telegram, SMS
  //   96%  Report, Not interested, Download, Add to Story, Promote, Cast
  //
  // Only "Copy link" is safe here. The two rows are 8% apart, about 220
  // pixels, which is why nothing in this panel is pressed by position.

  // Present only while the panel is open, so it tells us whether it opened,
  // and more importantly whether it closed again.
  share_panel_marker: labels("d:(?i)^bottom sheet$"),

  // The X in the top corner of the panel. This is how we get out: the back
  // action does not close it on Android 16.
  share_panel_close: labels("(?i)^close$"),

  // The one safe thing to press. Matched exactly - no "contains" - so it can
  // never drift onto a neighbouring item.
  share_sheet_safe_option: labels("(?i)^copy link$"),

  // ---- Sending a video to one of our own accounts ----
  //
  // Once somebody is chosen the panel grows a message box at 86%, emoji at
  // 91%, and "Send" at 96%. Choosing is not sending; Send is a second press.
  //
  // We match names, never positions, and we cannot read who is selected - so
  // the guard is that Send must be ABSENT when the panel opens. See
  // docs/WHAT-BROKE.md, "Sending to a person".

  // Only appears once at least one person is chosen. Its absence when the
  // panel opens is what tells us nothing is selected yet.
  share_send_button: labels("(?i)^send$"),

  // Never touched. Listed so it can be recognised and avoided.
  share_message_box: labels("t:(?i)^write a message.*", "d:(?i)^write a message.*"),

  // How far down the screen the people sit, as a percentage. The two builds put
  // the row in different places: com.ss.android.ugc.trill has it low, at 72-86%,
  // with the row of app icons below; com.zhiliaoapp.musically has it higher, at
  // about 62-68%, and the app icons take the 72-86% that used to be people
  // (measured on a Galaxy A8+ by probe_capture_names.js). A band that only
  // covered 72-86% read the app icons as the people on musically and found
  // nobody to send to - "Iwa" sat at 64%, just above it. The band now spans both
  // rows, and share_not_people below drops anything in that span that is not an
  // account. The real safety is still the exact-name match against send_to.
  share_people_band: [58, 88],

  // Buttons that live in the people band but are controls or app targets, not
  // accounts. Dropped so a "send to anyone" run can never pick one, and so the
  // count of real people is honest. Names on send_to are matched exactly and are
  // never any of these, so a genuine recipient is never removed by mistake.
  share_not_people: new RegExp(
    "^(add person|invite friends|create group|why this post|captions|duet|" +
    "stitch|save|repost|report|not interested|download|add to story|promote|" +
    "cast|copy link|story|search|send|more|sms|email|messenger|whatsapp|" +
    "telegram|twitter|instagram|facebook|line|zalo|messages)\\b", "i"),

  // ---- The Comments panel ----
  //
  //   34%   "236 comments", Close
  //   36%   the list starts, with Reply buttons and hearts mixed through it
  //   93%   the list ends
  //   97%   "Add comment...", Stickers, Mention someone, Send Gift
  //
  // We read and never write. The hearts carry no readable name, so they cannot
  // even be recognised to be avoided - and Send Gift spends real money. Inside
  // this panel we scroll and never tap. See docs/WHAT-BROKE.md.

  // Unlike the Share panel, this one has no "Bottom sheet" marker. The text
  // box is what gives it away - nothing else on screen says "Add comment".
  comment_panel_marker: labels("t:(?i)^add comment.*", "d:(?i)^add comment.*"),

  comment_panel_close: labels("(?i)^close$"),

  comments: labels("d:(?i)^read or add comments\\b.*", "d:(?i).*\\bcomments?\\b.*"),

  // ---- Searching for a topic ----
  //
  // Two buttons called "Search" on one screen, told apart by desc versus text.
  // The submit one reports clickable=true and then refuses a proper press, so
  // it gets a coordinate tap; opening search accepts one normally.
  // See docs/WHAT-BROKE.md, "Some buttons refuse a proper press".

  // The magnifying glass at the top of the feed. The Share panel has a button
  // called "Search" too, so this is only ever looked for near the top.
  search_entry: labels("(?i)^search$"),

  // The button that sends the search, beside the box. Matched on text, because
  // the magnifying glass beside it is the one carrying the desc.
  search_submit: labels("t:(?i)^search$"),

  // Only on screen while TikTok is still offering suggestions, so it tells us
  // whether the search actually went through.
  search_suggestions: labels("t:(?i)^press and hold on a suggestion.*"),

  // A result on the search results screen. The two TikTok builds do not agree
  // on what a result even is, so both are listed and whichever matches wins.
  //
  // On com.ss.android.ugc.trill each result is one node carrying the whole
  // thing: "Video by <creator>, <caption>, Liked by 39.1K users".
  //
  // On com.zhiliaoapp.musically there is no such label anywhere. A result is a
  // cell built from several separate buttons - the caption, the account name,
  // the date, and the play count - and the play count is the only one of them
  // with a shape worth matching: "x17.6K", one per result. Measured on a Galaxy
  // A8+ by probe_search_result.js, which also pressed it and watched a video
  // open. The caption would work too, but its text is whatever somebody typed.
  //
  // The digits are spelled out as [0-9] rather than written \d, and that is not
  // a style choice. These patterns are ordinary strings, and the first version
  // of this line reached the phone holding a single backslash - which
  // JavaScript reads as a plain "d". The pattern quietly became "x followed by
  // the letters d, dot or comma" and matched nothing at all, while looking
  // perfectly correct in the file. Spelling it out cannot fail that way.
  search_result: labels("d:(?i)^video by .*", "(?i)^x[0-9.,]+[kmb]?$"),

  // ---- Knowing we are on the For You feed ----
  //
  // "For You" names the feed and appears nowhere else. Not the Like button -
  // every player has one - and not "Search", which the search screen also has.
  // Both mistakes were made; see docs/WHAT-BROKE.md, "Knowing where we are".
  feed_marker: labels("(?i)^for you$"),

  // ---- The Inbox and one conversation ----
  //
  // The top of the list is not people - "New followers" and "Activity" come
  // first - so names are matched against reply_to rather than taken by
  // position. An unread row carries a small View whose label is a NUMBER, and
  // a preview that does not start with "Sent". Matching the badge by size
  // instead marks every row unread. See docs/WHAT-BROKE.md.

  inbox_tab: labels("(?i)^inbox$"),

  home_tab: labels("(?i)^home$"),

  // ---- Our own profile ----
  //
  // The Profile tab in the bottom nav, and the things at the top of the profile
  // that are NOT our display name.
  //
  // A phone reads its own display name off this screen so it knows which of our
  // accounts it is, and can message everyone on the shared roster except itself.
  // Measured on a Galaxy A8+ running com.zhiliaoapp.musically (2026-07-29) with
  // probe_self_name.js: the tab is labelled "Profile"; the display name is the
  // item sitting directly above the "@handle" and centred under it.
  //
  // The name is found relative to the @handle rather than by a fixed position,
  // because position moves between builds. profile_not_name lists what shares
  // that region and must not be mistaken for the name - "Edit" in particular
  // sits at the very same height as it.
  profile_tab: labels("(?i)^profile$", "(?i)^me$"),

  profile_not_name: /^(profile photo|create a story|edit|add bio|add friends?|add person|share|profile menu|following|followers|friends|likes|tiktok studio|creator tools|for you|community|discover|home|inbox|create|search|[0-9][0-9.,]* profile views?)$/i,

  // Rows that look like conversations and are not. Opening any of these takes
  // us to a different screen entirely.
  not_a_conversation: /^(new followers|activity|system notifications|account not found)$/i,

  // A display name we cannot tell apart from any other. TikTok shows "User" for
  // accounts that never set a name, and several rows can say it at once.
  unusable_name: /^(user|users)$/i,

  // Labels TikTok forgot to turn into words. Instead of a description, the app
  // hands us the name of the thing in its own code:
  //
  //   "activebadgeis_active"        a badge saying somebody is online
  //   "storybadgenone_trueicon"     a badge on the story ring
  //   "@2131823255"                 a heart on a comment
  //
  // They are never a name and never a message, but they sit in the same rows,
  // and one of them was picked up as an account name. Skipped on sight.
  internal_label: /^@?\d+$|badge|_active\b|icon$/i,

  // A row's preview line. Ours, so the conversation has nothing new in it.
  outgoing_preview: /^sent\b/i,

  // ---- Inside a conversation ----
  //
  //   93%  Heart  Lol  ThumbsUp  Effects  Cards
  //   97%  "Message..."
  //
  // The bar is there by default and vanishes only when the message box takes
  // focus - so the rule that keeps it available is the rule that keeps us safe:
  // never touch the box. All five report clickable=false with a clickable
  // parent one level up, so pressStrict handles them. Never by position; that
  // is what sent two stickers nobody asked for. See docs/WHAT-BROKE.md.

  quick_send: {
    Heart:    labels("^Heart$"),
    Lol:      labels("^Lol$"),
    ThumbsUp: labels("^ThumbsUp$")
  },

  // Used to check the bar is fully drawn before we press anything on it. Only
  // the three we might send are listed, and on purpose: the bar's last two
  // buttons differ by build - "Effects" and "Cards" on com.ss.android.ugc.trill,
  // "nudge" and "Streak Pet" on com.zhiliaoapp.musically (measured on a Galaxy
  // A8+ by probe_conversation_header.js). Demanding the build-specific two made
  // the check fail on the farm and no reply ever went out. All five draw in the
  // same row at the same moment, so seeing the three stable ones is proof the
  // bar has arrived - and those three are the only ones ever pressed.
  quick_send_all: ["Heart", "Lol", "ThumbsUp"],

  // The message box. We look for it to confirm we are in a conversation, and to
  // confirm the keyboard is shut - and then we leave it alone.
  message_box: labels("t:(?i)^message\\.*$", "d:(?i)^message\\.*$"),

  // A sticker already in the conversation. Counting these before and after is
  // how we know a press sent one thing and not two.
  sent_sticker: labels("(?i)^stickers$"),

  // If any of these appear, something needs a human. We stop.
  stop_signals: labels(
    "t:(?i).*(log in|sign up) to tiktok.*",
    "t:(?i).*verify.*you.*human.*",
    "t:(?i).*too many attempts.*")
};

// TikTok ships under different package names by region. We try each in turn.
var TIKTOK_PACKAGES = [
  "com.zhiliaoapp.musically",   // TikTok, most countries
  "com.ss.android.ugc.trill",   // TikTok, some Asian regions
  "com.ss.android.ugc.tiktok"
];

module.exports = {
  LABELS: LABELS,
  TIKTOK_PACKAGES: TIKTOK_PACKAGES
};

# What broke, and why the code looks the way it does

Every rule in `src/main.js` is here because something went wrong first. This
file is the reason each one exists. The code points back here instead of
retelling the whole story in place.

If you are about to "simplify" something in the script, look for it here first.
Most of the odd-looking parts are load-bearing.

---

## The rule underneath all the others

**Check the result with something other than the action itself.**

A press reports whether Android delivered a tap. It says nothing about what the
app did with it. Every action in the script therefore proves it worked by
looking at something else afterwards - a count, a label, a marker on screen.

Six out of six guesses at button names were wrong before anything was written.
So: measure with a probe, write the code afterwards, then check the result a
third way.

---

## Screen layout traps

### The Like and Share buttons share an id

TikTok scrambles its internal ids on every release, and it gives Like and Share
the *same* one. Ids are useless here. Everything is matched on the spoken label
instead, which is stable and readable.

### There are two of every button

The next video is loaded off-screen before you reach it, so the tree holds two
Like buttons, two Share buttons, and so on. Reading the wrong one gives the
wrong video's numbers.

`isOnScreen()` filters to what is actually visible.

### A liked video says "Like", not "Unlike"

| state | label | selected |
|---|---|---|
| not liked | `Like video. 186 likes` | false |
| liked | `Like` | true |

A check looking for the word "unlike" sees a liked video as unliked, presses the
button, and **takes the like back off**. The `selected` flag is the signal we
trust; the label pattern is a backstop.

### Favorites reports no state at all

`Add or remove this video from Favorites.` reads the same either way. Only
`selected` can tell us, so `doSave` depends on it. Counts shown as `1.2K` are
rounded and get skipped rather than guessed at.

### The Favorites label is on a child, not the button

`pressNode` climbs up to three parents looking for something pressable.

### Some buttons refuse a proper press

The search submit button reports `clickable = true` and then declines the press
that the accessibility layer offers. It answers a real finger only, so that one
gets a tap at its own coordinates.

Same screen, two buttons called "Search", told apart by `desc` versus `text`,
and only one of them behaves this way.

### The Share panel ignores the back action

On Android 16 the back action does not close it. Use the panel's own **Close**
button; back is only a fallback.

### One back press too many leaves TikTok

Coming back from a search takes three presses. A stale reading caused a fourth
and the script ended up on the home screen. `returnToFeed()` now looks again
before every press.

---

## Knowing where we are

### "For You", never the Like button

The script used to decide it was on the feed by finding a Like button. Every
video player has one - search results, a creator's page, all of them.

After searching for a topic it believed it was back on the feed while it was
still inside the search results, and browsed there for the rest of the session,
**reporting success the whole time**.

`For You` names the feed and appears nowhere else.

Worth knowing: `Search` looks like a good marker and is wrong, because the
search screen has one too. It fooled the very probe written to find this out.

### A swipe tells you nothing

A swipe that hits something covering the screen looks exactly like one that
worked. AutoJs6's own floating console sat over the top-left of the screen -
roughly 2-68% across, 5-45% down - and swallowed every swipe back to the
previous video, silently, for as long as it was switched on.

The swipe to the *next* video starts lower down and was unaffected, which is why
only one of them broke.

Two consequences: `show_console_window` is off by default, and
`videoFingerprint()` checks that the feed actually changed.

---

## Screens that lie about themselves

### The sticker shelf relabels itself

Two readings 100 seconds apart, phone untouched, same conversation:

| slot | first reading | second reading |
|---|---|---|
| 3 | Little Clouds' Friends | The little yellow guy v1 |
| 4 | *(no label)* | The little yellow guy v1 |
| 5 | *(no label)* | Blob buddies |

The same pack name appearing twice is the giveaway: it is a recycling list, and
it was read while it was still filling itself in.

**The inbox is the same kind of list.** So a conversation row is read, read
again, and only pressed if it still says what it said.

### The unread badge is a number, not a dot

An unread conversation carries a small `View` whose label is a number, and its
preview line is the incoming message. A read row has neither:

```
unread   "Nguyen Anh Phong Ho"   View "1"   "Alo"   " . Just now"
read     "minhchiune"            -          "Sent 3m ago"
```

The first attempt looked for the badge by **size** - a small unlabelled shape,
4x2% of the screen. That found six candidates on a list with one unread
conversation, because the little box holding each row's camera icon is exactly
the same size. It would have marked every conversation unread.

The number is the signal. The shape never was.

### The top of the inbox is not people

```
25%  New followers          -> the follow requests screen
31%  Activity               -> the notifications screen
37%  Nguyen Anh Phong Ho    <- the first actual conversation
55%  System notifications
76%  Account not found      <- a dead account
```

"Reply to the first two or three" would press two screens that are not messages
before reaching anybody.

### The account name is first in the row, not the longest

A row reads: name, name again inside the avatar, unread count, message,
timestamp.

Picking the **longest** piece of text seemed reasonable and was wrong twice
over. An incoming message is usually longer than a name, so the message became
the name - `"Test gi dzo a"` was recorded as an account. And on the
`New followers` row it made the name
`"Wabisabi.trips.japan requested to follow you."`, which no longer matched the
pattern that keeps us out of that screen.

Position in the row is the reliable signal.

### TikTok hands us its own variable names

`activebadgeis_active`, `storybadgenone_trueicon`, `@2131823255` - labels the
app forgot to turn into words. They sit in the same rows as real names and one
of them was picked up as an account. `LABELS.internal_label` skips them.

### Pressing the avatar opens a profile

Each inbox row holds two pressable things: the row itself at 100% width, and the
avatar at 13%. Pressing the avatar goes to their profile instead of the chat.
Width is what tells them apart.

---

## The two accidents

### A probe sent two stickers nobody asked for

A probe meant to read a conversation decided what to hold down by position -
"whatever sits above the message box". The message box was at 97% that day and a
quick-send bar sat at 93%, so it picked the **Heart** button, called it the most
recent message, and held it for 700ms. Twice.

Four separate mistakes lined up:

1. It guarded the wrong thing. There were careful rules for what to press
   *after* the menu opened, and none for what to hold down to open it.
2. It fell back to holding a screen position when the node refused a long
   press - and that refusal was the signal that the target was not a message.
3. Its idea of "a message" was "anything above the message box". `className`
   was collected and never used.
4. It read the alarm backwards: items on screen went **down** from 36 to 31, and
   it reported "nothing seems to have opened". A decrease means something
   closed. Only an increase was checked.

Hence: inside a conversation, nothing is ever pressed by position, a node that
declines a real press is left alone, and the target's class is checked.

### A pattern made of invisible characters deleted every name

Account names arrive with a left-to-right mark in front of them, so they are
cleaned before being compared. The cleaning was written with the invisible
characters typed straight into the pattern - which reads as an empty pair of
brackets, because there is nothing to see.

On a laptop it did the right thing. On the phone it **deleted the whole name**,
every time. Every name became `""`, every comparison was between two empty
strings, and the log filled with quotes around nothing.

What stopped that becoming serious was luck. `mayReplyTo` refuses an empty name,
so instead of matching everybody it matched nobody. Without that one line the
script would have replied to anyone with an unread message, strangers included,
and reported success while doing it.

The pattern is now written in numbers - `\u200E` and friends. A pattern nobody
can read is a pattern nobody can check.

This trap was walked into **twice in twenty minutes**, the second time while
writing the fix for the first.

---

## The dangerous screens

### Comments: scroll, never tap

```
34%  "236 comments", Close
36%  the list starts
41%  ...and mixed through it: Reply buttons, and a heart on every comment
93%  the list ends
97%  "Add comment...", Stickers, Mention someone, Send Gift
```

The hearts carry no readable name - TikTok labels them `@2131823235`, a raw
internal number - so they cannot even be recognised to be avoided. With Reply
buttons among the comments and a **Send Gift** button that spends real money,
the only safe rule is to scroll and never tap.

### The Share panel: two rows, 220 pixels apart

```
71%  "Send to", Search, Close
79%  real account names - pressing one messages them
87%  Repost, COPY LINK, Messenger, WhatsApp, Facebook, Telegram, SMS
96%  Report, Not interested, Download, Add to Story, Promote, Cast
```

Only `Copy link` is safe for ordinary sharing. Everything at 79% messages a
person, everything else at 87% leaves TikTok, and `Not interested` at 96% tells
the algorithm to show less of what we are training it toward.

Nothing in this panel is pressed by position. `pressStrict` refuses rather than
guesses.

### Stickers: unreadable by design

13 stickers, **none with a label**, in a grid that scrolls, under a pack strip
that also scrolls and reorders itself, with no Send step - a tap sends
immediately.

The packs are user-installed, so they differ per phone. `Popular stickers` is
server-driven, so it differs per day. There is no correct position to hard-code
even in principle.

This is why replies use the reaction row instead: 7 emoji, all labelled, no
scrolling, matched by name.

---

## Sending to a person

The one thing the script does that reaches somebody and cannot be undone.

**Choosing is not sending.** Selecting a name reveals a message box, a row of
emoji, and a `Send` button at 96%. Confirmed by choosing our own account,
closing the panel, and finding nothing had arrived.

**We cannot read who is selected.** The `selected` flag looked like the answer
and is not - it already reads true before anything is pressed, and the two
entries TikTok draws for the same person disagree with each other.

So the guard sits at the other end: this panel holds several people at once,
which is why it has a Send button at all. If somebody is already chosen when it
opens, `Send` is on screen from the start. The script checks for that and backs
out, rather than adding our account to a selection it cannot see.

**Names, never positions.** The row held still across a minute, but that is not
why it is safe. It is safe because the question asked is "which entry is named
exactly this", not "who is third along". A row that reorders cannot hurt a
question phrased that way, and a name that is missing finds nothing instead of
finding a stranger.

---

## Still open

- No Samsung phone on Android 11-13 has ever run this. That is the real test.
- Two copies of the script can run at once. Needs a lock.
- The schedule has never survived a full day; Android may kill it.
- The login and captcha `stop_signals` have never actually fired, so they are
  unproven.
- Some conversations have no quick-send bar at all - `Nguyen Anh Phong Ho` is
  one. The likely reason is that the two accounts do not follow each other. If
  that is right, it is fixed by following, not by code.

---
title: Interface
description: Themes, the sidebar, the home screen, languages and the installed app.
sidebar:
  order: 7
---

Under _Settings → Interface_, plus the two or three things that are not settings at all.

## Themes

Two choices, not one. **Mode** is System, Light or Dark. **Style** is one of six palettes: Classic,
Dracula, Catppuccin, Gruvbox, Nord, Solarized.

Every style carries its own light and dark ramp, so picking Gruvbox does not commit you to a dark
app, and following the system does not commit you to Classic. The swatches in the picker show both
ramps whatever mode is selected.

The strip the operating system draws around the app (the status bar on a phone, the title bar of an
installed window) follows the theme too.

**Translucent surfaces** is the switch below. The sidebar, the bars and the floating cards let what
is behind them show through, blurred, and the slider sets how much: left is glass, more see-through
and barely blurred; right is tint, denser and heavily blurred. The two always move
together, because transparency without blur leaves two texts fighting and blur without transparency
is just paint. Turning it off makes every surface flat and opaque, which is easier to read and
cheaper to draw on a slow machine. If your system asks for reduced transparency, that wins whatever
is set here.

Four levels move together, and the sidebar is where three of them meet: its top bar and its footer
are the densest, its search, tabs and conversation list sit one step lighter, and the conversation
beside them is lighter still. That is what gives the column depth instead of one flat sheet of glass,
and it is also why the picture behind the app reads in the conversation rather than across the whole
thing.

### A theme for the whole instance

In server mode an admin can hand their users the theme they are using, under
_Settings → Admin → Theme_:

- **Overridable** decides what an account starts on. The first time someone picks a theme of their
  own, the offer stops applying to them.
- **Locked** fixes it, and the theme controls disappear from _Settings → Interface_ rather than being
  drawn and refused. An instance with a house style has made a decision, and a disabled row of
  colours only invites the question.

Nobody's stored preference is rewritten either way, so unlocking gives everyone their own back.

## Background

A picture behind the app, under _Settings → Interface → Background_. The sidebar is translucent, so
it reads through the column; the conversation stays opaque, so nothing is ever asked to be read off a
photograph; the margin around both shows it plainly.

Eight are shipped with the app, in a row you scroll sideways. They are gradients rather than
photographs, which is why they weigh nothing, never look soft on a large display, and cost a dozen
bytes to store: the setting keeps their name, not their pixels.

Your own picture goes in from the button under the row, and then joins the row as a tile like any
other. That one is kept with your settings, which travel, so it is capped at 3 MB, and a file over
the limit is refused rather than quietly resized.

**Background blur** is the slider below, on its own axis rather than following the transparency one.
The picture is softened before anything is drawn on top of it, which is what keeps text legible over
a busy photograph. The middle of the track is the default and is marked, so it can be found again;
left of it the picture is left as it is, right of it it turns to colour and light.

## Home screen

Four independent pieces, each with its own switch:

- the greeting header,
- prompt suggestions,
- recent personas, with a count,
- recent conversations, with a count.

Turn all four off and the home screen is a composer and nothing else, which is a legitimate way to
use it.

## Messages

- **Floating conversation bar.** On by default: the bar at the top of a conversation is a pill
  hovering over it, matching the composer at the other end, and the text passes around both. Turn it
  off and it goes back to being the top edge of the column, flat against the sidebar's own bar, where
  a [background image](#background) reaches it. Either way it keeps the same height, so the two
  columns still line up.
- **Tint your messages with the accent colour**, so your turns read as a bubble against the
  assistant's plain prose.
- **Timestamps** under each message.
- **Fade messages a summary has replaced.** On by default, so it is visible at a glance where the
  live context begins after a [compaction](/features/compaction/). Hovering a faded message
  brings it back to full strength. If the effect bothers you, this is the switch.

## Sidebar

Conversations, and optionally the personas you have talked to, pinned above them. Pinned means
pinned: they hold their place in the header in both shapes, so they never scroll out of reach. If
they take more room than you want, that is what the pin switch and the compact header are for.

**Use the compact header** trades the labels for room: _New chat_ moves onto the search row as an
icon, and the persona grid becomes a row of avatars.

The search field carries the `Ctrl`/`Cmd` + `K` hint, which opens the full-text
[search](/features/search/) over every conversation rather than filtering the titles in place.

A persona's conversation shows its avatar in the list, so it is recognisable even with the pinned
launchers turned off.

Collapsed, the sidebar becomes a one-lane rail: new chat and search, the two sections, your pinned
personas, and the four conversations you were in most recently, each as a single letter with its name
on hover. The button under them opens the rest of the list, with titles, without having to expand the
column for a single visit. The mark stays at the top, at the size it has at full width, and the
control that widens the column again sits astride the column's edge, half on it and half off it.

**Right-click any conversation** (long press on a touch screen) for the full menu: pin it, archive
it, save it as [knowledge](/features/knowledge/), copy it as Markdown or JSON, delete it. Deleting
always asks, and asks on the row itself rather than in a dialog somewhere else.

**A persona's launcher answers the same right-click**, with everything a conversation offers plus one
entry only it has: _End this conversation_. That is not deletion and does not read as one. Ending it
puts the persona back to unstarted and leaves the transcript in the list as an ordinary conversation;
deleting is the entry below, and it is the only one that loses anything.

### Archive

The middle answer between a conversation in the way and a conversation gone. Archiving takes it out
of the list and keeps everything: the messages, the model, the settings, the persona it belonged to.

Archived conversations are reached from a link at the foot of the list, which appears only once there
is something in it. Each one can be restored or deleted from there, and the whole archive can be
restored or emptied at once. Nothing else in the app shows them: they are not a group at the bottom
of the sidebar, because being out of the way is the whole point.

The same pin and delete can sit on every row instead, one click closer:
_Settings → Interface → Sidebar → Show quick actions_. They are off by default, because they hover
over the title on a narrow sidebar and put delete one slip away from the conversation you meant to
open.

## Languages

English and French. A key missing from a translation falls back to English rather than rendering
blank, so a partial translation degrades into a readable app instead of an empty one.

The interface is translated. The documentation is not, and neither is the source. See
[Translations](/development/translations/) if you want to add a language.

## Profile

Your name, avatar and colour, under _Settings → Profile_. In server mode a profile provisioned by
OIDC is read-only: the identity provider owns those fields.

## On a phone

The app is responsive rather than a separate mobile build. Dialogs go full screen below a certain
width, the sidebar collapses, and the composer's menus become sheets.

It installs as a PWA. On iOS, _Share → Add to Home Screen_; on Android, the install prompt in
Chrome's menu. Installed, it runs without browser chrome and keeps its own theme colour.

:::caution[Installed does not mean synced]
In local mode the installed app is a browser profile like any other. Two devices are two separate
installations. If you want the same conversations on both, that is what
[server mode](/guides/running-modes/) is for.
:::

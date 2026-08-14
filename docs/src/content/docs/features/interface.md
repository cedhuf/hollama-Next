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

## Home screen

Four independent pieces, each with its own switch:

- the greeting header,
- prompt suggestions,
- recent personas, with a count,
- recent conversations, with a count.

Turn all four off and the home screen is a composer and nothing else, which is a legitimate way to
use it.

## Messages

- **Tint your messages with the accent colour**, so your turns read as a bubble against the
  assistant's plain prose.
- **Timestamps** under each message.
- **Fade messages a summary has replaced.** On by default, so it is visible at a glance where the
  live context begins after a [compaction](/features/compaction/). Hovering a faded message
  brings it back to full strength. If the effect bothers you, this is the switch.

## Sidebar

Conversations, and optionally the personas you have talked to, pinned above them.

**Right-click any conversation** (long press on a touch screen) for the full menu: pin it, save it as
[knowledge](/features/knowledge/), copy it as Markdown or JSON, delete it. Deleting always
asks, and asks on the row itself rather than in a dialog somewhere else.

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

---
title: Data
description: Export, import, backup, and moving from one installation to another.
sidebar:
  order: 4
---

Under _Settings → Data_. Everything is plain JSON, downloaded by your browser, with nothing sent
anywhere.

## Five categories

| Category    | What is in it                                             |
| ----------- | --------------------------------------------------------- |
| Servers     | Provider connections, their labels, colours and keys      |
| Preferences | Every setting, including collections and prompt overrides |
| Sessions    | Conversations, with their messages                        |
| Knowledge   | Every piece of knowledge                                  |
| Personas    | Every persona                                             |

Each one exports, imports and deletes on its own. Useful for moving your personas to another machine
without dragging six months of conversations along.

## Full backup

_Backup_ writes all of it into one file, named with the date. _Restore_ reads one back.

:::caution[Restoring replaces, it does not merge]
A restore says "this is now the whole collection". Conversations, knowledge and personas already
present are not kept alongside the file's, they are replaced by them. Take a backup before restoring
one if the current state is worth anything.
:::

A file exported before the app was renamed to Llooma restores exactly the same way as one written
today: both sets of keys are read.

## What a backup contains, and does not

**Servers are excluded.** Connections are administered on the server, and the keys never leave it,
so there is nothing to put in the file. The backup is your conversations, knowledge, personas and
preferences.

## Moving between instances

There is no migration tool, and there does not need to be one:

1. On the instance you are leaving, _Settings → Data → Backup_.
2. Open the other one, signing in if it asks.
3. _Settings → Data → Restore_, and pick the file.

Conversations, knowledge, personas and preferences land in your account. Provider connections do
not, and are the one thing to set up again on the other side (or to ask the admin for, since a shared
instance usually provides them).

This is also the way out of an installation still running the old browser-only mode: export before
you upgrade, restore afterwards.

The first-run wizard offers the same restore, so a fresh install can start from a backup rather than
from nothing.

## Reset everything

At the bottom of the page, outlined in the negative colour so it is not skimmed past. It wipes every
category and reloads into a fresh app, first-run wizard included. It asks twice.

This resets **your account**, not the instance.

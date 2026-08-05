---
title: Knowledge
description: Text you keep once and attach where you need it, and the collections that group it.
sidebar:
  order: 2
---

A piece of knowledge is a named body of text. Your coding conventions, a product's spec, a glossary,
the brief you keep re-explaining. Write it once, attach it to a conversation or a persona, and it
travels with the message as a context block.

It is not indexed and not searched. The whole text goes into the context, exactly as written. That
is the same deal [documents](/llooma/features/documents/) get, and for the same reason: nothing
guesses which part you meant.

## Writing one

Knowledge is edited in a dialog, never on a page of its own. It opens over whatever you were doing
and hands it straight back, so writing something down is not a detour. The same editor opens from
three places: the Library, the composer's _Add context_ menu, and the right-click menu on a
conversation in the sidebar.

Two views on the same text. The plain one is a textarea. The code one has line numbers, syntax
highlighting and indentation, and is only loaded if you ask for it, so nobody downloads an editor to
write four lines of prose.

The footer counts tokens as you type, on the same estimated scale as the
[load meter](/llooma/features/compaction/).

## Keeping a conversation

Right-click a conversation in the sidebar and choose _Save as knowledge_. The editor opens with the
transcript already in it, so you can name it and cut it down before it exists.

It is a copy, taken at that moment. It does not keep following the conversation, and what you delete
from it before saving is simply not kept. The transcript itself is the one the Markdown export
produces.

## Collections

A collection is a named group of knowledge. One level, no nesting: a piece of knowledge sits in a
collection or sits loose.

In the Library each collection is a heading over its own grid, foldable, with the ungrouped
knowledge last. There is nothing to open and nothing to come back from, which is the point: what is
where stays visible.

To create one, click the folder icon on the _New knowledge_ card. The card turns into a field, you
type a name, you press Enter. To file something, use the picker in its editor, where typing a name
that does not exist yet offers to create it on the spot.

**Attaching a collection attaches everything in it**, as separate pills, so any one of them can be
taken back off before you send. **Deleting a collection deletes the grouping only.** Its knowledge
returns to the top level. There is no path where removing a folder removes what was in it.

:::note[Where collections live]
Collections are stored in your settings rather than in a store of their own. They are a name and an
id, they belong to whoever owns the knowledge, and keeping them there meant no new table, no new
endpoint and no migration in either running mode. An empty collection survives, which a folder
implied by its contents could not.
:::

## Attaching it

From the composer's _Add context_ menu, in a conversation or on the home screen. The list is
filterable, and _New knowledge_ there opens the same editor.

A persona carries its own knowledge, attached in its editor and applied to every conversation it
opens. See [Personas](/llooma/features/personas/).

## Import and export

_Library → Import → Knowledge_ reads a JSON file: one object or an array of them. Field names are
read loosely, `name` or `title` for the name and `content` or `text` for the body, so files written
for something else usually import as they are. Anything with neither is skipped.

Export goes through [Data](/llooma/features/data/), by category or inside a full backup.

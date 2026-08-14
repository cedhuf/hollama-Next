---
title: Search
description: Full-text search across every conversation, answering with the passage itself.
sidebar:
  order: 6
---

Two different things are called search here, and the difference matters.

The **field at the top of the sidebar** filters the list you are looking at, by title. It is a way to
find a conversation you remember the name of.

**`Ctrl`/`Cmd` + `K`** opens the other one: it queries the content of every conversation you have and
answers with the passages themselves. It is a way to find a conversation you only remember something
said in.

## Reading the results

Results are grouped by conversation, best match first, and every match gets its own row with the
sentence around it and the term marked in it. A conversation that mentions your term eight times
offers eight ways in, each landing on the passage rather than at the top.

The arrow keys move between passages, not between conversations: the conversation heading is a
grouping, not a stop. `Enter` opens the selected one, `Esc` closes.

Typing filters as you go, with a short pause before each query so a fast typist does not fire six
searches on the way to one word.

## What backs it

**Server mode** searches SQLite's FTS5 index, kept per user and rebuilt when a conversation is
saved. Ordering is FTS5's own relevance: distinctive terms, close together, in shorter messages,
rank higher.

Several words are AND-ed, and the last one is treated as a prefix so results narrow while you are
still typing. Operators are not exposed: `-`, `*`, `"`, `NEAR` and `OR` mean something to FTS5, and a
stray dash in an ordinary query would turn a search into a syntax error, so every word is passed
through as a literal.

**Local mode** scans the conversations already in the browser and cuts the excerpt itself. No index,
no server, same modal, same result shape.

:::note[Excerpts are never HTML]
A match is marked with private-use code points and turned back into plain text segments at render
time. An excerpt is message content, and building HTML out of it would hand any conversation
containing markup a way into the page.
:::

## Known limitation

A compaction summary is stored as a message, so a conversation that has been
[compacted](/features/compaction/) can return the same passage twice: once from the original
message and once from inside the summary that stands in for it. Teaching the index to skip
compaction markers is on the [roadmap](/roadmap/).

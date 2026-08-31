---
title: Search
description: Full-text search across every conversation, answering with the passage itself.
sidebar:
  order: 2
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

:::note[Excerpts are never HTML]
A match is marked with private-use code points and turned back into plain text segments at render
time. An excerpt is message content, and building HTML out of it would hand any conversation
containing markup a way into the page.
:::

## What is searched

The live conversation, by default: what the model would read if you sent a message now.

Two things are left out for the same reason, that they are not where you would look for what you
are looking for. A [compaction](/chat/compaction/) summary repeats what is said elsewhere in
the conversation, so including it returned the same passage twice, once from the message and once
from the summary standing in for it. And a conversation you have `/clear`ed is one you deliberately
set aside.

Both come back with the **layers** button beside the search field. Nothing is ever excluded from
the index itself: the switch changes the question, not what is stored.

Where the boundaries are is recorded when a conversation is saved, in a small table beside the
full-text index and filled by the same walk over the messages. Asking at search time instead meant
unfolding every matched conversation's whole message array to answer a question about a handful of
integers, which is fine on one machine and is not fine on a busy instance.

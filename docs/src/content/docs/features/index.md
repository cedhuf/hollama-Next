---
title: Features
description: What Llooma does, beyond sending messages to a model.
sidebar:
  order: 0
  label: Overview
---

Everything here works in both [running modes](/llooma/guides/running-modes/) unless a page says
otherwise. Anything an admin can share or lock is noted on the page for that feature.

## Chat

Text, vision and reasoning models with streamed replies. Markdown with syntax highlighting,
KaTeX maths and copyable code blocks. Attach knowledge, images and documents from the composer's
_Add context_ menu, each shown as a removable pill. Edit and
retry messages; copy a message, a code block or a whole conversation as JSON or Markdown.

## Tools

- **Web search** — degoog or SearXNG, toggled per message, with an optional _let the model decide_
  mode and a live status.
- **Web fetch** — paste a link and the model reads the page in full rather than answering from
  search snippets. Capped in pages and characters.
- **Interactive choices** — when a request is ambiguous, the model can offer tappable options
  instead of guessing.
- **Current date** — anchors the model in the present so it does not reject facts that postdate
  its training.

## [Compaction](/llooma/features/compaction/)

When a conversation gets too long, replace everything said so far with a structured summary so it
keeps fitting in the context window — reversibly.

## Personas and knowledge

Reusable characters with their own avatar, system prompt, model, greeting and knowledge, created
in the Library and pinned to the sidebar. Importable from OpenWebUI model exports. Knowledge
collections attach to any conversation or persona.

A piece of knowledge is written in a dialog rather than on a page of its own, so it opens over
whatever you were doing and hands it back when you are done. Same editor everywhere: from the
Library, from the composer's _Add context_ menu, or from a conversation you decided to keep. It has
a plain text view and a code view, the second one loaded only if you ask for it.

**Collections** group knowledge. One level, no nesting: a piece of knowledge sits in a collection
or sits loose. In the Library each collection is a heading over its own grid, foldable, with the
ungrouped knowledge last. Nothing to open and nothing to come back from, so what is where stays
visible.

Create a collection from the folder icon on the _New knowledge_ card: the card becomes the field,
you type the name, you press Enter. File knowledge into one from the picker in its editor, where
typing a name that does not exist yet offers to create it.

Attaching a collection to a conversation attaches everything in it, as separate pills, so any one
of them can be taken back off. Deleting a collection deletes the grouping only: its knowledge comes
back to the top level, never with it.

## Search

Full-text search across every conversation, ranked by relevance, with the matching passage shown
in context. Server mode indexes with SQLite FTS5; local mode scans in the browser.

## Interface

Six themes, each with a light and a dark ramp, following the system by default. Responsive,
installable as a PWA, English and French with automatic fallback. Import and export each kind of
data, or a full backup.

Right-click a conversation in the sidebar to pin it, keep it as a knowledge collection, copy it as
Markdown or JSON, or delete it. Deleting still asks on the row itself. The same pin and delete can
sit on every row instead, one click closer: _Settings → Interface → Sidebar_. They are off by
default, since they hover over the title on a narrow sidebar and put delete next to the
conversation you meant to open.

Keeping a conversation as knowledge opens the editor with the transcript already in it, so it can
be named and trimmed before it exists. Same transcript the Markdown export produces, and a copy:
it does not keep following the conversation afterwards.

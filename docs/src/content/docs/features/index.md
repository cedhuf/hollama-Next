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
KaTeX maths and copyable code blocks. Attach knowledge and images from the composer's _Add
context_ menu, each shown as a removable pill. Edit and
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

## Search

Full-text search across every conversation, ranked by relevance, with the matching passage shown
in context. Server mode indexes with SQLite FTS5; local mode scans in the browser.

## Interface

Six themes, each with a light and a dark ramp, following the system by default. Responsive,
installable as a PWA, English and French with automatic fallback. Import and export each kind of
data, or a full backup.

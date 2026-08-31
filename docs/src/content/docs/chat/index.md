---
title: Chat
description: Sending a message and reading the answer, which is the part everything else serves.
sidebar:
  order: 0
---

Everything here works in both [running modes](/guides/running-modes/) unless a page says
otherwise. Anything an admin can share or lock is noted on the page for that feature.

## The exchange

Text, vision and reasoning models, with replies streamed as they are written. Answers are rendered
as Markdown: syntax highlighting on code, KaTeX for maths, and a copy button on every code block.

A message you sent can be edited, and one you received can be retried. Both rewrite the conversation
from that point rather than appending, so a wrong turn is removed instead of buried.

Copying works at three sizes: a single message, a single code block, or the whole conversation as
JSON or as Markdown.

## Attaching things

One menu in the composer, _Add context_, attaches everything: knowledge, images and documents. Each
attachment becomes the same removable pill, on the home screen and halfway down a conversation
alike.

Pictures have two shortcuts past the menu: paste one, or drag it onto the composer from the desktop.
PNG and JPEG only, and anything else in the same drop is counted back to you rather than silently
dropped.

What each kind of attachment does once it is in there is on its own page:
[Knowledge](/context/knowledge/) for text you keep, [Documents](/context/documents/) for a PDF or a
spreadsheet read in the browser.

## What the model is told first

System prompts apply globally, per model, or to one conversation, and the most specific one wins.
[Prompts](/context/prompts/) covers the resolution in full, including what an admin can impose.

## Titles

A conversation names itself after the first reply, using whichever model you point at the job. It is
a small, cheap request to a model of your choosing rather than the one you are talking to.

## The rest of this group

[Commands and shortcuts](/chat/shortcuts/) for what the composer and the keyboard understand.
[Search](/chat/search/) for finding a passage across every conversation.
[Compaction](/chat/compaction/) for when a conversation stops fitting.
[Generation](/chat/generation/) for where a reply is actually written, which decides whether
reloading the page costs you one.

---
title: Prompts
description: Everything said to a model before your message, and who is allowed to change it.
sidebar:
  order: 1
---

A conversation never starts empty. Before your first word the model has already been told today's
date, when to look something up, what to do with search results, how to write a summary if the
conversation gets long. That text is not hidden, and it is not fixed. It all lives in
_Settings → Prompts_.

The tab holds two kinds of instruction, and the difference matters.

## The system prompt

What **you** want the model to be like: a tone, a language, a rule it should always follow. There is
a global one, and you can give a specific model its own, either extending the global one or
replacing it.

This is the prompt most people mean when they say "system prompt". It is yours, it is short, and
nothing in the app writes to it.

## What the app adds on its own behalf

Everything else on the tab, grouped by the part of a turn it governs:

| Group                | What it decides                                                        |
| -------------------- | ---------------------------------------------------------------------- |
| Conversation         | The date line, several participants, quick-choice questions, the title |
| Personas             | The language rule, being summoned with `@`, an exchange brought back   |
| Web search and pages | Whether to search, the query, how results and pages are used and cited |
| Memory               | What a persona keeps about its user, and the tools that change it      |
| Images               | Writing a prompt an image model can draw, and naming what comes back   |
| Native tools         | The same instructions for providers that call tools instead of reading |
| Compaction           | Writing a summary, using one, and anything typed after `/compact`      |

Each prompt is folded, showing its name and what it drives. Open it to read the wording, edit it in
place, and it saves as you type. Blank it, or type the default back, and your version disappears.

Some take placeholders, listed under the editor: `{datetime}`, `{results}`, `{pages}`, `{language}`,
`{summary}` and a few more. They are substituted at send time. Leave one out and the model simply
never sees that part.

### Why the native tools say it twice

There are two ways to give a model the web. Most endpoints get a text protocol they answer in prose;
providers that support tool calling get the same instructions as structured tool descriptions. Both
are on the tab, next to each other, because they have to agree. If they drift, the app behaves
differently depending on which provider answered, which is the kind of bug nobody can reproduce.

:::note[Changing a prompt is retroactive where it is applied at send time]
The compaction framing prompt is applied when the conversation goes out, so editing it also changes
how summaries written weeks ago are presented. The prompt that _writes_ a summary only affects the
next one.
:::

## What is not here

A [persona](/behaviour/personas/)'s prompt and a [playbook](/behaviour/playbooks/)'s instructions.
Those belong to something you wrote and stay with it, in the library. The tab is for what the
instance says, not for what you built.

## On a shared instance

An admin can share both kinds of prompt, locked or as a starting point. Everyone still sees the
whole tab either way: a read-only prompt tells you what is being sent on your behalf, where a hidden
one only tells you that something is.

Shared as a starting point, the rewrites merge prompt by prompt. Rewriting the summary keeps the
admin's version of every other one, because twenty prompts are twenty settings that happen to share
a screen.

Locked is enforced when a turn starts, not only in the interface. See
[Administration](/operating/administration/).

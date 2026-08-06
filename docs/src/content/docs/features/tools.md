---
title: Tools
description: Web search, web fetch, interactive choices, and the instructions behind them.
sidebar:
  order: 4
---

Everything on this page lives under _Settings → Tools_. None of it is an agent framework: each one
adds a specific thing to what the model is given, and each one can be turned off.

## Web search

Llooma does not talk to a search engine directly. It talks to a backend you point it at:

- [**degoog**](https://github.com/degoog-org/degoog), the default,
- or a **SearXNG** instance, yours or someone else's.

Set the URL, pick the backend, and add a bearer token if your instance is protected. The token field
stays a password field and is never shown back.

The composer carries a per-message toggle, so search is a decision you make per question rather than
a mode you leave on. Two settings change where it starts from:

- **On by default** starts every message with search armed. Off by default.
- **Let the model decide** hands the question to the model first: it either writes a search query or
  answers `NONE`, and only a query triggers a lookup. The status is shown live in the conversation
  while it runs, so you can see what was searched for.

There is a second step you may notice. Results come back as titles and snippets, and the model may
ask to open up to three of them in full when the snippets are not enough. That is a prompt, not a
hard-coded rule, and it is editable below.

What was found stays with the conversation. Later turns keep a short index of the sources each answer
cited, titles and addresses only, so a model asked a follow-up still knows what it read rather than
having to trust its memory of it. It can reopen any of those pages, which is what it should do before
taking back something it said earlier.

## Native tool calling

The web tools reach the model one of two ways. By default they are text instructions it answers in
its replies, which works on every endpoint Llooma can talk to. Set to **native where supported** and
the model calls them as real tools instead, deciding for itself when to search rather than being
asked in a separate request first.

Ollama reports per model whether it can; the hosted providers all can; a self-hosted
OpenAI-compatible endpoint has no way to say, so it stays on the text path unless you pick **always
native**. Only do that for a server you know handles it: a model offered tools it cannot call tends
to improvise rather than fail cleanly.

**Where the configuration comes from** decides whether you can edit it. `PUBLIC_SEARCH_URL` in the
environment locks it instance-wide and the fields go read-only with an `env` badge. In server mode
an admin can share theirs instead, either locked or overridable. See
[Administration](/llooma/guides/administration/).

## Web fetch

Paste a link and the model reads the page itself rather than answering from what it remembers about
it. Also a per-message toggle, also with an _on by default_ setting.

Two caps, because a page is not small: **pages per message** (1 to 10, three by default) and
**characters per page** (5k to 100k, 20k by default). Past the cap the text is cut, which is
preferable to a request refused by the provider.

The tool refuses private, loopback and link-local addresses, including the cloud metadata endpoint,
and re-checks every redirect hop. An instance open to people you do not know still deserves
`FETCH_ALLOWED_ORIGINS`. See [Security](/llooma/guides/security/).

An admin can turn it off for everyone, and `/api/fetch` enforces that itself rather than the
interface merely hiding the button.

## Interactive choices

On by default. When a request is genuinely ambiguous and turns on a preference the model cannot
infer, it can reply with up to three questions of two to four options each, rendered as buttons you
tap instead of typing an answer.

It is taught, not enforced: the model is given a protocol and told when not to use it (a factual
question, a request where you already gave the constraints, a question asking for its opinion). If
you find it asking too often, the instruction is yours to edit.

## Current date

On by default. Prepends today's date and time, and tells the model to treat it as authoritative.

The reason is narrow and worth stating: without it, a model refuses recent facts as impossible
because they postdate its training. With it, it weighs them.

## Documents

Covered on its own page, including OCR and the instance-wide off switch. See
[Documents](/llooma/features/documents/).

## System instructions

Every one of these features works by adding text to what the model receives, and all of that text is
yours to rewrite. Pick a prompt from the dropdown, edit it, and the override is saved. Blank it, or
type the default back, and the override disappears.

| Prompt                      | What it drives                                          |
| --------------------------- | ------------------------------------------------------- |
| Current date                | How the date is framed                                  |
| Web search, query           | Whether to search and what to search for, in auto mode  |
| Native tools, when to use   | When the model should call a tool rather than answer    |
| Web search, not used        | Stops the model claiming it searched when it did not    |
| Web search, results         | How results are handed over, and how they are cited     |
| Web search, earlier sources | The index of what past turns found, and how to treat it |
| Web search, read a result   | The rule for opening a page in full                     |
| Web fetch, pages            | How fetched pages are framed                            |
| Interactive choices         | The question protocol                                   |
| Compaction, write           | How the summary is written                              |
| Compaction, use             | How the summary is framed for the model afterwards      |

Some prompts take placeholders, listed under the editor. `{datetime}`, `{results}` and `{pages}` are
substituted at send time. Leave one out and the model simply never sees that part.

:::note[Changing a prompt is retroactive where it is applied at send time]
The compaction framing prompt is applied when the conversation goes out, so editing it also changes
how summaries written weeks ago are presented. The prompt that _writes_ a summary only affects the
next one.
:::

In server mode an admin can share their prompts with everyone, read-only or as a starting point.

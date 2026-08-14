---
title: Compaction
description: Summarise a long conversation so it keeps fitting in the context window.
sidebar:
  order: 5
---

Every message you send carries the whole conversation with it. Past a certain length that becomes
slow, expensive, and eventually refused by the provider. Compaction replaces everything said so
far with a structured summary, so the conversation can continue.

## Nothing is deleted

This is the part worth understanding. A compaction appends a **marker** to the conversation. The
marker holds the summary, and it moves where the _sent_ context starts. Everything above it stays
on screen exactly as it was, and is still searchable and exportable.

Which means compaction is **reversible**: unfold the divider, click _Undo_, and the model has the
full history back. A summary you are not happy with costs one request, not your conversation.

## Running it

Type `/compact` in the composer. A command menu appears as soon as you type `/`.

The command is recognised only when the whole message is a single line naming it. A message that
merely starts with a slash (a path, a date, a regular expression) is sent as typed. To send a
message that really does begin with a slash, start it with `//`. The full rule is on the
[commands](/reference/shortcuts/) page.

If the conversation is too short to be worth compacting, `/compact` stays listed but greyed out,
with the reason.

## While it runs

The wait is drawn in the conversation, not in a corner of the screen. A divider appears at the
bottom of the thread, exactly where the finished one will sit, and says it is summarising. Once
the summary lands, that same divider fills in with the result rather than being replaced. You can
abandon a summary in progress from the cross on the divider: nothing is written and the
conversation is left as it was.

Unfold a finished summary and it also reports what the compaction bought: roughly how many tokens
it freed, the weight before and after, and the share removed. Those figures are computed from the
messages still on screen, so summaries written before this existed report them too.

Messages a summary now stands in for stay on screen, faded, so it is clear at a glance where the
live context begins. Hover one to read it at full strength. If you would rather they did not fade,
turn off _Fade messages a summary has replaced_ under _Settings → Interface → Messages_.

## The load indicator

A small ring sits in the composer and fills as the context does. It stays a quiet grey outline
until 60%, warms to amber, then to red, and shows the token count from amber onwards. Hover it for
the exact figures, or tap it: it reads out the same panel on a touch screen, where there is no
hover to reveal it with. It only ever shows figures, it never runs anything.

:::caution[The token count is an estimate]
There is no tokenizer in the browser, and shipping one would mean a megabyte of vocabulary per
model family. The figure is derived from text length (~3.7 characters per token, plus a flat cost per
image) and is deliberately biased to overestimate slightly: compacting a little early costs one
summary, compacting too late costs a refused request.
:::

The ceiling it measures against is the model's real context window when Llooma knows it, which
means when `num_ctx` is set on an Ollama conversation. Every other provider keeps its window to
itself, and some do not publish one at all, so the fallback is the threshold you set in settings.

## Choosing a model

By default the summary is written by **the conversation's own model**. It already has the right
window, you already trust it here, and it needs no configuration.

You can pick a dedicated model under _Settings → Chat → Compaction_. Note that the title model is
deliberately not reused: a model chosen to write six words will quietly drop facts over fifty
thousand tokens, and what the summary leaves out is lost to the assistant permanently.

## Automatic compaction

Turn on _Compact automatically_ and set a threshold. Llooma compacts on its own once a
conversation crosses it, **after** a reply has landed rather than before one goes out, so you get
your answer first and the wait for the summary falls in the gap while you read it.

The threshold doubles as the load indicator's ceiling, which is what makes it useful for providers
that never announce a context window.

## What the summary contains

The summariser is asked for a structured record rather than prose: the task, decisions taken and
why, facts and constraints verbatim, code and artifacts still in use, current state, and open
questions. A paragraph of prose loses exactly the parts the next turn needs.

Both the prompt that writes the summary and the one that frames it for the model are overridable
under _Settings → Tools → System instructions_. The framing prompt is applied at send time, so
changing it also affects summaries written earlier.

## Sharing it

An admin can share the compaction model, the automatic toggle and the threshold with everyone on
the instance, as `locked` or `overridable`, the same three states as title generation. See
[Administration](/guides/administration/).

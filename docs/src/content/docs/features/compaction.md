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
under _Settings → Prompts_. The framing prompt is applied at send time, so
changing it also affects summaries written earlier.

## Saying what to keep

`/compact` takes an optional instruction: `/compact keep every decision about the database schema`.
It goes last and **outranks** the summariser's own rules, their length and their structure included.
`/compact one word only` writes one word.

That is deliberate, and it is worth knowing what it costs: whatever the summary leaves out is gone
from the model's memory of the conversation. The protection is not a prompt refusing to obey you, it
is that compaction is reversible, since the divider gives the full history back.

Picking `/compact` from the command menu now writes it into the composer with a space after it
instead of running it, since the point of picking it from a list is that you were not going to type
the name yourself. Press Enter again to compact with no instruction.

The instruction is kept in the note and shown above the summary when it is unfolded. A summary
written to an instruction is not the same object as one written to the default rules, and reading it
without knowing that is how you conclude the summariser lost the plot.

The wrapper around it is the `Compaction: what the user asked for` prompt in _Settings → Prompts_.
Commands that take no arguments only match when given none, so `/clear the air before we start` is
the sentence it looks like.

## Sharing it

An admin can share the compaction model, the automatic toggle and the threshold with everyone on
the instance, as `locked` or `overridable`, the same three states as title generation. See
[Administration](/guides/administration/).

## Clearing instead

`/clear` is the other way to give the model less to read, and the blunt one: it draws a line and
hands the model nothing at all from above it. No summary, no request, nothing to wait for.

|                      | `/compact`                    | `/clear`                     |
| -------------------- | ----------------------------- | ---------------------------- |
| What the model gets  | A summary of what came before | Nothing from before the line |
| Costs a request      | Yes                           | No                           |
| The transcript above | Stays on screen, faded        | Folds under the marker       |
| Undo                 | Remove the marker             | Remove the marker            |

Neither deletes anything, and both are the same kind of object: a marker that moves where the sent
context begins. Whichever is later wins, so clearing after compacting throws the summary away too.

Unfolding a cleared stretch gives an **index** rather than a transcript: one line per message, in a
box with its own scrollbar, and any single line opens where it sits. Two hundred messages poured
back into the page would be the wall you cleared them to get away from. To read it properly, restore
it: the conversation is what the page is for.

Cleared messages are also left out of [search](/features/search/) by default, and come back with the
same switch that brings back compaction summaries.

## Looking before deciding

`/context` writes down what the model is actually being sent, at the moment you ask. It costs no
request and changes nothing: it is a note in the conversation, for you.

It reports the estimate as a whole, then what the estimate is made of, since knowing a conversation
weighs 12k says nothing about what to do next:

| Line              | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| **System prompt** | The instructions in front of every request, including a persona's        |
| **Messages**      | The turns still in context, the compaction summary among them            |
| **Sources index** | The list of earlier web results, built at send time and easy to forget   |
| **Heaviest**      | The single biggest message, named, because it is usually one pasted file |

The ceiling it measures against is the model's own `num_ctx` when the app knows it, and your
threshold from _Settings → Chat_ when it does not. The report says which, because "60% full" means
two different things depending on the answer.

The figures are the same ones the load ring in the composer shows, from the same function, so the
two cannot disagree. Like every token figure in Llooma they are estimated from text length rather
than counted by the provider.

A report is a **snapshot**, not a live reading. It keeps saying what the context held when you asked
it, which is what makes running it before and after a `/compact` worth doing. It is never sent to
the model, and it never turns up in search.

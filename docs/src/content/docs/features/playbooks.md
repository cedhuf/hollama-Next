---
title: Playbooks
description: Procedures written once and switched on in any conversation.
---

A playbook is a way of doing something, written once and reused. Where a
[persona](/features/personas/) is **who** is answering, a playbook is **how** the job gets done: a
procedure the model follows, with no voice, no model and no conversation of its own. You do not talk
to a playbook; you switch one on and it changes how the answer is produced.

The instructions are Markdown, and they are the whole of it. No templating, no variables, no steps
the app interprets. What makes a playbook reusable is that it is text a model reads, so it survives
every model, every provider, and every change of ours.

## Switching one on

Type `/playbooks` in a conversation. The list opens where you asked for it, showing every playbook
you have with a tick against the ones in force. It stays in the conversation, so what changed the
answers is visible above them rather than buried in a settings panel.

Unlike every other note in a conversation, this one reads **live**: the library and the conversation
are the truth and the panel only shows them. A frozen list of switches would be a photograph of a
switchboard.

What is switched on is appended to the conversation's own system prompt, at the moment the message
is sent. Two consequences worth knowing:

- Editing a playbook reaches every conversation running it, immediately. A persona is snapshotted
  when its conversation starts, because a persona is somebody and must not change under a
  conversation already under way. A playbook is a procedure you maintain, and fixing a step in it
  should fix it everywhere.
- Deleting one simply removes it from the next request. Nothing in the conversation is rewritten.

## Writing one

In the Library, under **Playbooks**. A playbook is a name, one line saying **when to use it**, and
the procedure.

That one line carries more weight than it looks. It is what `/playbooks` shows and what somebody
reads when deciding whether this is the one, so it is written for that decision rather than as a
description of the contents.

The card shows how many sections the procedure has, because "six steps" and "forty steps" are
different objects and a name never says which one you are about to switch on.

## The store

Playbooks are not shipped inside Llooma. The app reads them from the store over the network, the
same one the personas come from — [one address](/guides/administration/), with a folder per kind
under it. The public listing is at [llooma.eu/playbooks](/playbooks/).

Installing makes a **copy**. It lands in your library and is yours from that moment: editing it is
editing your copy, and the store cannot reach into it afterwards. What is recorded is where it came
from and what it said on the way in, which is what lets the store tell three things apart:

| What the card says    | What happened                                               |
| --------------------- | ----------------------------------------------------------- |
| **Installed**         | You hold an untouched copy of what is published             |
| **Installed, edited** | You changed it. It is yours, and nothing will overwrite it  |
| **Update**            | The store published a newer version and you touched nothing |

**Update all** takes every new revision at once, and never a copy you have edited: a single press
that quietly overwrote everything somebody had rewritten would be the one nobody could undo. Those
keep being offered card by card, with a confirmation, because there is no merge to offer and
pretending otherwise would be worse than the question.

## The four that come with the store

| Playbook                      | What it is for                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| **Meals for the week**        | A week of dinners around what is already in the kitchen, and one list        |
| **Say it plainly**            | An official letter turned into what you actually have to do, and by when     |
| **Help me decide**            | A decision you keep going round in circles on, ending in a recommendation    |
| **Something stopped working** | Why a device or a connection at home broke, before anything gets taken apart |

They are deliberately ordinary. A playbook earns its place by being the thing you would otherwise
retype every time, not by being clever.

## Writing a good one

- **Ask before assuming.** Say what to establish first, in one message rather than an interrogation,
  and say when to start without waiting.
- **Say what the answer looks like.** A table, a list, a draft reply. "Be helpful" is not a
  procedure.
- **Say what not to do.** The failure mode is usually specific: eight things to try at once, a
  balanced list instead of a recommendation, an invented legal consequence.
- **Stay model-agnostic.** Plain instructions, no tool names, no provider assumptions.

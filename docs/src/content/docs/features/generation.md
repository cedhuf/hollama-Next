---
title: Generation
description: Where a reply is written, and why that decides whether a reload costs you one.
sidebar:
  order: 9
---

A reply used to be written by the page you were looking at. That works right up until the page
goes away, and pages go away for ordinary reasons: you reload, you follow a link, you switch
apps and your phone reclaims the tab. The model kept writing, nobody was listening, and nothing
was saved. The answer was gone.

Llooma now runs the turn in the server instead, and the page watches it.

## What changes for you

Send a message and then reload. The conversation comes back with the reply still arriving, from
wherever it had got to. Close the tab and open it again a minute later, and the finished answer
is there. Switch to another conversation while one is generating, and come back to it.

The confirmation dialog that used to ask whether you really wanted to leave a conversation
mid-reply is gone with it, because leaving no longer costs anything.

Titles and automatic compaction moved with the turn, for the same reason. A first exchange that
landed while the tab was closed used to come back untitled; now the conversation is named whether
or not anyone was watching.

### Naming it again

The first title is written from a single message, before anything has been answered, so it names
the question rather than the conversation. _Settings → Chat → Naming_ can give it a second name a
few exchanges in, once there is something to name. Off by default.

Two rules make it useful rather than distracting:

- **Once.** A conversation whose name keeps changing stops being something you recognise in the
  sidebar, which is the only thing a title is for.
- **Never over a name you typed.** Renaming a conversation marks it as yours, and nothing writes
  over it after that.

In server mode it travels with the rest of the naming configuration: an admin sets it for
themselves and shares it under _Settings → Admin → Title generation_, like the model that writes
the titles.

## Stop still stops

The stop button reaches the run wherever it is. What the model had already written is kept, as it
always was: a reply cut short is more useful than an empty one.

## Where your conversation goes

This is worth stating plainly, because it is a real change and it is why the behaviour is a
setting rather than simply how the app works.

**In server mode** nothing moves. Your conversation already passed through the instance: it holds
the accounts, the connections and the provider keys, and the proxy has always been the path
between the browser and the model. A turn that runs in the same process reaches the provider the
same way, under the same admin rules about which models are shared and which instruction is
locked.

**In local mode** something does move. Talking to a local Ollama, the browser used to reach it
directly and the llooma server never saw the conversation. With server-side generation the turn
runs in the llooma server, so the messages pass through it. That server is your own machine, or
your own container, so it is a short trip and it goes nowhere else. But it is not the same
sentence as before, and you should be the one deciding.

## Turning it off

**Settings → Chat → Generate on the server.** On by default. Turned off, the turn runs in the tab
exactly as it used to: nothing passes through the llooma server on its way to the model, and a
reload costs you the reply again. The trade is that plain.

The setting travels with your other settings, so it applies wherever you use the same profile.

## What it does not survive

Honest limits, since a promise half-kept is worse than none.

**A server restart.** Runs live in the server's memory. Restart it, or redeploy, and whatever was
in flight is lost. It is not written to disk, deliberately: the failure it would protect against
is a restart landing inside the few seconds a model takes to answer.

**Applying the same answer twice.** A finished run is kept for a few minutes so a tab that was
closed mid-answer can still collect it, and coming back to the conversation inside that window
replays its log from the start. Every message a run produces carries the instant it was created,
stamped once and never rewritten, so an event delivered twice is recognised and applied once.
Without that, revisiting a conversation put the same reply in it again.

**Several replicas.** If you run llooma behind a load balancer with more than one instance, each
one keeps its own runs, and a browser that reconnects to a different replica will not find its
turn. Single-instance deployments, which is nearly all of them, are unaffected.

**A long absence in local mode.** In server mode the finished reply is written into the
conversation by the server, so it is waiting for you however long you take. In local mode the
conversation belongs to your browser and the server cannot write to it: the answer is held for a
few minutes, and collected when the tab comes back. Leave it until tomorrow and it is gone.

---
title: Bot integrations
description: Answer in a chat server as a bot, using your models, your prompt and your tools.
sidebar:
  order: 2
---

Llooma can answer somewhere other than Llooma. Point it at a chat server, give it a bot account, and
mentioning that bot in a room gets a reply written by your model, with your instructions and your
tools behind it.

[Chatto](https://chatto.run/) is the only chat server supported today. Everything specific to it
sits in one folder, so a second one is a new folder rather than a new architecture.

Under _Settings → Bot integrations_. You can configure several: two rooms on two servers, answered
by two different models with two different characters, are two integrations.

## What it does not do

No conversation is created in Llooma. The bot reads the room when it is called, answers, and forgets.
Nothing appears in your sidebar, nothing is stored on your side, and the chat server stays the only
place the exchange lives.

That is a deliberate choice rather than a missing feature. Keeping a second transcript beside the
real one means two records of the same conversation, and they start disagreeing the first time
somebody edits or deletes a message. It also means the memory, notes and compaction a persona has in
Llooma are not part of this: a persona used here contributes its prompt and nothing else.

## Setting one up

You need a bot account on the chat server first. In Chatto, that is _Server Admin → Bots → Create
Bot_, and the API key is shown once.

Three things are easy to miss, and each of them ends with a bot that looks configured and never
answers:

- **A bot starts with no permissions.** On its detail page, grant `message.post`, and
  `message.post-in-thread` if it should answer inside threads. For reading, `message.read` covers a
  room; `message.read-interactions` limits it to threads where it was mentioned.
- **The bot has to be a member of the room.** Membership alone does not let it read anything, but
  without it nothing works at all.
- **A bot cannot open a direct message.** You start the conversation, and it can then read and
  answer in it.

Then, in Llooma: _Add an integration_, paste the address and the key, and the connection is checked
before anything is saved. The bot is enabled on arrival, but it does not run until you choose a
model, and the card says so.

Nothing needs to reach Llooma from the outside. There is no webhook to configure, no public address
to expose and no port to open: Llooma asks the chat server what happened, never the reverse. An
instance on your laptop works exactly like one on a server.

## What wakes it up

Four kinds of activity, and only these four:

| What happened                           | Where                       |
| --------------------------------------- | --------------------------- |
| Somebody wrote in a direct message      | A DM a person opened        |
| Somebody mentioned the bot              | A room, or inside a thread  |
| Somebody replied to one of its messages | Anywhere                    |
| Somebody wrote in a thread it follows   | A thread it was called into |

The third and fourth are what make a conversation possible. Mentioning the bot in a room makes it
follow that thread, so the next question does not need the `@` again.

Everything else the account receives is ignored. A bot that answered every reaction and every
message in the room would be a bot you turn off within the hour.

## What the model is shown

The chat server sends a pointer to one message. Everything around it is a request Llooma chooses to
make, so how much of the room reaches a model is your decision:

- **Only the message that called it.** One message, one request, nothing else read.
- **The messages just before**, six by default, up to forty. The usual choice, because "what do you
  think?" means nothing on its own.
- **The whole thread**, root included.

Speakers are named inside the text rather than flattened into roles. Three people turned into a
single `user` read as one person contradicting themselves; with names in front, a model handles the
room the way a person reading it would. The bot's own past messages are the exception, and become
what they are.

Two things worth knowing. Anything written after the message that called the bot is dropped, because
answering a question with the replies to it already in hand is answering a different question. And
reading the room before a mention needs `message.read`: the narrow permission covers threads, not
room history.

## Where the answer lands

- **Where it was asked.** In a thread if the question was in a thread, in the room otherwise.
- **Always in a thread.** A question asked in the open gets a thread rooted on it, which is what
  keeps a busy channel readable. Direct messages have no threads, so this cannot apply there.
- **Always in the room.** The opposite, with the reply attribution kept so a threaded question still
  comes back visibly linked to what it answers.

A long answer is split on paragraph boundaries rather than truncated, and only the first part
carries the reply attribution.

## Who the bot is

Three sources, one at a time:

- **Your usual system prompt**, which is what a conversation started here would get, per-model
  rewrites included. The default.
- **A persona's prompt.** Its prompt, and nothing else: no memory, no library conversation, no
  knowledge.
- **Instructions written here**, for a bot that is nobody else.

Tools are picked from the same list the composer offers: web search, page reading, the current date,
reasoning. Interactive choices are not offered, because they draw buttons and a chat server has
nothing to draw them with. A tool the instance does not provide stays off however it is ticked.

## Guard rails

A bot in a room with other bots is a loop waiting to happen, so a few limits are not configurable:

- Messages from bots, including its own, never trigger an answer.
- An activation older than ten minutes is dropped. Coming back after a day of downtime should not
  produce twenty late replies to conversations that have moved on.
- Sixty replies an hour per integration, at most. A loop that gets past everything else costs an
  hour, not a month.
- Each activation is answered once, recorded before the answer is written, so a slow model cannot
  produce the same reply twice.

## Limits

The chat server is asked what happened every few seconds, five by default, rather than being
listened to over a live connection. Chatto's realtime channel is binary protobuf and a moving target
in the 0.x line; the notification list is ordinary JSON over the same API as everything else. A few
seconds of delay is not what makes an assistant useful or useless, and the day it is, only that one
file changes.

Replies are posted whole. There is no streaming, so a long answer arrives at once rather than
appearing word by word.

The bot runs in the Llooma process, which means one process: an instance behind a load balancer
would poll once per replica. That is the same limit generation already has, and it is fixed the same
way on the day anyone runs into it.

Chatto's API is experimental before 1.0 and its bot accounts arrived in 0.5. Pin the server version
you run. When something breaks, it breaks in one small folder.

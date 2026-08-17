---
title: Personas
description: Reusable characters with their own prompt, model, avatar and voice.
sidebar:
  order: 1
---

A persona is a named bundle: a system prompt, a model, an avatar, an opening line. You build it once
in the Library and then talk to it, rather than pasting the same instructions into a fresh
conversation every time.

None ship with the app. A new install has an empty Library and a store to pick from, which is the
whole of the difference: what is in your Library is what you put there, and what you put there is
what your backup contains.

## What a persona holds

| Field          | What it does                                                               |
| -------------- | -------------------------------------------------------------------------- |
| Name           | Shown in the Library, the sidebar and the conversation title               |
| Tagline        | One line under the name, for your own benefit                              |
| Avatar         | A glyph the app draws, an image, or initials on a colour from a fixed set  |
| System prompt  | The whole of the character. This is the part that matters                  |
| Greeting       | Posted as the first assistant message, so the chat opens rather than waits |
| Model          | Yours by default; name one only if this persona needs a particular model   |
| Reply language | What it answers in, whatever language it was written in                    |
| Temperature    | Optional, applied to the conversation                                      |
| Suggestions    | Starter prompts offered on the home screen                                 |
| Knowledge      | Pieces of [knowledge](/features/knowledge/) attached to every chat         |
| Web search     | Whether the conversation starts with search on                             |

### The reply language

A persona answers in the language you choose for it, not the one its prompt happens to be written
in. Empty means the interface's language, so it follows you; type anything else and it follows that
instead. Reading Llooma in French and wanting this one assistant to answer in Spanish is an ordinary
thing to want.

It is written into the conversation's system prompt when the chat starts, as a sentence, rather than
left to the model to work out. Inferring it is exactly what goes wrong: an English prompt makes an
English answer feel right to the model even when everything around it is French. The sentence itself
is editable under _Settings → Tools → System instructions_, like the others the app builds.

## Calling one into a conversation

Type `@` in any conversation and the personas you have installed are offered, filtered as you type.
Pick one and it answers that message, in place of the conversation's own assistant: naming somebody
is choosing them, not adding them.

What answers is the **whole persona**, not its prompt. Its model, its server, its temperature, its
web search, its language. Which is the useful part: a conversation can run on a small local model
and ask an expensive specialist for one opinion inside it, without leaving the conversation or
losing its thread.

The persona reads everything above, exactly as the assistant does. Its own ongoing conversation is
untouched: calling it here changes nothing there.

### Several at once

Several personas in one message get several replies, each labelled with its name and its face. By
default they answer **in the order you named them, each having read the ones before**, which is what
a conversation with several people is. _Settings → Tools → Personas_ turns that off, and each is
then handed the same question and none of the others' answers, for when you want independent
opinions rather than a discussion.

Every reply is a full generation over the whole conversation, so three names cost three answers.

### Who said what

A reply written by a persona carries its name, and later turns are told: the model reads
`[Maïté] …` and a line saying the conversation has more than one participant. Without it, the next
model to read the conversation takes those words for its own and carries on from something it never
wrote.

The name is stored on the message rather than looked up. Renaming or deleting a persona does not
rewrite what it already said.

## One persona, one conversation

Launching a persona opens its conversation, and launching it again returns to the same one. A
persona is someone you keep talking to, not a template you instantiate ten times. Delete that
conversation and the persona goes back to being unstarted, ready to open a fresh one.

The values are **snapshotted into the conversation** when it is created. Editing the persona
afterwards does not rewrite the chat already under way, and the conversation's own settings stay
yours to change. A persona is a starting point, not a layer that keeps overriding what you do.

That also means the persona's system prompt is marked as edited on the conversation, so the global
and per-model prompts do not resolve on top of it. The one exception is a locked instance prompt in
server mode, which is prepended server-side and cannot be displaced. See
[Security](/guides/security/).

## The store

The personas offered for installation are not part of the application. The app reads them from a
store over the network, which is why one is added by a pull request rather than by a release. Open
the Library and choose _Persona store_: search it, filter it by where a persona came from and what
language it speaks, and install the ones you want.

Installing **copies**. The persona lands in your Library with a new identity and is yours to edit or
delete; it only remembers where it came from, so the store can show it as already installed. Any
knowledge attached to it is copied in too, which is what a bundle is for.

Search it, filter it by where a persona came from, and read it as cards or as a list: the toggle
sits at the end of the filters and the choice is remembered.

There is no language filter, and that is a decision rather than an omission. A persona is written in
one language and answers in whichever you ask it to, so what it happens to be written in tells you
nothing about whether it is for you. Models stopped being monolingual; the filter followed.

The public store is served from this site, at [llooma.eu/store](/store/personas/index.json), and its contents
live in the
[`personas/` folder of the repository](https://github.com/cedhuf/llooma/tree/main/personas).

### Running your own store

The app knows one address, and every path in the listing is relative to it, so pointing it somewhere
else is a single change with nothing to migrate. Copy the `personas/` folder, serve it over HTTP,
and give the app its address.

That address is under _Settings → Tools → Personas_:

- **Local mode**: yours, in your own settings.
- **Server mode**: the instance's. Everyone sees it, only an admin changes it, and the server is
  what fetches it. `PERSONA_STORE_URL` sets what it starts as; the admin panel overrides that.

A store is a folder with an `index.json` and the bundles it names. Anything that serves static files
will do: a web server, an object bucket, a Pages site, a share on the local network. Nothing about
it is specific to us.

A model is never named in a store persona. There are hundreds of them across nearly as many
providers, all naming them differently and all revising them constantly, so installing uses **your**
default model. Change it afterwards if it does not suit; leaving it as _your default model_ is a
perfectly good answer, and the one that survives you changing providers.

### If the store cannot be reached

Nothing is bundled, so a first launch with no network shows an empty store. The listing is cached
once it has arrived, so only that very first launch depends on it. In server mode the instance
fetches on your behalf, so one machine holds the listing for everyone on it.

The address is under _Settings → Tools → Personas_. In local mode it is yours. In server mode it is
the instance's: everyone sees it, only an admin can change it, and `PERSONA_STORE_URL` sets what it
starts as.

### Is it still the one I installed?

Every persona in the store carries a fingerprint of what it says: its prompt, its greeting, its
name, its avatar, its suggestions. Nothing else, so changing the model it runs on is not a change to
the persona.

The same fingerprint is recorded when you install it, and comparing the two answers two different
questions:

| The card says       | What happened                                              |
| ------------------- | ---------------------------------------------------------- |
| _Installed_         | Exactly as published                                       |
| _Installed, edited_ | You have changed it since                                  |
| _Update_            | A newer version has been published                         |
| _Update_ + edited   | Both, and updating replaces your changes, so it asks first |

Editing a persona back to what it was makes it the store's persona again. That is why it is a
fingerprint rather than a flag: a flag would stay lit and lie.

Installing belongs to the store; updating and restoring belong to your copy. So a store card always
offers its persona, whatever you already have, and your copy's own controls sit beside it as icons:
update it to a newer published version, or put the published text back over your edits. Both replace
what is there and both ask first whenever there is something of yours to lose.

**Update all**, next to the refresh control, takes every waiting revision at once. It skips the ones
you have edited, deliberately: a single press that quietly overwrote everything someone had rewritten
would be the one press nobody could undo.

**Automatically**, under _Settings → Tools → Personas_, does the same thing whenever the listing is
read, and to the same restricted set. An admin can turn it on for a whole instance under
_Settings → Admin → User permissions_, whatever each account chose for itself.

Updating replaces what was written and keeps what is yours: the same id, the model you chose, the
conversation you are having with it, the knowledge you attached. Updating is not reinstalling.

The same reading tells an admin whether what they are handing out is the store's persona or their
own rewrite of it, without anyone having to declare which.

The listing also carries a `sha256` of each bundle, checked when you install it. It is not a defence
against the store itself, since a listing and a bundle come from the same place over the same
connection: it catches a mirror that has drifted, a cache that has rotted, and a bundle edited
without the listing being rebuilt. Whoever contributes a persona writes plain JSON and never has to
know it exists.

## Importing a file

The Library reads three formats from the same _Import_ button:

- **Bundles**, which is what the store serves and what the _Export_ action on a persona produces.
  This is the only form that carries attached knowledge with it.
- Llooma's older raw export, still read.
- **OpenWebUI model exports.** The system prompt, description, avatar, suggestion prompts, tags,
  temperature and stop sequences all carry over, which makes the existing ecosystem of characters
  usable here without rewriting them.

A persona is recognised as a bundle when the file says `"format": "llooma.persona"`, and as
OpenWebUI's when it carries `base_model_id`, `params` or `meta`. Nothing is guessed beyond that.

## Pinning them

Turn on _Settings → Interface → Sidebar → Pin personas in the sidebar_ and the ones you have talked
to sit at the top of the list, most recent first. The home screen can show the same row, with its
own count, under _Settings → Interface → Home screen_.

## Sharing them (server mode)

All of it happens in the store, which has two views for everyone and a third for an administrator:

| View            | What it holds                                                    |
| --------------- | ---------------------------------------------------------------- |
| **Store**       | What you can install: the catalogue, and what your instance adds |
| **My personas** | The ones you wrote, and the ones you installed and then changed  |
| **Shared**      | Everything the instance currently shares (admin only)            |

The cards are the same in all of them, and so are their controls: what someone is not allowed to do
is drawn and refused rather than removed, because a card that loses a button depending on who is
looking is a second card to design.

One list answers "what am I actually sharing?". There is no share switch in a persona's editor any
more: a checkbox buried there meant remembering which personas had been ticked, with nowhere to go
and look.

Underneath, the two cases behave differently, and the difference is worth knowing.

**Their own persona** is handed out as a copy. Editing it republishes, so what the store offers is
what they currently have rather than a photograph taken the day they first shared it. Deleting it
stops sharing it.

**A store persona** is handed out as a reference. Nothing is installed and nothing is copied: what
is recorded is the store's id, so the catalogue keeps listing it once, and what users install is the
store's own bundle, later revisions included. It costs the admin nothing: their library does not
gain a persona they never wanted.

Which is why _My personas_ leaves out installs nobody has touched. Handing out a byte-identical copy
of a store persona freezes it for whoever takes it; relaying does the same job better, and those are
already in the store view with the same button.

Installing copies, either way, and does not subscribe: an admin editing what they share does not
reach into the copies people are already talking to, and withdrawing something does not take back
the copies people have. What it does instead is **offer** the newer version, in the store, as an
update you take or leave, exactly as a store revision is.

A persona shared **from a library** does not carry its attached knowledge: the documents live in
that library, and their ids mean nothing in anyone else's. Share a bundle file if they matter. A
relayed one has no such problem, since what users install is the bundle itself.

### Where else it has spoken

A persona called into a conversation with `@` leaves a record in **its own** conversation: a note
saying which conversation wanted it, with the question and its answer folded underneath. Without it,
a persona you had just spent an afternoon consulting elsewhere greeted you as if nothing had
happened, which is the wrong behaviour for the one object in the app that is meant to be an ongoing
relationship.

The record holds **the question and the answer, and nothing else**. Not the thread around them, not
the other participants. A mention would otherwise copy somebody else's conversation into this one,
and the record can be handed to the model, where anything bigger would spend a context window on a
conversation the persona was not part of.

The model has not read it. It is a record, like every other note, until **Add to this conversation**
puts the two messages here for real, framed so the model understands they were said elsewhere. That
framing is the `Exchange brought back from elsewhere` prompt in _Settings → Tools → System
instructions_, so it can be reworded. Once added, the offer is replaced by a line saying so, since
adding the same exchange twice is the one mistake worth preventing.

A persona nobody has opened yet has no conversation of its own, and mentioning it does not create
one: a conversation appearing in the sidebar because you typed `@` once is a conversation you did
not start. The exchange still lives where it happened.

### Showing the tour again

Under _Settings → Admin → Developer options_, **Show the welcome tour again** plays it once for
everyone on their next load, whether or not they have seen it. It is the closest thing to a release
note nobody can miss: the tour says what the app is and where things are, so it is worth replaying
after a version that moved either.

It stamps a moment rather than clearing a flag on each account, so nothing on the server has to track
who has seen what, and the tour appears exactly once per person per stamp.

### What a user's store contains

A store is the door people already know, from every phone they own, so the door stays where it is
and works the way it works. What an instance decides is what is behind it.

Under _Settings → Admin → User permissions_:

| What the store shows                  | What users get                                          |
| ------------------------------------- | ------------------------------------------------------- |
| The public store, plus what you share | The whole public catalogue, alongside your own personas |
| Only what you share                   | Your personas and your relays, and nothing else         |

The second is not a locked version of the first: it is a different store. There is no disabled card
and no note about asking an administrator, because nothing is being refused. An instance run for
children, with persona creation turned off as well, shows exactly the six personas it was given.

An admin always sees the whole public catalogue, whatever the mode: it is what they choose from.

The other switch, _Allow users to create personas_, is unchanged and independent: writing one and
taking one are different things to allow.

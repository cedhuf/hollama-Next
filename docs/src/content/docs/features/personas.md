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

| Field         | What it does                                                               |
| ------------- | -------------------------------------------------------------------------- |
| Name          | Shown in the Library, the sidebar and the conversation title               |
| Tagline       | One line under the name, for your own benefit                              |
| Avatar        | A glyph the app draws, an image, or initials on a colour from a fixed set  |
| System prompt | The whole of the character. This is the part that matters                  |
| Greeting      | Posted as the first assistant message, so the chat opens rather than waits |
| Model         | Resolved to a concrete server when the conversation starts                 |
| Temperature   | Optional, applied to the conversation                                      |
| Suggestions   | Starter prompts offered on the home screen                                 |
| Knowledge     | Pieces of [knowledge](/features/knowledge/) attached to every chat         |
| Web search    | Whether the conversation starts with search on                             |

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

Cards or a list, whichever suits: the toggle sits at the end of the filters, and the choice is
remembered.

The public store is served from this site, at [llooma.eu/personas](/personas/), and its contents
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
default model. Change it afterwards if it does not suit.

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

An admin offers a persona to everyone on the instance in two genuinely different ways, and the
difference is worth knowing.

**Sharing their own.** Mark a persona _shared_ in its editor. Users get a copy of it, labelled
_Shared by admin_. This is the one for a persona they wrote, and equally for one they installed from
the store and then rewrote: it is theirs now, and the store's original goes on being listed beside
it.

**Relaying one from the store.** The _Offer to everyone_ button on a store card. Nothing is
installed and nothing is copied: what is recorded is the store's id, so the card stays one card,
keeps its _Official_ badge and gains an _offered_ one, and what users install is the store's own
bundle. A later revision reaches them the same way it reaches everyone else.

Relaying costs the admin nothing: their library does not gain a persona they never wanted, and the
catalogue does not gain a second face with the same name.

Installing copies. It does not subscribe: an admin editing the shared persona afterwards does not
reach into the copies people are already talking to, and un-sharing one does not take back the
copies people already have. What it does instead is **offer** the newer version, in the store, as an
update you take or leave.

A persona shared **from a library** does not carry its attached knowledge: the documents live in
that library, and their ids mean nothing in anyone else's. Share a bundle file if they matter. A
relayed one has no such problem, since what users install is the bundle itself.

### What a user's store contains

A store is the door people already know, from every phone they own, so the door stays where it is
and works the way it works. What an instance decides is what is behind it.

Under _Settings → Admin → User permissions_:

| What the store shows                  | What users get                                          |
| ------------------------------------- | ------------------------------------------------------- |
| The public store, plus what you offer | The whole public catalogue, alongside your own personas |
| Only what you offer                   | Your personas and your relays, and nothing else         |

The second is not a locked version of the first: it is a different store. There is no disabled card
and no note about asking an administrator, because nothing is being refused. An instance run for
children, with persona creation turned off as well, shows exactly the six personas it was given.

An admin always sees the whole public catalogue, whatever the mode: it is what they choose from.

The other switch, _Allow users to create personas_, is unchanged and independent: writing one and
taking one are different things to allow.

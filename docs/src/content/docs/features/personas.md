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

The public store is served from this site, at [llooma.eu/personas](/personas/), and its contents
live in the
[`personas/` folder of the repository](https://github.com/cedhuf/llooma/tree/main/personas).

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

An admin can mark a persona **shared**. It then appears for every user in the _Persona store_,
labelled _Shared by admin_ and alongside the public ones, with an _Install_ action that makes an
editable personal copy. The copy remembers what it came from, so the original stops being offered
twice.

Installing copies. It does not subscribe: an admin editing the shared persona afterwards does not
reach into the copies people are already talking to.

An admin can also stop users creating personas of their own, under
_Settings → Admin → User permissions_. Shared personas stay installable either way.

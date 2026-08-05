---
title: Personas
description: Reusable characters with their own prompt, model, avatar and voice.
sidebar:
  order: 1
---

A persona is a named bundle: a system prompt, a model, an avatar, an opening line. You build it once
in the Library and then talk to it, rather than pasting the same instructions into a fresh
conversation every time.

Four ship with a new install, as examples to read and take apart: Max (a personal trainer), Lou (a
friendly ear), Nova (an everyday assistant) and Pixel (video games). Delete the ones you do not
want. They are not re-added.

## What a persona holds

| Field         | What it does                                                               |
| ------------- | -------------------------------------------------------------------------- |
| Name          | Shown in the Library, the sidebar and the conversation title               |
| Tagline       | One line under the name, for your own benefit                              |
| Avatar        | An image, or initials on a colour picked from a fixed set                  |
| System prompt | The whole of the character. This is the part that matters                  |
| Greeting      | Posted as the first assistant message, so the chat opens rather than waits |
| Model         | Resolved to a concrete server when the conversation starts                 |
| Temperature   | Optional, applied to the conversation                                      |
| Suggestions   | Starter prompts offered on the home screen                                 |
| Knowledge     | Pieces of [knowledge](/llooma/features/knowledge/) attached to every chat  |
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
[Security](/llooma/guides/security/).

## Importing

The Library reads two formats from the same _Import_ button:

- Llooma's own export, which is what the _Export_ action on a persona produces.
- **OpenWebUI model exports.** The system prompt, description, avatar, suggestion prompts, tags,
  temperature and stop sequences all carry over, which makes the existing ecosystem of characters
  usable here without rewriting them.

A persona is recognised as OpenWebUI's when the file carries `base_model_id`, `params` or `meta`.
Nothing is guessed beyond that.

## Pinning them

Turn on _Settings → Interface → Sidebar → Pin personas in the sidebar_ and the ones you have talked
to sit at the top of the list, most recent first. The home screen can show the same row, with its
own count, under _Settings → Interface → Home screen_.

## Sharing them (server mode)

An admin can mark a persona **shared**. It then appears for every user under _Shared by admin_ in
the Library, with an _Install_ action that makes an editable personal copy. The copy remembers what
it came from, so the original stops being offered twice.

Installing copies. It does not subscribe: an admin editing the shared persona afterwards does not
reach into the copies people are already talking to.

An admin can also stop users creating personas of their own, under
_Settings → Admin → User permissions_. Shared personas stay installable either way.

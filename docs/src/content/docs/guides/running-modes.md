---
title: Running modes
description: Local keeps everything in the browser; server signs users in and keeps the keys.
sidebar:
  order: 2
---

Llooma runs in one of two modes, chosen at deploy time with `PUBLIC_MODE`. This is the decision
everything else follows from: where data lives, who can see it, and whether provider API keys ever
reach a browser.

## `local` (default)

Single user, browser only. Sessions, knowledge, server connections and preferences all live in
the browser's `localStorage`, and you bring your own providers from _Settings → Servers_. No
accounts, no database.

Best for personal use, a phone PWA, or the upcoming desktop app.

The catch: nothing syncs. Two browsers are two separate installations, and clearing site data
clears everything. Export a backup from _Settings → Data_ if that matters to you.

## `server`

Multi-user, self-hosted. Users sign in with email and password, OIDC, or both. Data is stored
server-side in SQLite **per user**, and **provider API keys never leave the server**. They are
encrypted at rest and injected into requests server-side, so a signed-in user can use a model
without ever being able to read the key behind it.

An admin configures the shared providers and which models to expose, and may allow users to add
their own keys on top.

```shell
PUBLIC_MODE=server
```

All server-mode state lives under `DATA_DIR`, one directory to bind-mount to persist everything.

:::tip[Why server mode exists]
It is what makes device synchronisation possible (a conversation started on a phone continues on
a laptop), and what makes a shared instance possible at all.
:::

## What changes between them

|                       | `local`                              | `server`                                           |
| --------------------- | ------------------------------------ | -------------------------------------------------- |
| Where data lives      | Browser `localStorage`               | SQLite under `DATA_DIR`, per user                  |
| Sync across devices   | No                                   | Yes                                                |
| Accounts              | None                                 | Email + password and/or OIDC                       |
| Provider keys         | In the browser                       | On the server, encrypted                           |
| Talking to a provider | Browser → provider, via `/api/proxy` | Browser → `/api/llm`, server → provider            |
| Sharing settings      | _(none)_                             | Admin can share and lock providers, prompts, tools |

That last row is the reason the generic proxy is **disabled outright in server mode**: it takes
whatever origin it is given and needs no signed-in user, which in front of a multi-user instance
would be an open relay. See [Security](/llooma/guides/security/).

---
title: Personal or shared
description: One install, and accounts are the only thing that changes between a personal instance and a shared one.
sidebar:
  order: 2
---

Llooma is one application, installed one way. Data lives server-side in SQLite, provider API keys
are encrypted there and never reach a browser, and a turn runs in the server so a reload does not
lose it.

What an instance decides is whether anyone signs in.

## A personal instance

Install it, start it, use it. No login screen, no secret to generate, no account to create: the
instance belongs to whoever opens it, and that owner is created on first run.

```shell
DATA_DIR=./data
```

That is the whole configuration. All state lives under `DATA_DIR`, one directory to bind-mount to
persist everything, including the secret the instance generates for itself to encrypt provider keys
with.

## A shared instance

Configure a way to sign in and the same install becomes a multi-user one: a login page appears,
data is stored per user, and an admin configures the shared providers and which models to expose,
and may allow users to add their own keys on top.

```shell
AUTH_CREDENTIALS=true   # email and password
OIDC_ISSUER=https://id.example.com   # or an identity provider, or both
```

There is no separate switch for this, on purpose. A switch and the configuration could disagree,
and both ways of disagreeing are bad: accounts demanded with no provider configured is an instance
nobody can enter, and accounts turned off with an identity provider configured is one anybody can.

## What changes between them

|                     | Personal                       | Shared                                             |
| ------------------- | ------------------------------ | -------------------------------------------------- |
| Signing in          | Nobody does                    | Email and password, OIDC, or both                  |
| Who the data is for | The instance's implicit owner  | Each account, separately                           |
| Sync across devices | Yes, the data is on the server | Yes                                                |
| Provider keys       | On the server, encrypted       | On the server, encrypted                           |
| Sharing settings    | Nobody to share with           | Admin can share and lock providers, prompts, tools |

:::note[Local mode is gone]
Earlier versions had a `local` mode that kept everything in the browser's `localStorage` and ran
turns in the tab. It has been retired: a personal instance is now a server instance that nobody
signs into. Data held in a browser does not migrate on its own, so export a backup from
_Settings → Data_ before upgrading, and import it afterwards.
:::

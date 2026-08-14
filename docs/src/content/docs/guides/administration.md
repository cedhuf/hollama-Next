---
title: Administration
description: 'Running an instance for other people: what you can share, lock, and hand out.'
sidebar:
  order: 5
---

Server mode only. _Settings → Admin_ appears for accounts with the admin role, bootstrapped by
`ADMIN_EMAIL` or granted through an OIDC claim. See
[Configuration](/reference/configuration/).

The tab is governance, not plumbing. Provider connections are configured in the Servers tab like
anyone else's; here you decide what your users get from them.

## The three states

Almost every control on this page repeats the same choice:

| State           | What users see                                                |
| --------------- | ------------------------------------------------------------- |
| **Off**         | Nothing. They configure it themselves, or do without          |
| **Locked**      | Your value, read-only, with a badge saying where it came from |
| **Overridable** | Your value as the default, which they can replace             |

What you share is a **snapshot of your own settings**, taken from the tab where you configured it.
There is no separate copy to maintain: you set the search engine up in your Tools tab, then come
here and decide whether it is everyone's.

## What can be shared

- **Web search.** Your backend URL, its type and its token. Users never see the token.
- **Web fetch.** On or off, with your page and character caps.
- **System prompts.** The global one and the per-model ones.
- **Title generation.** The setting and the model. The title model works even when it is not in the
  shared model list, since a user never picks it.
- **Compaction.** The model, the automatic toggle and the threshold.

## Models

Each system server lists its models, and you pick which ones users may use. A model you do not tick
does not appear in their picker, and `/api/llm` refuses it if asked for directly.

You can also set a **default model for users**, either as their starting point or as a fixed choice.

## Permissions

Two switches under _User permissions_:

- **Allow users to add their own provider connections.** Off means the instance's models are the
  only models. On means a user can paste their own key and use whatever they like alongside them.
- **Allow users to create their own personas.** Off leaves them with the ones you share. Installing a
  shared [persona](/features/personas/) still works either way.

## Accounts

There is **no self-registration**. You create accounts here, with an email, a password and a role,
or users arrive through OIDC (auto-provisioned on first sign-in unless you set
`OIDC_AUTO_PROVISION=false`).

Deleting a user deletes their data with them. Their conversations, knowledge and personas are theirs
alone, and nothing of it is shared with the instance.

## Sharing is enforced, not suggested

This is the part worth trusting. Shared tools, model allow-lists and locked prompts are applied in
the endpoints, `/api/fetch` and `/api/llm`, not only in the interface. A hand-crafted request from a
signed-in user is policed exactly like the app's own.

A locked instance prompt is guaranteed **present** rather than exclusive: it is prepended in the
proxy, so a persona's system prompt adds to it instead of replacing it. See
[Security](/guides/security/), which is worth reading in full before an instance is reachable
from anywhere you do not control.

## Provider keys

They are encrypted at rest with a key derived from `AUTH_SECRET`, injected into requests
server-side, and never sent to a browser. A signed-in user can use a model without ever being able
to read the key behind it. This is the main thing server mode buys, and it is why `AUTH_SECRET` is
required rather than optional.

Losing `AUTH_SECRET` means the stored keys cannot be decrypted. Back it up with the same care as the
database.

## Developer options

One button, at the bottom: replay the welcome tour. It exists so the tour can be reviewed on demand
rather than only once, in the ten seconds before anyone was paying attention.

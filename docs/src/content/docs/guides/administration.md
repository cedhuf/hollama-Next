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

In _Settings → Users_, a tab of its own beside this one and gated the same way. Admin is how the
instance behaves; that tab is who is on it, which is a list of people rather than a set of policies.

There is **no self-registration**. You create accounts there, with an email, a password and a role,
or users arrive through OIDC (auto-provisioned on first sign-in unless you set
`OIDC_AUTO_PROVISION=false`).

Each row shows when that account was last around, in hours up to a day and then in days. It is
recorded at most every few minutes, which is all a figure like that is worth, and left blank for an
account nobody has opened since the instance was updated: saying "created three months ago" under a
heading that reads "last seen" would be a plausible lie, and a blank is not.

Deleting a user deletes their data with them. Their conversations, knowledge and personas are theirs
alone, and nothing of it is shared with the instance.

## Credit limits

A guardrail, not an accounting system. It exists so an instance run for a handful of people catches
the runaway loop and the forgotten tab; it is not built to invoice anybody, and it says so on every
screen it appears on.

Set the default allowance and how often it starts again in _Settings → Users_, above the list, and
give an account its own in the row beside its name. An empty field on a row means **follow the
instance**, which is not the same as typing the same number: an account that inherits follows the
default when you change it.

Zero means no limit, and is what an instance nobody has configured has. Nothing changes for anyone
until you decide otherwise.

### What is counted

What each provider reports it used, and nothing else. Llooma's own token estimate divides characters
by 3.7 — it exists to colour the load ring and to decide when to compact, and charging somebody with
it would be inventing a figure and then acting on it.

A model with **no price set** is not counted at all. That is deliberate, and it is not the same as
counting it as free: a model nobody got round to pricing would otherwise let somebody run for ever
without ever approaching a limit, and the total would quietly be a lie. Prices go in
_Settings → Servers → Models and pricing_, per connection, in that provider's own currency.

Which is why, **while an allowance is in force, an unpriced shared model is refused** rather than
served uncounted. What is not counted is not limited, and one forgotten model is an unlimited
allowance for everybody, silently, for as long as nobody notices. The Users tab lists them so the
cause is where the limit was set, and the person refused is told which model has no price rather
than left thinking the app is broken.

With no allowance anywhere, nothing is refused and nothing is counted, which is the state of an
instance that has not configured any of this.

Only the instance's own connections are metered and limited. A personal server is somebody's own key
and their own bill: counting it against an instance allowance, or refusing it in the name of one,
would be neither.

Every account can see its own figure in _Settings → Profile_: what it has spent, what it is allowed,
that the allowance was set by an administrator, and when the counter starts again. Administrators
see theirs too — being able to raise your own ceiling is not a reason to be unable to see it.

### It never cuts a conversation

The limit is checked **before a turn starts**, in the relay every request passes through. A turn
already under way always finishes, even if it goes over. Someone over their allowance is told so
when they send the next message, and listing models still works — an app that cannot draw its own
settings page is broken rather than restrained.

### What it is approximate about

Currencies. A price belongs to the connection that charges it, because the same model costs
different amounts at two providers and nothing on an Ollama in the next room. The limit, though, is
one number: on an instance mixing a provider billing in euros with one billing in dollars, the total
adds currencies together, and no conversion happens anywhere.

For catching abuse and inattention that is good enough, and it is the trade the feature was asked
for. If a figure ever has to be defended rather than glanced at, it needs either one currency for
the instance or one limit per currency.

Usage is recorded per day, so the period is a question asked when the figure is read. Switching from
monthly to weekly gives a weekly figure for the weeks that have already happened, rather than a
counter that restarts at zero.

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

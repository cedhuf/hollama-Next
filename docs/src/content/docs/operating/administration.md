---
title: Administration
description: 'Running an instance for other people: what you can share, lock, and hand out.'
sidebar:
  order: 2
---

Server mode only. _Settings → Admin_ appears for accounts with the admin role, bootstrapped by
`ADMIN_EMAIL` or granted through an OIDC claim. See
[Configuration](/operating/configuration/).

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

Overridable behaves differently for the prompt rewrites, and deliberately. Every other setting is
one value, so a user replacing it replaces the whole thing. The rewrites are twenty independent
prompts, so they merge: a user who rewrites the summary keeps your version of the other nineteen.

## What can be shared

- **Web search.** Your backend URL, its type and its token. Users never see the token.
- **Web fetch.** On or off, with your page and character caps.
- **System prompts.** The global one and the per-model ones, from the Prompts tab.
- **Prompt rewrites.** The instructions the app adds on its own behalf: the date line, the search
  router, the compaction rules, the native tool descriptions. Also the Prompts tab.
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
  shared [persona](/behaviour/personas/) still works either way.
- **Let personas remember things about their user.** On by default. Off takes the ability away
  entirely: the tools are never offered and nothing is injected, so a persona behaves as it did
  before memory existed. What people already wrote is left alone, because erasing the most personal
  data on the instance should not be a side effect of a switch. Each memory belongs to one account
  and is never visible to anyone else, you included.

## Voice

Sharing only, and the same three states: which model transcribes, and whether speaking is offered at
all. Worth publishing on a shared instance, because you are usually the only person who could have
set a transcription model up: without it, the microphone exists for you and for nobody else.

Only models marked as audio are offered. Mark one under _Models and pricing_ on its connection, and
price it while you are there: transcription is billed per minute of audio.

## Images

Sharing only, like every other feature on this tab: a default image model and a prompt writer, with
the same three states as everything else here: off, locked, or overridable.

Whether this instance draws at all is not a switch here. It is whether a model is marked as one that
draws, under _Models and pricing_, and whether it is shared on its connection. Both of those are
decisions taken where the models already live, and until they are, nobody but you sees the Images
page. Price the model while you are there: image models are billed per request, and often per minute
of processing.

Which models anyone can actually reach is still the shared-models list on each system connection,
and an image model has to be marked as one under _Models and pricing_ before it can be chosen at
all. Marking it there is also what keeps embedding and speech models out of the chat picker.

Price image models by the unit their provider bills in: per image, per second or per minute rather
than per million tokens. A model with no figure is unpriced, which means it is not counted towards
anybody's spending and is refused outright while a credit limit is in force, so it does not become a
hole in the limit.

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

Set the default allowance and how often it starts again in _Settings → Users_, above the list. It
resets every calendar month, every week (from Monday) or every day, whichever suits how closely you
want to watch.

Each account can have its own, both the figure and the period, folded away behind its row in the
same two controls. An empty field means **follow the instance**, which is not the same as typing the
same number: an account that inherits follows the default when you change it, and one that was given
a copy does not.

Zero means no limit, and is what an instance nobody has configured has. Nothing changes for anyone
until you decide otherwise.

### What is counted

What each provider reports it used, and nothing else. Llooma's own token estimate divides characters
by 3.7. It exists to colour the load ring and to decide when to compact, and charging somebody with
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
that the allowance was set by an administrator, when the counter starts again, and the last thirty
days as a chart, because a total says how much but not whether it happened yesterday or has been
happening all month. Administrators see theirs too; being able to raise your own ceiling is not a reason to be
unable to see it.

The card is drawn whether or not there is a limit. Without one there is no bar, because a bar needs
two numbers: on a personal instance the figure alone is the whole answer, and nothing is ever
refused.

### It never cuts a conversation

The limit is checked **before a turn starts**, in the relay every request passes through. A turn
already under way always finishes, even if it goes over. Someone over their allowance is told so
when they send the next message, and listing models still works. An app that cannot draw its own
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
the server, when a turn resolves its tools and when it reaches a provider, not only in the interface. A hand-crafted request from a
signed-in user is policed exactly like the app's own.

Locked prompt rewrites are checked when a turn starts, in `/api/runs`, against the account that
asked rather than against what the request claims. A client that keeps its own rewrites in local
storage and sends them anyway gets yours.

A locked instance prompt is guaranteed **present** rather than exclusive: it is prepended in the
proxy, so a persona's system prompt adds to it instead of replacing it. See
[Security](/operating/security/), which is worth reading in full before an instance is reachable
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

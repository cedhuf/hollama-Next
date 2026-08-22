---
title: Images
description: Generate pictures from a description, and keep them in a gallery of your own.
sidebar:
  order: 10
---

Llooma can draw. A dedicated page holds everything you have generated, newest first, with the
field that makes new ones at the top.

It is a **server mode** feature only.

## Turning it on

Two things have to be true before the app offers to draw:

1. The instance runs in server mode.
2. At least one model you can reach is marked as an image model.

If either is missing, nothing about images appears at all rather than a control that leads nowhere.
A permanently disabled button is a worse answer than no button.

## Getting there

The gallery is not a third entry beside Home and Library. Those two are where you navigate; drawing
is something you make, so it sits with the other thing you make: **New chat** in the sidebar is a
split control, and its right half opens the gallery in one click. It keeps that shape when the
header folds, as two squares beside the search field.

With the sidebar collapsed to its rail, the same pairing holds: the picture icon sits directly under
New chat and wears its accent, rather than joining the muted destinations below it.

The home screen also carries a strip of your latest pictures, after the personas, scrolling sideways
with a way through to the page at its end. Like every other section there it can be switched off,
under Settings, Interface.

There is no separate switch for the feature. Marking a model as one that draws is the decision, and
on a system connection it only reaches anyone else once it is also shared — so a user sees nothing
until an administrator has done both, and an administrator who wants none of this marks no image
model.

### Marking a model as an image model

No provider reliably says what its models do. `/v1/models` returns a list of identifiers and
nothing else, and some providers do not list their image models on that endpoint at all.

So Llooma guesses from the name, and lets you correct it. Under **Settings, Servers, Models and
pricing**, every model has a small selector saying whether it is for chat, for images, for
embeddings or for speech. The list is grouped by those four, and only the corrections are stored,
so a better guess later still applies to everything you never touched.

This is also what keeps embedding and transcription models out of the chat picker, where choosing
one produces a 400 with no explanation attached.

## Pricing

Image models are rarely billed by the token. Under Models and pricing, each model says what it is
billed **by**: per million tokens, per image, per second, or per minute. Pick the one your
provider's invoice uses and enter that figure; nothing is converted.

The unit is stored even before you have entered a rate, so you can record "this one is billed per
minute" and come back with the number. A model with a unit but no figure still counts as
**unpriced**, which is not the same as free: an unpriced model is not counted towards anyone's
spending, and while a credit limit is in force it is refused outright rather than becoming a hole
in the limit.

What a generation cost is recorded per request and shown on each image, alongside how long the
provider took.

## Providers whose images live elsewhere

Most providers serve chat and images from the same address, and there is nothing to configure.

Some do not. Infomaniak, for one, serves chat from API version 2 under `/openai/v1` and images
only from version 1 under `/openai` — no path appended to the first can reach the second. The
connection form therefore has an **Image endpoint** field under Advanced. Leave it empty unless
your provider needs it; for Infomaniak it is filled in automatically from the product ID.

The same field covers a self-hosted split, where chat runs on one server and something like
ComfyUI runs on another.

When a connection has a distinct image endpoint, Llooma lists models from **both** roots and
merges them, which is usually the only place the image models appear.

## The prompt writer

Image models respond to a different kind of writing than a chat model does: framing, lens,
lighting, palette, level of detail. Turning what you meant into that is a job a text model is good
at.

Under **Settings, Tools, Images** there is a **prompt writer** switch, on by default, and a field
saying which model does the writing. Leave that field on _Default model_ and it uses whatever model
this account normally uses, which is what a blank model field means everywhere else in the app.
Turning the feature off is what the switch is for.

With it on, an **Improve the prompt** button appears beside the field. What it produces is shown
in its own editable box, and that box is what gets sent. It never overwrites what you typed:
clearing it sends your own words again. Both are kept on the image afterwards, so "why does this
not look like what I asked for" stays a question with an answer.

The instruction it follows is editable like every other prompt in the app, under **Settings,
Prompts, Images**.

## Titles

Each picture is named once it exists: three to six words, written by the same text model the prompt
writer uses, from the prompt that made it. It is on by default, and it is a different trade from the
rewriter above it — a rewrite changes what gets drawn and costs a request nobody asked for, a title
changes nothing and costs a dozen tokens beside an image billed by the minute.

The title is what the gallery, the dialog and the home strip all read, falling back to the prompt
when there is none. It is also the **filename** in an export, which is the one piece of metadata
every file manager and every desktop search already indexes.

Its instruction is editable like every other prompt, under **Settings, Prompts, Images**, and the
whole thing is switched off under **Settings, Tools, Images**. Pictures drawn before it existed, or
with it off, simply show their prompt.

## Sharing

An administrator can hand the whole instance a default image model and a prompt writer, using the
same three states as everything else shared here: off, locked, or overridable. See
[Administration](/guides/administration/).

Note what this shares: the *defaults*, not the permission. What makes a model reachable at all is
still the shared-models list on its connection.

Which models are reachable at all is still governed by the shared-models list on each system
connection, exactly as for chat.

## Where the pictures live

The metadata — the prompt, the model, the size, the duration, the cost — is a row in SQLite. The
pictures themselves are files under `DATA_DIR/images/<account>/`, beside the database, so a single
bind mount still holds everything mutable.

They are served by an authenticated route scoped to their owner: an image id is not a permission.
The file type is decided from the bytes when the image arrives, never from what the provider
labelled it, and only PNG, JPEG and WebP are accepted — anything served from the app's own origin
has to be something that cannot carry a script.

Images are **not** included in the JSON backup, which is deliberate: a backup that quietly grew to
several hundred megabytes would be a backup nobody could move. Delete an image and both the row
and the file go.

Getting them out is its own button instead. **Export** at the top of the page offers the latest
image on its own, or everything as a single zip streamed by the server rather than assembled in
memory. The archive carries an `images.json` beside the pictures, holding each one's prompt, model,
duration and cost: a folder of pictures is a folder of pictures, and what made each one only exists
in the app until it is written down next to them.

There are two caps, both generous, both there to stop a runaway rather than to ration anybody: one
on a single image, and one on everything an account holds.

## Waiting

Generation takes tens of seconds and does not stream. The request is long, and nothing is done to
hide that.

What it is not is fragile. The server holds the provider connection, and it writes what it made
**before** it answers. Closing the tab halfway through loses the response, not the picture: it is
in the gallery on the next load.

## Local mode

There is no image generation in local mode. The bytes have nowhere to go — browser storage is
measured in a handful of megabytes and a single image can be several — and the sidebar entry and
settings section simply do not exist there.

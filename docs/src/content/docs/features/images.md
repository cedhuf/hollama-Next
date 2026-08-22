---
title: Images
description: Generate pictures from a description, and keep them in a gallery of your own.
sidebar:
  order: 10
---

Llooma can draw. A dedicated page holds everything you have generated, newest first, with the
field that makes new ones at the top.

It is a **server mode** feature only, and it is **off until an administrator turns it on**. Both
of those are deliberate, and both are explained below.

## Turning it on

Three things have to be true before the Images entry appears in the sidebar:

1. The instance runs in server mode.
2. An administrator has ticked **Allow image generation**, in the Images section of Settings, Admin.
3. At least one model on a connection is marked as an image model.

If any of them is missing, there is no Images entry at all rather than one that leads nowhere. A
permanently disabled button is a worse answer than no button.

### Why it is off by default

Every provider that offers an image model charges for it per request, and often per minute of
processing rather than per token. An instance that started drawing because it was upgraded would
be an instance that surprised whoever pays for it. Turning it on is a decision.

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

## Sharing

An administrator can hand the whole instance a default image model and a prompt writer, using the
same three states as everything else shared here: off, locked, or overridable. See
[Administration](/guides/administration/).

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

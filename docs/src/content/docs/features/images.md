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
on a system connection it only reaches anyone else once it is also shared. A user therefore sees nothing
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

### Models that no catalogue lists

Some capabilities are not a model at the provider at all: they are a dedicated route, so nothing
returns them from `/v1/models` and no amount of asking will. Where Llooma knows of one, it names it
and it appears in the list like any other model.

That is the whole point of naming it. From there it is priced per minute or per image, marked shared
or not, refused while unpriced under a credit limit, and metered against the same allowance, by the
same machinery as everything else rather than by a second path written beside it. If you see a model
in **Models and pricing** that your provider's own documentation calls an endpoint, this is why.

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
only from version 1 under `/openai`, and no path appended to the first can reach the second. The
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

## Shape and quality

The composer asks for a **shape** (square, portrait or landscape) and a **quality**, rather than a
pixel count. Those two are translated into whatever the provider calls them at the moment the
request is sent.

This is not a convenience. Image endpoints have no capability discovery: `/v1/models` returns
identifiers and nothing else, no provider publishes the sizes a model accepts, and the only way to
"ask" would be to send something invalid and read the refusal. So the app cannot know, and a size it
guesses wrong is a 400 that arrives after the thirty seconds, not before them.

A shape survives where a pixel count does not. Every image model offers square, portrait and
landscape; the numbers behind them differ per model and change with each new one. On Infomaniak a
portrait is `1024x1792`, on OpenAI's `gpt-image-1` it is `1024x1536`, and on `dall-e-3`, at the same
provider, it is `1024x1792` again. Quality is worse: `dall-e-3` and Infomaniak take `standard` and
`hd`, `gpt-image-1` takes `low`, `medium` and `high`.

**Where the app has no translation, both controls are disabled and neither field is sent.** The
model then uses its own default, which is valid everywhere. That is the case for self-hosted
OpenAI-compatible endpoints, which are whatever somebody installed, and for any model the app has
not been told about.

Where a provider offers two levels of quality and the app offers three, the bottom two collapse onto
the same request. Collapsing is the honest failure: hiding a control on some providers and not
others would make the same setting mean different things depending on where you are.

Each picture records the shape and quality that were asked for, in the app's words, alongside the
concrete size that was sent. Reusing a prompt therefore carries the intent to a different model
rather than a pixel count that model would refuse.

## Working from a picture

Some models draw from pictures you give them rather than from words alone. Drop one on the composer
from the desktop, or use the paperclip beside the controls. PNG and JPEG, and anything else in the
same drop is counted back to you rather than dropped in silence.

**The control follows the model, not the provider.** Which pictures an endpoint accepts varies
inside a single provider: OpenAI's `gpt-image-1` takes up to sixteen, `dall-e-3` takes none at all,
and Infomaniak's portrait route takes six. So the drop zone is open on a model that works this way
and shut on one that does not, and it says which when you drag something onto it. Switching to a
model that takes none puts down whatever was attached and tells you it did, rather than holding a
picture you would believe was going out.

**Some models need a word in the prompt.** Where a picture supplies a likeness, the prompt is how
the endpoint is told where to put it, so a particular word has to appear next to who you mean,
as in `portrait photo of a woman img`. The composer says which word as soon as you attach something, and
the request is refused here rather than sent, because that refusal otherwise arrives after the wait
and after the meter has run.

`dall-e-2` is deliberately left out although its edit endpoint exists: it takes one square PNG under
4 MB and nothing else, and none of those three conditions can be expressed, so offering it would be
offering a control that fails on most pictures.

**Reference pictures are never stored.** They travel with the one request that uses them and are
gone after it. Nothing about that is an oversight: keeping them would mean a second quota, a second
thing to delete and a second place a private photograph lives. The consequence is worth stating
plainly, because it is the trade: a picture made this way cannot be remade from the gallery alone.
The prompt, the model and the settings are kept, the pictures you brought are not.

They are checked on arrival like everything else here: the type is read from the bytes, never from
what the browser labelled them, and the size limit is the same one a generated picture answers to.
The check the browser does while you drag is a courtesy to you, never the rule.

## Titles

Each picture is named once it exists: three to six words, written by the same text model the prompt
writer uses, from the prompt that made it. It is on by default, and it is a different trade from the
rewriter above it. A rewrite changes what gets drawn and costs a request nobody asked for, while a
title changes nothing and costs a dozen tokens beside an image billed by the minute.

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

Note what this shares: the _defaults_, not the permission. What makes a model reachable at all is
still the shared-models list on its connection.

Which models are reachable at all is still governed by the shared-models list on each system
connection, exactly as for chat.

## Where the pictures live

The metadata (the prompt, the model, the size, the duration, the cost) is a row in SQLite. The
pictures themselves are files under `DATA_DIR/images/<account>/`, beside the database, so a single
bind mount still holds everything mutable.

They are served by an authenticated route scoped to their owner: an image id is not a permission.
The file type is decided from the bytes when the image arrives, never from what the provider
labelled it, and only PNG, JPEG and WebP are accepted. Anything served from the app's own origin
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

## When it is offered

The sidebar entry and the settings section appear once there is a model that draws: a model marked
as one under _Models and pricing_, and, on a system connection, shared. An instance that offers no
image model offers no gallery either.

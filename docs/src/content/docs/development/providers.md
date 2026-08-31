---
title: Adding a provider
description: What the app knows about each provider, where it lives, and how to add or fix one.
sidebar:
  order: 2
---

Everything Llooma knows about a specific provider lives in one file, under
`src/lib/providers/`. Adding a provider means adding a file and a line. Fixing one, when a vendor
changes something, means editing that file and nothing else.

These facts change on somebody else's schedule. A renamed endpoint, a new image model with different
sizes, tool calling that starts working: none of that is a change to this application, so it is kept
as data rather than as code.

## The list is a convenience, never a gate

A provider nobody has described is **not refused**. It goes through the **OpenAI-compatible** entry
and loses only the conveniences: no preset endpoint, no key help link, no image shapes, no assumption
that tool calling works.

That is what makes the folder safe to accept changes to. A wrong descriptor degrades the experience.
It cannot lock anyone out. It also keeps a pull request small: the reviewer needs to know the
provider, not this application.

## What a descriptor holds

Read `infomaniak.ts` first if you are writing one. It exercises most of the shape. Then read
`compatible.ts`, for what it deliberately does not claim.

- **Identity**: `id` (the stored connection type), `name`, `badge`.
- **How to talk to it**: `family` (`openai` or `ollama`), `baseUrl`, `identified`, `modelFilter`,
  `requiresApiKey`, `apiKeyHelpUrl`.
- **What it can do**: `nativeTools`, `thinkingRequest`, `nativeThinking`, `imageGeneration`. Each one
  is a claim, so leave it off when you are not sure. Ollama's descriptor leaves `nativeTools` off on
  purpose: it reports per model, so the app asks the endpoint instead of assuming here.
- **`urlField`**, for a provider whose endpoint is one fixed string bar a single value, such as a
  product id or an account name. The form then asks for that value and builds the URL from it.
- **`imageBaseFrom`**, for a provider that serves images from somewhere its chat base cannot reach.
- **`images` and `modelRules`**, below.
- **`references`**, for a model that draws from pictures you give it. Say how many at most, the form
  field that carries them, whether a model is named beside them, and how to build the endpoint from
  the connection's roots. It goes per model rather than per provider, because it varies inside one.
  Multipart is assumed: both endpoints described here want it, whatever their specifications say.
  Trust the endpoint over the document. Add `trigger` where the prompt must contain a particular word
  for the pictures to be used, and put only the token there. The sentence about it belongs in the
  application, which is where the translations are.
- **`extraModels`**, for a route the provider's own catalogue cannot list, because at the provider it
  is not a model at all. Naming it here gives it one. From that point it is priced, shared, refused
  and metered by the same machinery as everything else.
- **`catalogues`**, for a provider that will list something only when asked a narrower question. Not
  the same case: here the provider knows what it serves and will say so, but `/models` does not
  mention it. OpenRouter's speech models are the example, invisible until you ask with
  `?output_modalities=transcription`. Return a URL per extra list, never a list of names, so what
  comes back stays the provider's answer and not a snapshot of it. Each is read like the main one,
  with the connection's key and filter, and merged in. A call that fails costs only itself. Give a
  list a `kind` when the question settles what came back: an answer to "what speaks" beats any guess
  made from a name, and for some models it is the only thing that can be right. It never beats a
  correction somebody made themselves.
- **`transcription`**, for a provider that departs from `/audio/transcriptions` answering with the
  text: a different root, or a job to poll. Say where to knock and how to read the answer. How long
  to wait, how often to ask, what may be uploaded and how large are the app's, not yours.
- **`speech`**, for a provider that reads text aloud. Unlike transcription there is no assumed
  contract, so leaving it off means the feature is not offered on that connection at all, which is
  the right answer for the endpoints that would 404. Add `voices` where the provider publishes its
  own voice names: every one of these endpoints requires a voice and refuses without one, and a list
  is better than asking somebody to copy a name out of a documentation page.

## Sizes and quality, and why they are rules

Image endpoints have no capability discovery. Nothing publishes the sizes a model accepts. So the app
asks the person for a **shape** and a **quality**, translates at the last moment, and a descriptor
says what this provider calls them.

Put the provider's usual answer in `images`. Where one provider serves several image models that
disagree, add `modelRules`. A rule matches on substrings of the model id, and the first match wins.
OpenAI needs two, because a portrait is `1024x1536` on `gpt-image-1` and `1024x1792` on `dall-e-3`,
and their quality words differ as well.

Write **rules, not a catalogue**. A handful of substrings covers a family. An enumerated list of
models goes stale by the end of the month.

Say nothing rather than guess. With no `images` and no matching rule the request carries neither
field, and the model uses its own default. That is valid everywhere, whereas a wrong size is a
refusal that arrives after the wait.

## What a descriptor may not do

A descriptor may **describe**. It may never **weaken a rule**.

The line is not between data and code. The folder already holds functions, and `infomaniak.ts` holds
three of them. The line is between vocabulary and defence. What a provider calls a portrait is
vocabulary, and a descriptor owns it. Answers coming back as base64 rather than as a URL is a
defence: a URL would have the application fetch a host the provider named, from inside its own
network. So `response_format`, the accepted image types and the size limits are set by the
application on every request, and no descriptor can reach them.

Read that as a review rule. If a change to this folder could make the app trust something more than
it did before, it belongs in the app instead.

## Adding one

1. Write `src/lib/providers/<id>.ts`, exporting one `ProviderDescriptor`.
2. Add it to `PROVIDER_DESCRIPTORS` in `src/lib/providers/index.ts`. Keep `compatible` last, since it
   is the answer for everything the others are not.
3. Add its connection type to the `ConnectionType` enum in `src/lib/connections.ts`.

Nothing else in the application should name your provider. If you find yourself editing a component
to special-case it, the descriptor is missing something, and closing that gap is the more useful
patch.

## Where they are read

`$lib/connections` answers every question about a connection and reads the descriptors underneath, so
call sites import from there. The descriptors are compiled in, not fetched. If they ever need to
change without a release, the [store](/behaviour/personas/) already has the plumbing for catalogues
that live outside the app, and that is the door to use rather than a second one.

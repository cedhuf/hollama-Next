---
title: Adding a provider
description: What the app knows about each provider, where it lives, and how to add or fix one.
sidebar:
  order: 2
---

Everything Llooma knows about a specific provider lives in one file, under
`src/lib/providers/`. Adding a provider is adding a file and a line; fixing one, when a vendor
changes something, is editing that file and nothing else.

That separation is the point. These facts change on somebody else's schedule — a renamed endpoint, a
new image model with different sizes, tool calling that starts working — and none of it is a change
to this application. It is data, so it is kept as data.

## The list is a convenience, never a gate

A provider nobody has described is **not refused**. It goes through the **OpenAI-compatible** entry
and loses only the conveniences: no preset endpoint, no key help link, no image shapes, no assumption
that tool calling works.

This is what makes the folder safe to accept changes to. A wrong descriptor degrades the experience;
it cannot lock anyone out. It is also why a pull request adding a provider is a small, reviewable
thing: the reviewer needs to know the provider, not the application.

## What a descriptor holds

Look at `infomaniak.ts` first if you are writing one — it is the file that exercises most of the
shape. `compatible.ts` is worth reading second, for what it deliberately does not claim.

- **Identity**: `id` (the stored connection type), `name`, `badge`.
- **How to talk to it**: `family` (`openai` or `ollama`), `baseUrl`, `identified`, `modelFilter`,
  `requiresApiKey`, `apiKeyHelpUrl`.
- **What it can do**: `nativeTools`, `thinkingRequest`, `nativeThinking`, `imageGeneration`. Each is
  a claim, so leave it off when you are not sure. Ollama's descriptor leaves `nativeTools` off on
  purpose: it reports per model, so the app asks the endpoint instead of assuming here.
- **`urlField`**, for a provider whose endpoint is one fixed string bar a single value — a product
  id, an account name. The form then asks for that value and builds the URL from it.
- **`imageBaseFrom`**, for a provider that serves images from somewhere its chat base cannot reach.
- **`images` and `modelRules`**, below.
- **`references`**, for a model that draws from pictures you give it: how many at most, the form
  field carrying them, whether a model is named beside them, and a function building the endpoint
  from the connection's roots. Per model rather than per provider, because it varies inside one.
  Multipart is assumed, because both endpoints described here want it whatever their specifications
  say — trust the endpoint over the document. Add `trigger` where the prompt must contain a
  particular word for the pictures to be used: the token only, never a sentence about it, because a
  descriptor holds vocabulary and the application holds wording.
- **`extraModels`**, for a route the provider's own catalogue cannot list because it is not a model
  there. Naming it here gives it one, and from that point it is priced, shared, refused and metered
  by the same machinery as everything else.

## Sizes and quality, and why they are rules

Image endpoints have no capability discovery: nothing publishes the sizes a model accepts. So the
app asks the person for a **shape** and a **quality** and translates at the last moment, and a
descriptor says what this provider calls them.

Put the provider's usual answer in `images`. Where one provider serves several image models that
disagree, add `modelRules` — a rule matches on substrings of the model id, first match wins.
OpenAI needs two, because a portrait is `1024x1536` on `gpt-image-1` and `1024x1792` on `dall-e-3`,
and their quality words differ too.

Write **rules, not a catalogue**. A handful of substrings covers a family; enumerating models is a
list that goes stale by the end of the month.

Say nothing rather than guess. With no `images` and no matching rule, the request carries neither
field and the model uses its own default — valid everywhere, where a wrong size is a refusal that
arrives after the wait.

## What a descriptor may not do

A descriptor may **describe**. It may never **weaken a rule**.

The line is not between data and code — the folder already holds functions, and `infomaniak.ts`
holds three. It is between vocabulary and defence. What a provider calls a portrait is vocabulary,
and a descriptor owns it. That answers come back as base64 rather than as a URL is a defence: a URL
would have the application fetch a host the provider named, from inside its own network. So
`response_format`, the accepted image types and the size limits are set by the application, on every
request, and no descriptor can reach them.

Read it as a review rule. If a change to this folder could make the app trust something more than it
did before, it belongs in the app instead.

## Adding one

1. Write `src/lib/providers/<id>.ts`, exporting one `ProviderDescriptor`.
2. Add it to `PROVIDER_DESCRIPTORS` in `src/lib/providers/index.ts`. Keep `compatible` last: it is
   the answer for everything the others are not.
3. Add its connection type to the `ConnectionType` enum in `src/lib/connections.ts`.

Nothing else in the application should name your provider. If you find yourself editing a component
to special-case it, the descriptor is missing something, and that gap is the more useful patch.

## Where they are read

`$lib/connections` answers every question about a connection and reads the descriptors underneath,
so call sites import from there. The descriptors are compiled in, not fetched: if they ever need to
change without a release, the [store](/features/personas/) already has the plumbing for catalogues
that live outside the app, and that is the door to use rather than a second one.

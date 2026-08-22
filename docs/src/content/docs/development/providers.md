---
title: Adding a provider
description: What the app knows about each provider, where it lives, and how to add or fix one.
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

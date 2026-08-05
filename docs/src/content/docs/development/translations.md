---
title: Translations
description: How the dictionaries work, and what adding a language actually costs.
sidebar:
  order: 2
---

The interface is translated with [typesafe-i18n](https://github.com/ivanhofer/typesafe-i18n). The
source is not, and neither is this site.

English and French ship today.

## English is the base

Every key lives in `src/i18n/en/index.ts`. Other locales are **extensions** of it:

```ts
const fr = extendDictionary(en, {
	// only the keys you have actually translated
});
```

A key missing from a locale falls back to English rather than rendering blank. That is the whole
design, and it has two consequences worth knowing:

- **Adding a string is cheap.** Touch `en/` and nothing else. Nothing breaks, nothing goes empty.
- **Gaps are invisible.** Which is why there is a script.

```shell
pnpm run i18n:status
```

It reports coverage per locale, and exits non-zero on one specific thing: a locale declaring a key
that no longer exists in `en/`. That is a stale override, usually a rename left behind, and it is a
real bug rather than a missing translation.

## Types are generated

`typesafe-i18n` watches the dictionaries and regenerates `src/i18n/i18n-types.ts`. It runs
alongside Vite in `pnpm run dev`, so a key added while the dev server is up is typed within a
second. Never edit the generated file.

Strings carry typed arguments and plural forms:

```ts
contextMessagesInContext: '{count:number} {{message|messages}} in context',
```

The compiler then refuses a call that forgets `count`, which is the reason for the whole setup.

## Adding a locale

1. Create `src/i18n/<code>/index.ts` extending `en`, like `fr/` does.
2. Add the code to `locales` in `src/i18n/i18n-util.ts`.
3. Translate what you can. The rest falls back to English, and the app stays usable throughout.
4. Run `pnpm run i18n:status` to see where you are.

There is no requirement to finish before opening a pull request. A half-translated locale renders as
a mix of two languages, which is worse than English for some people and much better for others, and
that trade is theirs to make.

:::note[Why only two languages]
Locales were reduced to English and French on purpose. Every additional one is a standing
maintenance cost paid on every single string change, and the fallback mechanism is what makes
carrying a third one survivable rather than pleasant. New locales are welcome; the offer to maintain
one is worth more than the initial translation.
:::

---
title: Working on Llooma
description: How the codebase is laid out and where the seams are.
sidebar:
  order: 1
  label: Overview
---

SvelteKit with Svelte 5 runes, TypeScript, Tailwind, and SQLite (via `node:sqlite`) in server
mode. Node 26 and pnpm.

```shell
pnpm install
pnpm run dev
```

## The one seam that matters

Where data lives is confined to a **repository**: `src/lib/data/` exports a `repository` backed by
HTTP calls to `/api/data`, and everything above it (components, stores, features) is written once
against that interface rather than against storage.

The seam earned its keep when the browser-only mode was retired: what had two implementations went
back to having one, and nothing above the interface had to be told.

## The other seam

Everything the app knows about a **specific provider** lives in one file under
`src/lib/providers/`, and nothing else in the application names one. Endpoints, key help links,
whether tool calling works, what a provider calls a portrait, which models take reference pictures:
all of it is data, kept per provider, because all of it changes on somebody else's schedule rather
than on ours.

The list is a convenience and never a gate. An undescribed provider still works through the
OpenAI-compatible entry and only loses conveniences. That is what makes it safe to open up, and why
**a pull request adding or fixing a provider is a small, reviewable change**: the reviewer needs to
know the provider, not this codebase.

If you find yourself editing a component to special-case a vendor, the descriptor is missing
something, and closing that gap is the more useful patch. See
[Adding a provider](/development/providers/).

## Layout

| Path                  | What lives there                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/chat/`       | The conversation: strategies, the run orchestrator, titles, compaction, context accounting |
| `src/lib/providers/`  | One file per provider, see [Adding a provider](/development/providers/)                    |
| `src/lib/data/`       | The repository seam: the local and API implementations                                     |
| `src/lib/server/`     | Everything that only ever runs on the server: database, migrations, auth, resolvers        |
| `src/lib/components/` | Shared components, provider-agnostic and route-agnostic                                    |
| `src/routes/api/`     | The HTTP API, see the [reference](/reference/api/)                                         |
| `src/i18n/`           | typesafe-i18n dictionaries, see [Translations](/development/translations/)                 |

## Checks

```shell
pnpm run lint
npx svelte-check --tsconfig ./tsconfig.json
pnpm run build
pnpm run i18n:status
node scripts/check-api-docs.mjs
```

:::caution[The end-to-end suite is broken upstream]
`pnpm test` (Playwright) has pre-existing failures inherited from the fork. New work is currently
verified by type-checking, linting, the build, and targeted scripts, not by the suite. Fixing it is
on the [roadmap](/roadmap/) and would be a genuinely valuable contribution.
:::

## Adding an API endpoint

CI fails if a route exists that `docs/openapi.yaml` does not describe. After adding a
`+server.ts`:

```shell
node scripts/check-api-docs.mjs --list
```

and add the path and its methods to the spec. The check compares the _surface_, paths and methods,
not response shapes, so it will not tell you a field was renamed. That part is still on you.

## Conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org). They are the
  input to the release, so they matter: see [Releases](/development/releases/).
- Issues are for bugs. Feature requests go to
  [Discussions](https://github.com/cedhuf/discussions) first.
- English in code and comments. The interface is translated, the source is not.
- Documentation lives in `docs/` in this repository, so a change to the app and the change to its
  documentation land in the same commit. That is the only thing that actually keeps the two in step.

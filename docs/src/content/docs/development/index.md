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

`local` and `server` are the same application. What differs is where data lives, and that
difference is confined to a **repository**: `src/lib/data/` exports a `repository` chosen at
startup from `PUBLIC_MODE`, backed either by `localStorage` or by HTTP calls to `/api/data`.

Everything above it (components, stores, features) is written once against that interface. If you
find yourself branching on the mode outside `src/lib/data/` or `src/lib/server/`, that is the signal
you are about to duplicate the interface.

[`ARCHITECTURE.md`](https://github.com/cedhuf/blob/main/ARCHITECTURE.md) is the original
design document for that split. It stays in the repository rather than on this site: it is written
in French, and it is a plan rather than a description. Treat it as intent, and the code as the
reference.

## Layout

| Path                  | What lives there                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `src/lib/chat/`       | Provider strategies (Ollama, OpenAI-compatible), title generation, compaction, context accounting |
| `src/lib/data/`       | The repository seam: the local and API implementations                                            |
| `src/lib/server/`     | Everything that only ever runs on the server: database, migrations, auth, resolvers               |
| `src/lib/components/` | Shared components, provider-agnostic and route-agnostic                                           |
| `src/routes/api/`     | The HTTP API, see the [reference](/reference/api/)                                                |
| `src/i18n/`           | typesafe-i18n dictionaries, see [Translations](/development/translations/)                        |

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

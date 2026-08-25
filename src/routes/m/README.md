# The mobile-first interface

A second interface, not a second skin. It lives under `/m`, it has its own shell,
and the responsive interface in `src/routes/` is untouched by everything in here.

## Why a path and not a route group

A SvelteKit route group, `(mobile)`, shares its URLs with the tree beside it, and
two `+page.svelte` cannot both answer `/sessions`. A prefix gives each interface
its own address. Which makes the switch a navigation rather than a mode, lets
either one be bookmarked, and means a bug in here can never render there.

## What may live in this folder

Views, and the components only these views use. Anything else is a mistake:

- **No engine.** The conversation, the runs, the tools and the stores are in
  `$lib` and are shared as they are. `Conversation` was lifted out of the desktop
  page precisely so a second interface could drive it, and a second copy of any
  of it is the thing this folder exists to avoid.
- **No settings, no providers, no persistence.** Same reason. This interface
  reads the same account.
- **No component that both interfaces want.** That one belongs in
  `$lib/components`, where the other one can reach it too.

The test, when adding a file here: if the responsive interface would ever want
it, it is in the wrong folder.

## State

The frame, the address and the way in and out. Nothing is designed yet: the
layout is an empty shell and the first page is a comment. Both are waiting on a
design conversation rather than on time.

## Getting in and out

`Settings, Chat, Simplified mobile interface` sets `simplifiedMobileUI`, and the
root layout redirects on it, both ways. Nothing in here reads that flag: an
interface that has to check whether it is allowed to be on screen is one that
will one day be on screen wrongly.

---
title: Roadmap
description: What is done, what is next, and what is known to be broken.
---

Llooma is an **early preview**. This page is the honest state of it: what has landed, what is
planned, and what is currently wrong.

For the full list of everything this fork changed from
[Hollama](https://github.com/fmaclen/hollama), see
[Changes from Hollama](/changes-from-hollama/). For what shipped in which version, see the
[changelog](/changelog/).

## Done

| Feature                             | What it means                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-user support**              | Sign in with email and password, OIDC, or both, with data stored per user. See [Running modes](/guides/running-modes/)                                        |
| **Sharing enforced server-side**    | Shared tools, model allow-lists and locked prompts are applied in the endpoints, so a hand-crafted request is policed too                                     |
| **Locked prompts survive personas** | A locked instance prompt is prepended in the proxy, so a persona's own prompt adds to it instead of replacing it                                              |
| **Translations reworked**           | English and French are complete, and adding a locale no longer means auditing every key. See [Translations](/development/translations/)                       |
| **Conversation compaction**         | `/compact` summarises a long conversation so it keeps fitting, and `/clear` sets one aside entirely. Both reversible. See [Compaction](/features/compaction/) |
| **Documentation site**              | This site, published from `docs/`, with the HTTP API kept in step with the routes by CI                                                                       |
| **Generation on the server**        | A reply survives a reload, a navigation or a backgrounded tab, and the conversation picks it back up. See [Generation](/features/generation/)                 |
| **Wallpapers**                      | A picture behind the app, on a phone as well as a desktop, with the translucency of every surface following it                                                |
| **A store for personas**            | Personas are read from a store over the network rather than shipped in the app, so one is added by a pull request. See [Personas](/features/personas/)        |

## Next

| Feature                  | What it would be                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reusable playbooks**   | Step-by-step instructions written once in Markdown and reused in any conversation: a how-to the model follows, separate from a persona's prompt    |
| **Slash shortcuts**      | Save instructions you use often and fire them with `/shortcut`, with an optional form for variables. The menu and parser exist; the entries do not |
| **User groups**          | Per-group default prompts and models                                                                                                               |
| **Tauri desktop builds** | Native builds for macOS, Windows and Linux, replacing the current download                                                                         |

## Under consideration

Not promised, and in some cases not yet understood well enough to promise. Listed because they are
the directions being weighed, and because saying so is more useful than a silent backlog.

| Idea                        | What it would be                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calling a persona**       | Mention a persona with `@` inside any conversation and hand it that turn: its prompt, its model, its knowledge, and the reply attributed to it. The smallest useful version of an agent, and one that reuses what exists                                                                                                                                          |
| **llama.cpp of its own**    | `llama-server` already works here as an OpenAI-compatible endpoint, but it is one of the two ways people actually run a local model, and it deserves its own badge, its own model listing and a form with no key to fill. The same recognition covers [LlamaEdge](https://github.com/LlamaEdge/LlamaEdge), which serves the same engine over Rust and WebAssembly |
| **llama-swap**              | One `llama-server` serving several models and swapping them on demand: more than one model without more than one server                                                                                                                                                                                                                                           |
| **Search that understands** | Today's [search](/features/search/) answers "where did I write that word". This would answer "what did we conclude about this": embeddings, a store, and an indexing path that survives compaction. Long-term                                                                                                                                                     |

The last three were read from [hollama-spark](https://github.com/cwright814/hollama-spark), another
fork of Hollama, whose own roadmap is largely about running local models well. Some of it is already
built there, so the work may be as much reading as writing.

## Known problems

| Problem                                    | Detail                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **The end-to-end suite is broken**         | The Playwright tests carry failures inherited from the fork, so nothing built since has automated regression cover. Fixing it would help a lot |
| **The Svelte 5 migration is not finished** | A few legacy `on:` directives remain                                                                                                           |
| **Rename migrations still ship**           | One-shot carry-overs from the rename to Llooma. The release that drops them must name the version to pin first                                 |
| **Local mode needs a verification pass**   | Recent work focused on server mode, and local mode may have inconsistencies                                                                    |

## Asking for something

Issues are for bugs. Feature requests go to
[Discussions](https://github.com/cedhuf/discussions) first: if the community backs it and the
approach holds up, it becomes an issue.

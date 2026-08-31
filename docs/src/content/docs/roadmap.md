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

| Feature                             | What it means                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-user support**              | Sign in with email and password, OIDC, or both, with data stored per user. See [Personal or shared](/guides/running-modes/)                                                                     |
| **Sharing enforced server-side**    | Shared tools, model allow-lists and locked prompts are applied in the endpoints, so a hand-crafted request is policed too                                                                       |
| **Locked prompts survive personas** | A locked instance prompt is prepended in the proxy, so a persona's own prompt adds to it instead of replacing it                                                                                |
| **Translations reworked**           | English and French are complete, and adding a locale no longer means auditing every key. See [Translations](/development/translations/)                                                         |
| **Conversation compaction**         | `/compact` summarises a long conversation so it keeps fitting, `/clear` sets one aside entirely, and `/context` says what is being sent. See [Compaction](/chat/compaction/)                    |
| **Documentation site**              | This site, published from `docs/`, with the HTTP API kept in step with the routes by CI                                                                                                         |
| **Generation on the server**        | A reply survives a reload, a navigation or a backgrounded tab, and the conversation picks it back up. See [Generation](/chat/generation/)                                                       |
| **Calling a persona**               | Mention one with `@` in any conversation and it answers that turn, with its own model and everything else it carries. See [Personas](/behaviour/personas/)                                      |
| **Wallpapers**                      | A picture behind the app, on a phone as well as a desktop, with the translucency of every surface following it                                                                                  |
| **A store for personas**            | Personas are read from a store over the network rather than shipped in the app, so one is added by a pull request. See [Personas](/behaviour/personas/)                                         |
| **A phone interface**               | A second interface, not a second skin: one column, a tab bar, the voice on the left. Offered to phones and only where it is asked for, from Settings, Chat. See [Interface](/guides/interface/) |
| **Speaking instead of typing**      | A microphone in the composer and a screen of its own on a phone. The recording goes to a transcription model on one of your connections; nothing is kept. See [Voice](/media/voice/)            |
| **Reusable playbooks**              | A procedure written once in Markdown and switched on in any conversation with `/playbooks`, installed from the same store. See [Playbooks](/behaviour/playbooks/)                               |

## Next

| Feature                  | What it would be                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slash shortcuts**      | Save instructions you use often and fire them with `/shortcut`, with an optional form for variables. The menu and parser exist; the entries do not |
| **User groups**          | Per-group default prompts and models                                                                                                               |
| **Tauri desktop builds** | Native builds for macOS, Windows and Linux, replacing the current download                                                                         |

## Under consideration

Not promised, and in some cases not yet understood well enough to promise. Listed because they are
the directions being weighed, and because saying so is more useful than a silent backlog.

| Idea                        | What it would be                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **llama.cpp of its own**    | `llama-server` already works here as an OpenAI-compatible endpoint, but it is one of the two ways people actually run a local model, and it deserves its own badge, its own model listing and a form with no key to fill. The same recognition covers [LlamaEdge](https://github.com/LlamaEdge/LlamaEdge), which serves the same engine over Rust and WebAssembly |
| **llama-swap**              | One `llama-server` serving several models and swapping them on demand: more than one model without more than one server                                                                                                                                                                                                                                           |
| **Search that understands** | Today's [search](/chat/search/) answers "where did I write that word". This would answer "what did we conclude about this": embeddings, a store, and an indexing path that survives compaction. Long-term                                                                                                                                                         |

The last three were read from [hollama-spark](https://github.com/cwright814/hollama-spark), another
fork of Hollama, whose own roadmap is largely about running local models well. Some of it is already
built there, so the work may be as much reading as writing.

## Known problems

| Problem                                    | Detail                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The end-to-end suite is thin**           | Rewritten around what the app is now, but five tests: a turn, a reload, the phone redirect, one shared setting. Attachments, tools, compaction and the image path have no cover at all |
| **The Svelte 5 migration is not finished** | A few legacy `on:` directives remain                                                                                                                                                   |
| **Rename migrations still ship**           | One-shot carry-overs from the rename to Llooma. The release that drops them must name the version to pin first                                                                         |
| **Local mode has just been retired**       | The browser-only mode is gone and a personal instance is now a server nobody signs into. Anything that assumed the old shape may still bite                                            |

## Asking for something

Issues are for bugs. Feature requests go to
[Discussions](https://github.com/cedhuf/discussions) first: if the community backs it and the
approach holds up, it becomes an issue.

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

| Feature                             | What it means                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-user support**              | Sign in with email and password, OIDC, or both, with data stored per user. See [Running modes](/guides/running-modes/)                  |
| **Sharing enforced server-side**    | Shared tools, model allow-lists and locked prompts are applied in the endpoints, so a hand-crafted request is policed too               |
| **Locked prompts survive personas** | A locked instance prompt is prepended in the proxy, so a persona's own prompt adds to it instead of replacing it                        |
| **Translations reworked**           | English and French are complete, and adding a locale no longer means auditing every key. See [Translations](/development/translations/) |
| **Conversation compaction**         | `/compact` summarises a long conversation so it keeps fitting, reversibly. See [Compaction](/features/compaction/)                      |
| **Documentation site**              | This site, published from `docs/`, with the HTTP API kept in step with the routes by CI                                                 |

## Next

| Feature                  | What it would be                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reusable playbooks**   | Step-by-step instructions written once in Markdown and reused in any conversation: a how-to the model follows, separate from a persona's prompt    |
| **Slash shortcuts**      | Save instructions you use often and fire them with `/shortcut`, with an optional form for variables. The menu and parser exist; the entries do not |
| **User groups**          | Per-group default prompts and models                                                                                                               |
| **Tauri desktop builds** | Native builds for macOS, Windows and Linux, replacing the current download                                                                         |

## Known problems

| Problem                                    | Detail                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **The end-to-end suite is broken**         | The Playwright tests carry failures inherited from the fork, so nothing built since has automated regression cover. Fixing it would help a lot |
| **Compaction summaries pollute search**    | A summary is stored as a message, so [search](/features/search/) can return the same passage twice. The index needs to skip the markers        |
| **The Svelte 5 migration is not finished** | A few legacy `on:` directives remain                                                                                                           |
| **Rename migrations still ship**           | One-shot carry-overs from the rename to Llooma. The release that drops them must name the version to pin first                                 |
| **Local mode needs a verification pass**   | Recent work focused on server mode, and local mode may have inconsistencies                                                                    |

## Asking for something

Issues are for bugs. Feature requests go to
[Discussions](https://github.com/cedhuf/discussions) first: if the community backs it and the
approach holds up, it becomes an issue.

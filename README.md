<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="static/logo-mark-dark.png" />
  <img src="static/logo-mark.png" alt="Llooma" width="96" />
</picture>

# Llooma /ˈluː.mə/

**A (less) minimal LLM chat app that runs _entirely_ in your browser.**

[Documentation](https://cedhuf.github.io/llooma)

This is a fork of [Hollama](https://github.com/fmaclen/hollama) by [fmaclen](https://github.com/fmaclen) — many thanks for the original work.

</div>

![The sidebar, a conversation, the Library, and the Interface and Servers settings](static/screenshots/sections.png)

> [!WARNING]
> This project is an **early preview**. Not made for production use. Expect breaking changes, unfinished features, and rough edges.
>
> I'm not a professional developer and I'm still learning. I've made use of AI assistance while trying to remain responsible. Any audit, suggestion or PR is more than welcome. If AI is not your thing, you can check the original project instead or other forks, no hard feelings, just being transparent.
>
> Recent work has focused on the **server / multi-user** mode. The **standalone (local)** mode may have temporary inconsistencies that still need a verification pass.

---

<div align="center">

### ✨ Introducing Personas

**Give your AI a face, a voice and a name.**

Build characters, a coach, a tutor, a companion, each with its own avatar, personality, model, greeting and knowledge, then chat with them as one ongoing relationship. Import existing ones (OpenWebUI-compatible), pin your favourites to the sidebar, and in server mode share them across your team.

</div>

---

> [!IMPORTANT]
> Feel free to participate, there is no bad contribution. One rule to keep the project manageable: **issues are for bugs only**. For a feature request or anything else, please open a discussion. If the community backs it, and we agree on the technical approach, it will become an issue. Thanks!

### Features

**Providers**

- Ollama, OpenAI, Claude, Infomaniak, and any OpenAI-compatible server
- One-click presets, pick a provider, paste an API key
- Several connections at once, each with its own label and colour, shown wherever its models appear
- Custom display names per model, so `mistral/Mistral_Small-24B-Instruct` can read as you like
- Model name filter per connection
- Download [Ollama models](https://ollama.ai/models) directly from the UI

**Chat**

- Text, vision and reasoning models, with streamed replies
- Markdown with syntax highlighting, KaTeX maths, and copyable code blocks
- Attach **knowledge** and **images** from one _Add context_ menu in the composer, on the home screen and in any conversation. Whatever you attach shows up as the same removable pill
- Edit and retry messages; copy a message, a code block, or a whole conversation (JSON or Markdown)
- **Web search** [degoog](https://github.com/degoog-org/degoog) or SearXNG, toggled per message, with an optional _let the model decide_ mode and a live status. Configurable from the GUI, lockable instance-wide via env, shareable by an admin
- **Web fetch** paste a link and the model reads the page itself, in full, rather than answering from search snippets. Toggled per message, capped in pages and characters, and switchable instance-wide by an admin
- **Interactive choices** when a request is ambiguous, the model can offer tappable options instead of guessing
- **System prompts** global, per-model and per-conversation
- AI-generated conversation titles, using a dedicated (cheap) model
- **Compaction** when a conversation gets too long, `/compact` in the composer replaces everything said so far with a structured summary, so it keeps fitting in the context window. Nothing is deleted: the summary only changes what is _sent_, the full transcript stays on screen (faded past the boundary, which you can turn off), and one click on the divider puts the whole history back. Runs on the conversation's own model by default, or a dedicated one, and can fire on its own at a threshold you set. An admin can share both
- **Conversation load** a small ring in the composer fills as the context does, warming from grey to amber to red, with the exact figures on hover, or on tap where there is no hover
- Advanced Ollama parameters

**Personas & knowledge**

- Reusable characters with their own avatar, system prompt, model, greeting and knowledge, created in the **Library** and pinned to the sidebar
- Import personas from a file, including OpenWebUI model exports; three starter personas ship by default
- Knowledge collections attachable to any conversation or persona

**Interface**

- Six themes — Classic, Dracula, Catppuccin, Gruvbox, Nord and Solarized (each with a light and a dark ramp), following the system by default
- Responsive; dialogs go full screen on phones; installable as a PWA
- English and French, with automatic English fallback for untranslated keys
- Import and export each kind of data, or a full backup of everything

### Roadmap

| Feature                                     | Done | Description                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | :--: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth.js & multi-user support**            |  ✅  | Sign-in with email and password, OIDC, or both, with data stored per user                                                                                                                                                                                                                 |
| **Enforce sharing server-side**             |  ✅  | Shared tools, model allow-lists and locked prompts are applied in the endpoints (`/api/fetch`, `/api/llm`), not just in the interface, so a hand-crafted request is policed too                                                                                                           |
| **Protect locked prompts from personas**    |  ✅  | A locked instance prompt is prepended in the proxy, so a persona's own system prompt adds to it instead of replacing it                                                                                                                                                                   |
| **Revisit translations**                    |  ✅  | English and French are complete (`pnpm run i18n:status`); adding a locale back no longer means auditing every key                                                                                                                                                                         |
| **Conversation compaction**                 |  ✅  | `/compact` summarises a long conversation so it keeps fitting in the context window, reversibly                                                                                                                                                                                           |
| **Documentation site**                      |  ✅  | Published from `docs/` to GitHub Pages, with the HTTP API kept in step with the routes by CI                                                                                                                                                                                              |
| Tauri desktop builds                        |  ⬜  | Native builds for macOS, Windows and Linux, replacing the current download                                                                                                                                                                                                                |
| User groups                                 |  ⬜  | Per-group default prompts and models                                                                                                                                                                                                                                                      |
| **Reusable playbooks**                      |  ⬜  | Write step-by-step instructions in Markdown once and reuse them in any conversation: a how-to the model follows, separate from a persona's system prompt                                                                                                                                  |
| **Slash shortcuts**                         |  ⬜  | Save frequently used instructions and fire them with `/shortcut`, with an optional form for variables. The command menu and parser already exist (`/compact`); what is missing is user-defined entries and the form                                                                       |
| **Keep compaction summaries out of search** |  ⬜  | A summary is stored as a message, so full-text search returns the same passage twice: once in the original and once inside the summary that replaced it. The index needs to skip compaction markers                                                                                       |
| Finish the Svelte 5 migration               |  ⬜  | Four legacy `on:` directives remain, all in `FieldInput.svelte`                                                                                                                                                                                                                           |
| **Drop the rename migrations**              |  ⬜  | One-shot carry-overs from the Hollama Next to Llooma rename (database file, `localStorage` keys, theme-script fallback). The release that removes them must name the version to pin first, so anyone on an older build can pass through it. Reading legacy _backup_ keys stays regardless |
| **Fix the end-to-end suite**                |  ⬜  | The Playwright tests carry pre-existing failures inherited from the fork, so nothing built since has automated regression cover                                                                                                                                                           |

> For everything already done in this fork, see [CHANGES.md](CHANGES.md).

### Get started

- 📚 **[Documentation](https://cedhuf.github.io/llooma)** — install, configure, and how each feature works
- ⚡️ Live demo — _coming soon_
- 🖥️ Download — _coming soon_ (will be replaced by Tauri)
- 🐞 [Contribute](CONTRIBUTING.md)

### Self-hosting

Docker images are published to [`ghcr.io/cedhuf/llooma`](https://ghcr.io/cedhuf/llooma) on every release.

```shell
cp .env.example .env
docker compose up -d
```

Then open [http://localhost:4173](http://localhost:4173).

Llooma runs in one of two modes, chosen at deploy time with `PUBLIC_MODE`: **`local`** keeps everything in the browser, **`server`** signs users in and keeps provider keys on the server. The full picture, every environment variable, and the security notes that matter before exposing an instance are in the documentation:

- [Installation](https://cedhuf.github.io/llooma/guides/installation/)
- [Running modes](https://cedhuf.github.io/llooma/guides/running-modes/)
- [Configuration](https://cedhuf.github.io/llooma/reference/configuration/)
- [Security](https://cedhuf.github.io/llooma/guides/security/)
- [HTTP API](https://cedhuf.github.io/llooma/reference/api/)

### Screenshots

![Themes](static/screenshots/themes.png)

_The six themes, left to right: Classic, Dracula, Catppuccin, Gruvbox, Nord and Solarized — alternating light and dark ramps._

| ![Home](static/screenshots/home.png)                   | ![A conversation](static/screenshots/session.png)     | ![Library](static/screenshots/library.png)        |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| ![Interface settings](static/screenshots/settings.png) | ![Server connections](static/screenshots/servers.png) | ![Dark mode](static/screenshots/session-dark.png) |

### License

[MIT](LICENSE)

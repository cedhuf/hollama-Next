# Hollama Next

> **Disclaimer** — This project is an **early preview**. Not made for production use. Expect breaking changes, unfinished features, and rough edges.
>
> I'm not a professional developer and I'm still learning. I've made heavy use of AI assistance while trying to remain responsible. Any audit, suggestion or PR are more than welcome. If that's not your thing, no hard feelings — just being transparent.

A minimal LLM chat app that runs _entirely_ in your browser.

This is a fork of [Hollama](https://github.com/fmaclen/hollama) by [fmaclen](https://github.com/fmaclen) — many thanks for the original work.

### Features

- Support for **Ollama** & **OpenAI** servers
- Multi-server support
- Text & vision models
- Large prompt fields
- Support for reasoning models
- Markdown rendering with syntax highlighting
- KaTeX math notation
- Code editor features
- Customizable system prompts & advanced Ollama parameters
- Copy code snippets, messages or entire sessions
- Edit & retry messages
- Stores data locally on your browser
- Import & export stored data
- Responsive layout
- Light & dark themes
- Multi-language interface
- Download [Ollama models](https://ollama.ai/models) directly from the UI

### Roadmap

- [x] Remove Electron (replaced by Tauri)
- [x] Server-side proxy for OpenAI-compatible providers (CORS bypass)
- [x] Settings modal (replaces `/settings` route)
- [x] Theme system (System / Light / Dark + Classic / Dracula / Catppuccin)
- [x] Welcome page redesign (chat input, suggestion chips, recent sessions)
- [x] URL param auto-submit (`?q=`, `&model=`)
- [x] Default model setting
- [x] Profile settings (name, avatar, color)
- [x] Avatar + name in sidebar
- [ ] Tauri desktop builds (macOS / Windows / Linux)
- [ ] Auth.js & multi-user support
- [ ] Testing & polish

### Get started

- ⚡️ Live demo — _coming soon_
- 🖥️ Download — _coming soon_ (will be replaced by Tauri)
- 🐳 [Self-hosting](SELF_HOSTING.md) with Docker
- 🐞 [Contribute](CONTRIBUTING.md)

| ![session](tests/docs.test.ts-snapshots/session.png)         | ![settings](tests/docs.test.ts-snapshots/settings.png)   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| ![session-new](tests/docs.test.ts-snapshots/session-new.png) | ![knowledge](tests/docs.test.ts-snapshots/knowledge.png) |

### License

[MIT](LICENSE)

# Hollama Next

> [!WARNING]
> **Disclaimer** — This project is an **early preview**. Not made for production use. Expect breaking changes, unfinished features, and rough edges.
>
> I'm not a professional developer and I'm still learning. I've made use of AI assistance while trying to remain responsible. Any audit, suggestion or PR are more than welcome. If that's not your thing, you can check the original project instead or other forks, no hard feelings — just being transparent.

A (less) minimal LLM chat app that runs _entirely_ in your browser.

This is a fork of [Hollama](https://github.com/fmaclen/hollama) by [fmaclen](https://github.com/fmaclen) — many thanks for the original work.

> [!IMPORTANT]
> Feel free to participate ! There are no bad intervention. Just one rule to let the project easy to manage : issues are for bug only. If you want ta ask for a feature or anything else, please use the discussion. If it is community validated, then it will find a way to issue. Thanks !

### Features

- Support for **Ollama**, **OpenAI**, **Claude** & **Infomaniak** servers
- One-click provider presets — pick a provider, paste an API key
- Multi-server support
- AI-generated session titles (with a dedicated, cheap model)
- Full backup & restore of all your data
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

- [ ] Tauri desktop builds (macOS / Windows / Linux)
- [X] Auth.js & multi-user support
- [ ] Testing & polish

> For everything already done in this fork, see [CHANGES.md](CHANGES.md).

### Get started

- ⚡️ Live demo — _coming soon_
- 🖥️ Download — _coming soon_ (will be replaced by Tauri)
- 🐞 [Contribute](CONTRIBUTING.md)

### Self-hosting

Docker images are published to [`ghcr.io/cedhuf/hollama`](https://ghcr.io/cedhuf/hollama) as a **rolling release** — every push to `main` automatically updates the `:latest` tag.

**Quick start with Docker Compose (recommended):**

```shell
cp .env.example .env
docker compose up -d
```

Then open [http://localhost:4173](http://localhost:4173).

**Or with Docker directly:**

```shell
docker run --rm -d -p 4173:4173 --name hollama ghcr.io/cedhuf/hollama:latest
```

**Update to the latest version:**

```shell
docker compose pull && docker compose up -d
```

**Connecting to an Ollama server on a different device** — if your Ollama server is running on a separate machine, you need to allow your Hollama instance's domain in `OLLAMA_ORIGINS`. [Learn more in Ollama's docs](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server).

```shell
OLLAMA_ORIGINS=https://your-hollama-domain.com ollama serve
```

**Running modes** — Hollama runs in one of two modes, chosen at deploy time with `PUBLIC_MODE`:
> [!NOTE]
> Why ?
> - This allow device synchronization, which was not possible before.
> - This also allow multiple user instance.
---

- **`local`** (default) — single-user, browser-only. All data (sessions, knowledge, server connections, preferences) lives in the browser's `localStorage`, and you bring your own LLM providers (Ollama, OpenAI, Claude, …) from _Settings → Servers_. No accounts, no database. Ideal for personal use, a phone PWA, or the upcoming desktop app.
- **`server`** — multi-user, self-hosted. Users sign in (email + password and/or OIDC), data is stored server-side in SQLite **per user**, and **provider API keys never leave the server** (encrypted at rest). An admin configures shared providers and which models to expose; optionally, users may add their own keys (`allowUserKeys`).

Set `PUBLIC_MODE=server` to enable server mode. All server-mode state lives under `DATA_DIR` — a single directory you can bind-mount to persist everything.

**Configuration** — copy `.env.example` to `.env` and adjust as needed.

_Common (both modes):_

| Variable                    | Default     | Description                                                                                         |
| --------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `HOST_PORT`                 | `4173`      | Port exposed on the host                                                                            |
| `VITE_ALLOWED_HOSTS`        | `localhost` | Comma-separated allowed domains (useful behind a reverse proxy)                                     |
| `PROXY_ALLOWED_ORIGINS`     | _(empty)_   | Allowlist of provider origins the proxy may forward to; empty = any (lock down on public instances) |
| `PUBLIC_DISABLE_ONBOARDING` | _(unset)_   | `true` skips the first-run wizard (local mode)                                                      |
| `PUBLIC_OLLAMA_URL`         | _(unset)_   | Pre-configure an Ollama server on a fresh install (local mode)                                      |
| `PUBLIC_SEARCH_URL`         | _(unset)_   | Web search backend ([degoog](https://github.com/degoog-org/degoog) / SearXNG). When set, it's locked instance-wide; if unset, it's configurable from the GUI |
| `PUBLIC_SEARCH_BACKEND`     | `degoog`    | `degoog` or `searxng`                                                                               |

_Server mode (`PUBLIC_MODE=server`):_

| Variable                                | Default                | Description                                                                         |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `PUBLIC_MODE`                           | `local`                | Set `server` for multi-user mode                                                    |
| `DATA_DIR`                              | `./data`               | Directory for the SQLite DB and server state (bind-mount this)                      |
| `AUTH_SECRET`                           | —                      | **Required.** Signs sessions and encrypts provider keys (`openssl rand -base64 32`) |
| `ADMIN_EMAIL`                           | —                      | Bootstraps the first admin; also marks this email as admin for OIDC                 |
| `ADMIN_PASSWORD`                        | —                      | Initial admin password (omit for an OIDC-only admin)                                |
| `AUTH_CREDENTIALS`                      | —                      | `true` to enable email + password login                                             |
| `OIDC_ISSUER`                           | —                      | OIDC provider URL (e.g. PocketID); its presence enables OIDC login                  |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | —                      | OIDC client credentials                                                             |
| `OIDC_NAME`                             | `SSO`                  | Label for the OIDC sign-in button                                                   |
| `OIDC_SCOPE`                            | `openid profile email` | Requested scopes (add your groups scope to expose roles)                            |
| `OIDC_ROLE_CLAIM` / `OIDC_ADMIN_VALUE`  | —                      | Claim and value that grant the admin role                                           |
| `OIDC_AUTO_PROVISION`                   | `true`                 | Create a user on first OIDC login (`false` requires a pre-created account)          |
| `OIDC_AUTO_REDIRECT`                    | —                      | `true` skips the login page and goes straight to the IdP (OIDC-only)                |

> OIDC redirect URI to register with your provider: `https://your-hollama-domain/auth/callback/oidc`

| ![session](static/screenshots/session.png)         | ![settings](static/screenshots/settings.png)   |
| -------------------------------------------------- | ---------------------------------------------- |
| ![session-new](static/screenshots/session-new.png) | ![knowledge](static/screenshots/knowledge.png) |

### License

[MIT](LICENSE)

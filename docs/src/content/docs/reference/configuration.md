---
title: Configuration
description: Every environment variable Llooma reads, in both modes.
sidebar:
  order: 1
---

Copy `.env.example` to `.env` and adjust. Everything here is read at startup.

## Both modes

| Variable                    | Default     | Description                                                                                                                                                  |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HOST_PORT`                 | `4173`      | Port exposed on the host                                                                                                                                     |
| `VITE_ALLOWED_HOSTS`        | `localhost` | Comma-separated allowed domains (useful behind a reverse proxy)                                                                                              |
| `PROXY_ALLOWED_ORIGINS`     | _(empty)_   | Allowlist of provider origins the proxy may forward to; empty = **any**. See [Security](/llooma/guides/security/)                                            |
| `FETCH_ALLOWED_ORIGINS`     | _(empty)_   | Allowlist of origins the web fetch tool may read; empty = any public host                                                                                    |
| `PUBLIC_DISABLE_ONBOARDING` | _(unset)_   | `true` skips the first-run wizard (local mode)                                                                                                               |
| `PUBLIC_OLLAMA_URL`         | _(unset)_   | Pre-configure an Ollama server on a fresh install (local mode)                                                                                               |
| `PUBLIC_SEARCH_URL`         | _(unset)_   | Web search backend ([degoog](https://github.com/degoog-org/degoog) / SearXNG). When set it is locked instance-wide; if unset it is configurable from the GUI |
| `PUBLIC_SEARCH_BACKEND`     | `degoog`    | `degoog` or `searxng`                                                                                                                                        |

## Server mode

Only read when `PUBLIC_MODE=server`.

| Variable                                | Default                | Description                                                                         |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `PUBLIC_MODE`                           | `local`                | Set `server` for multi-user mode                                                    |
| `DATA_DIR`                              | `./data`               | Directory for the SQLite database and server state — bind-mount this                |
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
| `OIDC_AUTO_REDIRECT`                    | —                      | `true` skips the login page and goes straight to the identity provider (OIDC only)  |

:::note[OIDC redirect URI]
Register `https://your-llooma-domain/auth/callback/oidc` with your provider.
:::

## Settings that are not environment variables

Most of what an instance does is configured from the interface, not from `.env` — shared
providers, model allow-lists, system prompts, the tools users may use, title generation and
compaction. Those live in the database and are edited under _Settings → Admin_.

The rule of thumb: `.env` is for what must be true before the app starts, the admin panel is for
everything else.

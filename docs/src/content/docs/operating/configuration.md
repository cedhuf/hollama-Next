---
title: Configuration
description: Every environment variable Llooma reads, in both modes.
sidebar:
  order: 3
---

Copy `.env.example` to `.env` and adjust. Everything here is read at startup.

## General

| Variable                    | Default     | Description                                                                                                                                                                    |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HOST_PORT`                 | `4173`      | Port exposed on the host                                                                                                                                                       |
| `VITE_ALLOWED_HOSTS`        | `localhost` | Comma-separated allowed domains (useful behind a reverse proxy)                                                                                                                |
| `FETCH_ALLOWED_ORIGINS`     | _(empty)_   | Allowlist of origins the web fetch tool may read; empty = any public host                                                                                                      |
| `PUBLIC_DISABLE_ONBOARDING` | _(unset)_   | `true` skips the first-run wizard and the welcome tour                                                                                                                         |
| `PUBLIC_SEARCH_URL`         | _(unset)_   | Web search backend ([degoog](https://github.com/degoog-org/degoog) / SearXNG). When set it is locked instance-wide; if unset it is configurable from the GUI                   |
| `PUBLIC_SEARCH_BACKEND`     | `degoog`    | `degoog` or `searxng`                                                                                                                                                          |
| `SEARCH_TOKEN`              | _(unset)_   | Bearer token for a protected search instance. Kept server-side and never sent to a browser                                                                                     |
| `PERSONA_STORE_URL`         | _(public)_  | Starting address of the [persona store](/behaviour/personas/). The instance fetches it, so browsers with no way out still get a catalogue; an admin can change it in the panel |

## Documents and OCR

[Documents](/context/documents/) has the full story.

| Variable                   | Default   | Description                                                                                                         |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_DISABLE_DOCUMENTS` | _(unset)_ | `true` removes document reading instance-wide. The section disappears from settings and no user can turn it back on |
| `PUBLIC_OCR_CORE_PATH`     | _(unset)_ | Where the OCR engine is served from. Unset, it is fetched from a public CDN on first use                            |
| `PUBLIC_OCR_LANG_PATH`     | _(unset)_ | Where the OCR language data is served from                                                                          |
| `PUBLIC_OCR_WORKER_PATH`   | _(unset)_ | Where the OCR worker script is served from                                                                          |

Set the three OCR paths together for an instance that must make no third-party requests. Budget
roughly 30 MB for the engine and 3 to 11 MB per language.

## Accounts and storage

With nothing here configured, Llooma is a personal instance: no login screen, one implicit owner
created on first run, everything kept in SQLite. Setting `AUTH_CREDENTIALS` or `OIDC_ISSUER` turns
it into a shared one, with accounts and a login page. Whether an instance has accounts is read from
those two variables rather than from a switch of its own, so the two can never disagree.

| Variable                                | Default                | Description                                                                                                                       |
| --------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`                              | `./data`               | Directory for the SQLite database and server state. Bind-mount this                                                               |
| `AUTH_SECRET`                           | _(generated)_          | Signs sessions and encrypts provider keys. Generated on first run and stored in the database if unset (`openssl rand -base64 32`) |
| `ADMIN_EMAIL`                           | _(none)_               | Bootstraps the first admin; also marks this email as admin for OIDC                                                               |
| `ADMIN_PASSWORD`                        | _(none)_               | Initial admin password (omit for an OIDC-only admin)                                                                              |
| `AUTH_CREDENTIALS`                      | _(none)_               | `true` to enable email and password login                                                                                         |
| `OIDC_ISSUER`                           | _(none)_               | OIDC provider URL (e.g. PocketID); its presence enables OIDC login                                                                |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | _(none)_               | OIDC client credentials                                                                                                           |
| `OIDC_NAME`                             | `SSO`                  | Label for the OIDC sign-in button                                                                                                 |
| `OIDC_SCOPE`                            | `openid profile email` | Requested scopes (add your groups scope to expose roles)                                                                          |
| `OIDC_ROLE_CLAIM` / `OIDC_ADMIN_VALUE`  | _(none)_               | Claim and value that grant the admin role                                                                                         |
| `OIDC_AUTO_PROVISION`                   | `true`                 | Create a user on first OIDC login (`false` requires a pre-created account)                                                        |
| `OIDC_AUTO_REDIRECT`                    | _(none)_               | `true` skips the login page and goes straight to the identity provider (OIDC only)                                                |

:::note[OIDC redirect URI]
Register `https://your-llooma-domain/auth/callback/oidc` with your provider.
:::

:::caution[Keep the secret]
It encrypts the stored provider keys. Lose it and they cannot be decrypted. If you set `AUTH_SECRET`
yourself, back it up as carefully as the database. If you let the instance generate one, it lives in
the database, so backing up the database is enough. Setting `AUTH_SECRET` afterwards changes nothing:
a generated secret keeps precedence, precisely so that adding one later cannot orphan the keys it
already encrypted.
:::

## Analytics

Optional. The script is only included when `PUBLIC_PLAUSIBLE_DOMAIN` is set; nothing is collected
otherwise.

| Variable                  | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `PUBLIC_PLAUSIBLE_DOMAIN` | The site name registered with your Plausible instance |
| `PUBLIC_PLAUSIBLE_SRC`    | URL of the Plausible script                           |
| `PUBLIC_PLAUSIBLE_API`    | URL of the Plausible event endpoint                   |

## Settings that are not environment variables

Most of what an instance does is configured from the interface: shared providers, model allow-lists,
system prompts, the tools users may use, title generation and compaction. Those live in the database
and are edited under _Settings → Admin_. See [Administration](/operating/administration/).

The rule of thumb: `.env` is for what must be true before the app starts, the admin panel is for
everything else.

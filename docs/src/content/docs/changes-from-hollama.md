---
title: Changes from Hollama
description: Everything this fork does differently from the project it started as.
---

Llooma is a fork of [Hollama](https://github.com/fmaclen/hollama) by
[fmaclen](https://github.com/fmaclen). This page is the record of what has been added, reworked or
removed since, kept as a whole rather than release by release.

For what shipped in a given version, see the [changelog](/llooma/changelog/). For what is planned,
see the [roadmap](/llooma/roadmap/).

## Providers & connections

- Per-connection **colour**, assigned at creation from the unused swatches, shown wherever that connection's models appear
- Per-connection **model display names**, edited in a searchable sub-view of the Servers tab
- Connection card redesigned: status and model count at a glance, everything editable behind one disclosure
- **Sync** replaces the separate verify/refresh actions, and the verified date is persisted
- Stored API keys now show as "Key saved" instead of an empty field
- New **Claude (Anthropic)** provider: preset OpenAI-compatible endpoint, just paste an API key
- New **Infomaniak** provider: Product ID field, endpoint URL built automatically (API v2)
- Provider selection reworked into a **card grid** (Ollama, OpenAI, Claude, Infomaniak, OpenAI-compatible)
- Identified providers hide their **Base URL behind an "Advanced" disclosure** (still editable)
- Per-provider "how to get an API key" help links
- Provider metadata centralised in a single `PROVIDERS` registry

## Chat & sessions

- New **"Chat" settings tab**
- **Default model** setting (moved out of Interface, renamed for clarity)
- **AI-generated session titles**: auto-named after the first reply, using a dedicated (cheap) model
- Header shows the conversation title, keeping `#id` as a parenthesised link
- Copy a whole conversation as **JSON or Markdown**
- Model picker and per-conversation settings joined into one control in the header
- Message layout reworked: the assistant answers as plain prose, the user speaks in a bubble (optionally tinted with the accent colour), actions sit under the message they act on
- Optional timestamp per message
- Reasoning shown behind a left rule rather than a card inside a card
- Thinking indicator with an elapsed counter past three seconds
- "Scroll to the latest message" button, and a fix to the auto-follow that stopped on a single pixel of rounding
- Bare URLs are linkified and shortened to `host/…/page`

## Data

- **Full backup & restore**: export/import every data source in a single file
- Shared `applyToStore` helper de-duplicating the import logic

## UI / UX

- Welcome / home page redesign (chat input, suggestion chips, recent sessions)
- Redesigned chat input and model picker
- Settings moved from a `/settings` route into a **modal**
- Sidebar redesign with avatar + name
- **Theme system**: System / Light / Dark modes + Classic, Dracula, Catppuccin, Gruvbox, Nord and Solarized styles, each with its own light and dark ramp
- Every settings tab rebuilt on the same shared components (`SettingsPanel` / `SettingsSection` / `SettingsField`)
- Dialogs go **full screen on phones**, with a blurred, animated backdrop
- All dropdowns unified on two bits-ui primitives; one model picker used everywhere
- New-user onboarding, and an OIDC-provisioned profile is read-only
- Profile settings (name, avatar, color)
- New logo & favicon

## Infrastructure & tooling

- **Versioned releases**: `semantic-release` reads the commit log, tags, writes the release notes and publishes `ghcr.io/cedhuf/llooma:latest` plus a version tag
- In-app **update check** against the GitHub releases, announced once per version by a dismissible notice (admins only, in server mode)
- CI/CD migrated from `npm` to **pnpm**, Node 20 → **26**
- Docker image uses `GITHUB_TOKEN` (no PAT/secrets to manage)
- Added `docker-compose.yml` and `.env.example` (configurable port & allowed hosts)
- NixOS OCI container example (`nixos/services/hollama.nix`)

## i18n

- Automatic English fallback: a missing key falls back instead of leaving a blank
- Locales reduced to English and French; adding a language no longer means auditing every key
- `pnpm run i18n:status` reports coverage

## Migrations

- Tailwind v3 → v4
- Svelte 4 → 5 (runes)
- bits-ui v0 → v1
- npm → pnpm

## Fixes & cleanup

- Fixed an infinite `$effect` loop in the About tab (`effect_update_depth_exceeded`)
- Fixed a `<button>`-in-`<button>` hydration mismatch in the model picker
- Removed the `prefer-writable-derived` anti-pattern across the codebase
- Replaced hacky `LocalizedString` label casts with proper i18n keys
- Server-side proxy for OpenAI-compatible providers (CORS bypass)
- URL param auto-submit (`?q=`, `&model=`)
- Removed Electron

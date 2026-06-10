# Changes from the original Hollama

This file tracks everything done, added or reworked in **Hollama Next** compared to
the [original Hollama](https://github.com/fmaclen/hollama) by [fmaclen](https://github.com/fmaclen).

## Providers & connections

- New **Claude (Anthropic)** provider — preset OpenAI-compatible endpoint, just paste an API key
- New **Infomaniak** provider — Product ID field, endpoint URL built automatically (API v2)
- Provider selection reworked into a **card grid** (Ollama, OpenAI, Claude, Infomaniak, OpenAI-compatible)
- Identified providers hide their **Base URL behind an "Advanced" disclosure** (still editable)
- Per-provider "how to get an API key" help links
- Provider metadata centralised in a single `PROVIDERS` registry

## Chat & sessions

- New **"Chat" settings tab**
- **Default model** setting (moved out of Interface, renamed for clarity)
- **AI-generated session titles** — auto-named after the first reply, using a dedicated (cheap) model

## Data

- **Full backup & restore** — export/import every data source in a single file
- Shared `applyToStore` helper de-duplicating the import logic

## UI / UX

- Welcome / home page redesign (chat input, suggestion chips, recent sessions)
- Redesigned chat input and model picker
- Settings moved from a `/settings` route into a **modal**
- Sidebar redesign with avatar + name
- **Theme system** — System / Light / Dark modes + Classic / Dracula / Catppuccin styles
- Profile settings (name, avatar, color)
- New logo & favicon

## Infrastructure & tooling

- **Rolling release** — every push to `main` publishes `ghcr.io/cedhuf/hollama:latest`
- CI/CD migrated from `npm` to **pnpm**, Node 20 → **26**
- Docker image uses `GITHUB_TOKEN` (no PAT/secrets to manage)
- Added `docker-compose.yml` and `.env.example` (configurable port & allowed hosts)
- NixOS OCI container example (`nixos/services/hollama.nix`)

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

---
title: Installation
description: Run Llooma with Docker Compose, with Docker directly, or from source.
sidebar:
  order: 1
---

Docker images are published to [`ghcr.io/cedhuf/llooma`](https://ghcr.io/cedhuf/llooma) on every
release. `:latest` always points at the newest one; each release is also tagged with its version
(`:0.6.0`) if you would rather pin.

## With Docker Compose

The recommended way — the compose file already wires up the data volume and reads your `.env`.

```shell
cp .env.example .env
docker compose up -d
```

Then open <http://localhost:4173>.

## With Docker directly

```shell
docker run --rm -d -p 4173:4173 --name llooma ghcr.io/cedhuf/llooma:latest
```

This starts Llooma in local mode with no persistence outside your browser. For server mode you
need at least `AUTH_SECRET` and a bind-mounted `DATA_DIR` — see
[Running modes](/llooma/guides/running-modes/).

## Updating

```shell
docker compose pull && docker compose up -d
```

:::note[Pinning a version]
Some releases remove one-shot migration code. When that happens, the changelog names the version
to pin so you can upgrade through it first. Check [CHANGES.md](https://github.com/cedhuf/llooma/blob/main/CHANGES.md)
before jumping several versions at once.
:::

## Connecting to Ollama on another machine

If your Ollama server runs on a separate device, it has to allow your Llooma instance's domain
in `OLLAMA_ORIGINS` — the browser talks to it directly in local mode, so its CORS policy applies.

```shell
OLLAMA_ORIGINS=https://your-llooma-domain.com ollama serve
```

See [Ollama's FAQ](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server)
for the details.

## From source

```shell
pnpm install
pnpm run dev
```

Requires Node 26 and pnpm. See [Contributing](https://github.com/cedhuf/llooma/blob/main/CONTRIBUTING.md).

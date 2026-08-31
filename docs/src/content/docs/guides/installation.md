---
title: Installation
description: Run Llooma with Docker Compose, with Docker directly, or from source.
sidebar:
  order: 1
---

Docker images are published to [`ghcr.io/cedhuf/llooma`](https://ghcr.io/cedhuf/llooma) on every
release. `:latest` always points at the newest one; each release is also tagged with its version
(`:0.8.0`) if you would rather pin.

## With Docker Compose

The recommended way. You do not need to clone anything: write this `docker-compose.yml` next to a
`.env` file and you are done.

```yaml
services:
  llooma:
    image: ghcr.io/cedhuf/llooma:latest
    restart: unless-stopped
    ports:
      - '${HOST_PORT:-4173}:4173'
    volumes:
      - ./data:/app/data
    environment:
      - DATA_DIR=/app/data
      - VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS:-localhost}
```

```shell
docker compose up -d
```

Then open <http://localhost:4173>.

That is a personal instance: no login screen, one implicit owner created on first run, and nothing
else to configure. `./data` is everything, the SQLite database included, so back up that directory
and you have backed up the instance.

### Adding accounts

Configure a way to sign in and the same container becomes a shared instance:

```yaml
environment:
  - DATA_DIR=/app/data
  - AUTH_CREDENTIALS=true
  - ADMIN_EMAIL=${ADMIN_EMAIL}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD}
  - VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS:-localhost}
```

`AUTH_SECRET` is optional: the instance generates one on first run and keeps it in the database with
the data it protects. Set it yourself, before first run, if you would rather hold it:

```shell
openssl rand -base64 32
```

Every variable is listed in [Configuration](/operating/configuration/). See
[Personal or shared](/guides/running-modes/) for what changes.

The repository also ships a `docker-compose.yml` and a `.env.example` if you would rather start from
those:

```shell
cp .env.example .env
docker compose up -d
```

## With Docker directly

```shell
docker run --rm -d -p 4173:4173 --name llooma ghcr.io/cedhuf/llooma:latest
```

Nothing is persisted without a volume: bind-mount `DATA_DIR` (`-v ./data:/app/data -e
DATA_DIR=/app/data`) or the instance starts empty every time.

## Updating

```shell
docker compose pull && docker compose up -d
```

:::note[Pinning a version]
Some releases remove one-shot migration code. When that happens, the changelog names the version
to pin so you can upgrade through it first. Check the [changelog](/changelog/) before
jumping several versions at once.
:::

## Connecting to Ollama on another machine

If your Ollama server runs on a separate device, the Llooma server is what reaches it, so Ollama has
to listen somewhere other than loopback:

```shell
OLLAMA_HOST=0.0.0.0 ollama serve
```

See [Ollama's FAQ](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server)
for the details.

## From source

```shell
pnpm install
pnpm run dev
```

Requires Node 26 and pnpm. See [Working on Llooma](/development/).

## Next

Once it is running, [First run](/guides/first-run/) takes you from an empty app to a first
answer.

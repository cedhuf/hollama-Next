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
    environment:
      - VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS:-localhost}
```

```shell
docker compose up -d
```

Then open <http://localhost:4173>.

That runs Llooma in **local mode**, where everything lives in your browser and the container holds
no state at all. [Running modes](/llooma/guides/running-modes/) explains the difference and why you
might want the other one.

### For server mode

Server mode keeps data on the server, so it needs a secret and a volume:

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
      - PUBLIC_MODE=server
      - DATA_DIR=/app/data
      - AUTH_SECRET=${AUTH_SECRET}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - AUTH_CREDENTIALS=true
      - VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS:-localhost}
```

Generate the secret once and keep it:

```shell
openssl rand -base64 32
```

`./data` is everything: the SQLite database, the sessions, the encrypted provider keys. Back up that
directory and `AUTH_SECRET` together, since one is useless without the other. Every variable is
listed in [Configuration](/llooma/reference/configuration/).

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

This starts Llooma in local mode with no persistence outside your browser. For server mode you need
at least `AUTH_SECRET` and a bind-mounted `DATA_DIR`.

## Updating

```shell
docker compose pull && docker compose up -d
```

:::note[Pinning a version]
Some releases remove one-shot migration code. When that happens, the changelog names the version
to pin so you can upgrade through it first. Check the [changelog](/llooma/changelog/) before
jumping several versions at once.
:::

## Connecting to Ollama on another machine

If your Ollama server runs on a separate device, it has to allow your Llooma instance's domain
in `OLLAMA_ORIGINS`. The browser talks to it directly in local mode, so its CORS policy applies.

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

Requires Node 26 and pnpm. See [Working on Llooma](/llooma/development/).

## Next

Once it is running, [First run](/llooma/guides/first-run/) takes you from an empty app to a first
answer.

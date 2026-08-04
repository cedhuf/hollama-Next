---
title: Installation
description: Lancer Llooma avec Docker Compose, avec Docker, ou depuis les sources.
sidebar:
  order: 1
---

Les images Docker sont publiées sur [`ghcr.io/cedhuf/llooma`](https://ghcr.io/cedhuf/llooma) à
chaque version. `:latest` pointe toujours vers la plus récente ; chaque version porte aussi son
propre tag (`:0.6.0`) si vous préférez épingler.

## Avec Docker Compose

La méthode recommandée : le fichier compose gère déjà le volume de données et lit votre `.env`.

```shell
cp .env.example .env
docker compose up -d
```

Ouvrez ensuite <http://localhost:4173>.

## Avec Docker directement

```shell
docker run --rm -d -p 4173:4173 --name llooma ghcr.io/cedhuf/llooma:latest
```

Cela démarre Llooma en mode local, sans persistance en dehors de votre navigateur. Pour le mode
serveur il faut au minimum `AUTH_SECRET` et un `DATA_DIR` monté — voir
[Modes de fonctionnement](/llooma/fr/guides/running-modes/).

## Mettre à jour

```shell
docker compose pull && docker compose up -d
```

:::note[Épingler une version]
Certaines versions retirent du code de migration à usage unique. Le changelog indique alors la
version à épingler pour passer par elle d'abord. Consultez
[CHANGES.md](https://github.com/cedhuf/llooma/blob/main/CHANGES.md) avant de sauter plusieurs
versions d'un coup.
:::

## Se connecter à un Ollama sur une autre machine

Si votre serveur Ollama tourne sur un autre appareil, il doit autoriser le domaine de votre
instance Llooma dans `OLLAMA_ORIGINS` — en mode local, c'est le navigateur qui lui parle
directement, donc sa politique CORS s'applique.

```shell
OLLAMA_ORIGINS=https://votre-domaine-llooma.com ollama serve
```

Voir la [FAQ d'Ollama](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server).

## Depuis les sources

```shell
pnpm install
pnpm run dev
```

Nécessite Node 26 et pnpm.

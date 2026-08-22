---
title: Releases
description: How a commit message becomes a version, a changelog and an image.
sidebar:
  order: 4
---

Nobody edits a version number by hand here. `semantic-release` reads the commit log, decides what
the next version is, tags it, writes the release notes and triggers the image build.

Which makes commit messages an input to a program, not a note to yourself.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org). The prefix decides the bump:

| Prefix                              | Effect                    |
| ----------------------------------- | ------------------------- |
| `fix:`                              | Patch, `0.8.0` to `0.8.1` |
| `feat:`                             | Minor, `0.8.0` to `0.9.0` |
| `BREAKING CHANGE:` in the body      | Major                     |
| `chore:`, `docs:`, `refactor:`, ... | No release on its own     |

The subject line is what appears in the release notes, read by people who were not there. Write it
for them.

## Cutting one

The release workflow is **manual**, run from the Actions tab. It is not fired by pushing to `main`,
so a series of commits can land and be released together when they make a coherent whole.

What it does, in order:

1. `semantic-release` works out the version from the commits since the last tag.
2. It writes the release notes and pushes a `chore(release): x.y.z` commit carrying the new version
   in `package.json`.
3. The image workflow builds from `main`, which by then includes that commit, and publishes
   `ghcr.io/cedhuf/llooma` tagged `:latest`, `:x.y.z` and with the commit SHA.
4. The documentation workflow builds from the same `main` and publishes the site.

Images are published per release rather than per push. A multi-arch build takes around twenty
minutes, and `:latest` is only meaningful if the version it carries is the one that was tagged.

The image workflow can also be run on its own, to publish from `main` without cutting a release.

## Removing migration code

Some releases drop one-shot migrations, the carry-overs that read an older storage layout once and
then are gone. A release that does this **must name the version to pin** in its notes, so anyone on
an older build can upgrade through it first.

This is the one thing in the release process that cannot be automated away, because it is a promise
to people whose data is at stake. See the note in
[Installation](/guides/installation/).

## Changes that move data

A release that changes **where a conversation travels** must say so in its notes, in as many words,
and must name the setting that turns it back.

There is one so far: server-side generation, which in local mode routes a turn through the llooma
server on its way to the model, where the browser used to reach Ollama directly. The server is the
user's own machine, and the setting (_Chat → Generate on the server_) restores the old path
exactly. None of that makes it something to discover afterwards.

Same reasoning as the migration note above. Both are promises to people who cannot read the diff,
and neither can be generated from a commit log.

## The documentation site

Built from `docs/` and published to GitHub Pages as part of cutting a release, alongside the image.

It used to publish on every push to `main` that touched `docs/`, which sounds right and is not: the
documentation describes the code, so it changes in the same commits the code does, and publishing
it on push meant the site described a version nobody could install yet. Tied to the release, the
two always agree, and the changelog page finds the release it is meant to list.

Run the workflow on its own to fix a typo without cutting a version.

It is a separate pnpm workspace:

```shell
cd docs
pnpm install
pnpm run dev
```

The `base` in `astro.config.mjs` has to match the repository name: Pages serves the site from a
sub-path and every internal link is built from it.

The HTTP API reference is generated from `docs/openapi.yaml`, and CI fails if a route exists that
the spec does not describe. See [Working on Llooma](/development/).

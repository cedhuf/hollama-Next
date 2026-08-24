---
title: First run
description: From an empty app to a first answer.
sidebar:
  order: 3
---

You have the app open and it has nothing in it. This page gets you to a first reply, and points at
the rest.

## The wizard

A fresh install opens a four-step wizard: a welcome, your profile, your first server, done. It can
be skipped, and everything in it is reachable later from Settings.

The welcome screen also offers **restore from a backup**, which is the right answer if you are
setting up a second machine or replacing one. See [Data](/features/data/).

An instance can suppress the wizard entirely with `PUBLIC_DISABLE_ONBOARDING=true`, for deployments
that arrive pre-configured.

## Connecting a provider

Nothing works until Llooma can reach a model. _Settings → Servers → Add a server_ opens a grid of
providers: Ollama, OpenAI, Claude, Infomaniak, or anything OpenAI-compatible.

Pick one, paste an API key if it needs one, and the model list fills in. The details per provider,
including where to get a key, are on the [providers](/reference/providers/) page.

You can add several. Each connection gets a colour, assigned from the unused ones, and that colour
follows its models everywhere they appear, so you always know which endpoint is about to be billed.

:::note[Ollama on another machine]
The Llooma server is what talks to Ollama, so Ollama has to accept it: give it the address in
`OLLAMA_HOST`, and see [Installation](/guides/installation/).
:::

On a shared instance the connections are the admin's business, not yours: models simply appear in
the picker. An admin may or may not allow you to add your own on top.

## A first answer

The home screen is a composer. Type, pick a model from the control in the header, send.

Three things to know from the first message:

- **_Add context_** attaches [knowledge](/features/knowledge/), images and
  [documents](/features/documents/). Each becomes a removable pill.
- The **toggles next to the composer** arm [web search and web fetch](/features/tools/) for
  that message only.
- The **ring in the composer** fills as the conversation does. Grey until 60%, then amber, then red.
  Tap or hover it for the figures. When it worries you, that is what
  [compaction](/features/compaction/) is for.

The conversation names itself after the first reply.

## Worth doing next

- Pick a theme, and decide what the home screen shows: [Interface](/features/interface/).
- Write down the instructions you keep repeating, once:
  [Knowledge](/features/knowledge/).
- Build a character around them: [Personas](/features/personas/).
- Export a backup before you have anything to lose: [Data](/features/data/).

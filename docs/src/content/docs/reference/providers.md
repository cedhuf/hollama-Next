---
title: Providers
description: What you can connect Llooma to, and what each one needs.
sidebar:
  order: 1
---

Llooma has no models of its own. It talks to yours, through connections you add under
_Settings → Servers_. Add as many as you like, from as many providers as you like, at the same time.

## The five presets

| Provider              | Endpoint                       | Key      |
| --------------------- | ------------------------------ | -------- |
| **Ollama**            | `http://localhost:11434`       | none     |
| **OpenAI**            | `https://api.openai.com/v1`    | required |
| **Claude**            | `https://api.anthropic.com/v1` | required |
| **Infomaniak**        | built from your product ID     | required |
| **OpenAI-compatible** | anything                       | optional |

Everything except Ollama speaks the OpenAI chat API. For the three named providers the endpoint is
worked out for you and tucked behind an _Advanced_ disclosure, since editing it is the exception.
Each preset links to its own "where do I find my API key" page.

**Infomaniak** asks for the AI Tools product ID from your manager, not a URL: the endpoint only
varies by that number, so it is built for you. The connection cannot be synced until you give one.

**OpenAI-compatible** is the catch-all: vLLM, llama.cpp, SGLang, LM Studio, a gateway, a colleague's
box. Give it a base URL, and a key if it wants one.

## Per connection

- **A colour**, assigned at creation from the ones not yet in use, shown wherever that connection's
  models appear. With four endpoints in the picker, this is how you avoid sending a throwaway
  question to the expensive one.
- **A label**, if the provider name is not enough.
- **A model filter**, so a provider offering two hundred models contributes the ten you use.
- **Display names**, edited in a searchable sub-view: `mistralai/Mistral-Small-24B-Instruct` can read
  as whatever you call it out loud.
- **Sync**, one action that re-reads the model list and verifies the connection, with the date of the
  last successful one kept.

A stored key is shown as _Key saved_ rather than as an empty field, so nothing looks broken, and
replacing it is explicit.

## Reasoning

The per-conversation reasoning toggle appears for the endpoints that can actually be asked for it:

- **Ollama**, which has its own native thinking mode.
- **OpenAI-compatible** and **Infomaniak**, which take the explicit
  `chat_template_kwargs.enable_thinking` flag that vLLM, llama.cpp and SGLang understand.

Hosted OpenAI and Claude reject unknown body fields, so the toggle is not offered there. Their
reasoning models still reason; they simply decide it themselves.

## Ollama specifics

Ollama models can be pulled from inside the app, and Ollama conversations expose the advanced
parameters (`num_ctx` among them).

`num_ctx` is worth setting: it is the one case where Llooma knows the model's real context window,
which makes the [load meter](/llooma/features/compaction/) exact instead of measuring against the
threshold you guessed.

## How requests travel

**Local mode**: the browser holds the keys and calls the provider itself, through `/api/proxy` when
CORS requires it. Ollama on another machine needs your origin in `OLLAMA_ORIGINS`.

**Server mode**: the browser calls `/api/llm`, and the server injects the key. Keys never reach a
browser, and the generic proxy is disabled outright. See [Security](/llooma/guides/security/).

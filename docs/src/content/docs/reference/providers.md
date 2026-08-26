---
title: Providers
description: What you can connect Llooma to, and what each one needs.
sidebar:
  order: 1
---

Llooma has no models of its own. It talks to yours, through connections you add under
_Settings → Servers_. Add as many as you like, from as many providers as you like, at the same time.

## The six presets

| Provider              | Endpoint                       | Key      |
| --------------------- | ------------------------------ | -------- |
| **Ollama**            | `http://localhost:11434`       | none     |
| **OpenAI**            | `https://api.openai.com/v1`    | required |
| **Claude**            | `https://api.anthropic.com/v1` | required |
| **Infomaniak**        | built from your product ID     | required |
| **OpenRouter**        | `https://openrouter.ai/api/v1` | required |
| **OpenAI-compatible** | anything                       | optional |

Everything except Ollama speaks the OpenAI chat API. For the four named providers the endpoint is
worked out for you and tucked behind an _Advanced_ disclosure, since editing it is the exception.
Each preset links to its own "where do I find my API key" page.

**Infomaniak** asks for the AI Tools product ID from your manager, not a URL: the endpoint only
varies by that number, so it is built for you. The connection cannot be synced until you give one.

**OpenRouter** is one key in front of several hundred models from every vendor, which makes it the
cheapest way to try one before deciding whether to host it. It arrives unfiltered on purpose: no
prefix means anything across a catalogue that wide, so use the model filter or the picker's search.
Drawing is not offered on it, since it serves image models through a chat-shaped route rather than
the one the images page calls. Speaking is: see below.

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

## Model parameters

Temperature, top-p, seed, stop sequences, the penalties and a token ceiling are set in _Settings,
Chat_, and any conversation can override them from its own settings. They go to every provider now.
They used to reach Ollama and nowhere else, so a temperature set on a hosted model quietly did
nothing.

A second group only Ollama understands (`top_k`, `min_p`, `mirostat` and friends) sits in its own
subsection and says so. It is not sent elsewhere on purpose: a provider that does not know a field
answers 400 rather than ignoring it.

`num_ctx` is worth setting: it is the one case where Llooma knows the model's real context window,
which makes the [load meter](/features/compaction/) exact instead of measuring against the threshold
you guessed.

## Ollama specifics

Ollama models can be pulled from inside the app.

How Ollama loads a model, the GPU and thread counts, memory mapping and the rest, belongs to the
connection rather than to a conversation, so it is set once under _Advanced_ on the connection and
every conversation held on it follows. A count left blank and a switch left on _Auto_ both mean the
same thing: Ollama decides. That matters more than it sounds. `use_mmap` is on by default there, so
"off" and "not set" are different answers, which is why the switches have three positions rather than
two.

## Speech models

Sound runs in two directions, and the two are different kinds of model with lists
of their own. **Transcription** turns what you said into text. **Reading aloud**
turns an answer into sound. Give either one the other's job and it answers 400,
which is why the two pickers never share a list.

**OpenRouter** keeps both out of its main catalogue. Four hundred entries at
`/models`, and neither the nineteen that transcribe nor the eighteen that speak
are among them. Llooma asks the two narrower questions for you on every sync, so
Whisper, Voxtral, Parakeet, Deepgram and Chirp turn up under transcription, and
Kokoro, Orpheus, Fish Audio, MiniMax and the rest under reading aloud, with no
configuration at all.

Asking those questions also settles what each model is, which no reading of a
name could manage. `fish-audio/s1` talks, `fish-audio/transcribe-1` listens, and
no substring separates them. What the provider declares beats the guess. Your own
correction in _Models and prices_ beats both.

**Infomaniak** answers a transcription with a job to come back for rather than
with the words. Nothing about that shows in the app: you speak, and the text
arrives.

Everything else is assumed to transcribe the ordinary way, `/audio/transcriptions`
on its own root, answering with the text. Any OpenAI-compatible endpoint serving
Whisper works with no entry of its own. Where the endpoint is known to take one,
the spoken language goes up with the audio, and you set it in _Settings, Voice_.
Left empty, the model works it out. It does that well on a full sentence and
badly on three words.

Reading aloud takes no such default. Hardly any endpoint serves `/audio/speech`,
so it is offered only where a provider has said it does, and a connection that
has not said so has no voice models at all. Where it is offered, you pick the
voice by name from a list the provider publishes, or type the name yourself when
it publishes none.

In that direction the language is the voice, and every family says so
differently. Kokoro's `ff_siwis` is French and `af_bella` is American, at the
front of the name. Deepgram's `aura-2-agathe-fr` says it at the back. Gemini and
Grok are another thing again: their voices are timbres rather than languages, and
the model takes the language from the text with no field to override it.

## What a call costs

Llooma tracks what an account spends, and refuses a call once a ceiling is
reached. Dictation and reading aloud are now included. Before this they were
neither counted nor limited.

If you have entered a price for a model, that price is used. If you have not, the
figure the provider reports is.

On a gateway only the reported figure can be right. OpenRouter sends each request
to whichever upstream provider it picks and bills at that provider's rate, and it
does not use one unit for everything either. Two calls, measured: Kokoro is
charged per character of input, Whisper per second of audio. The catalogue calls
both figures `prompt` and never says which is which. A price entered by hand
would have been wrong by nearly four times on the first of those.

So a connection that reports shows **Auto** and no price fields, much as a saved
API key shows _Key saved_ instead of an empty box. There is nothing useful to
type. _Bill my own rate_ brings the fields back for one model, and it means what
it says: your figure is counted instead of theirs, which is what you want when
rebilling a team or working to a rate they know nothing about. Clearing it returns
to Auto. Nothing shows red here either: the warning about unpriced models is about
calls that would go uncounted, and none of these do.

Every other provider uses the price table, and for them it is exact. One model,
one price, which is what it was built for. Infomaniak billing transcription by
the minute works entirely this way.

One hole, named rather than hidden. If a provider reports nothing and you have
entered nothing, the call is not counted, and an uncounted call is one your
allowance never sees. It cannot be blocked after the fact, because the cost only
exists once the call has been made and paid for. Entering a price is what closes
it. Nothing is ever estimated for billing: the app will guess a token count to
fill a progress ring, and it will not put a guess on an invoice.

Currencies are not converted. A total that mixes two is a known limitation.

## How requests travel

The browser calls `/api/llm/{id}`, naming a connection rather than describing one, and the server
resolves its address and injects the key. Keys never reach a browser, and there is no unauthenticated
relay to go around it. See [Security](/guides/security/).

## Yours is not in the list

Use **OpenAI-compatible**, which is the answer for everything the named entries are not. It works;
it just cannot preset your endpoint, link to where your keys live, or know what your image models
call a portrait.

Those conveniences come from one file per provider under `src/lib/providers/`, and adding one is a
file and a line. Nothing else in the application names a provider, so contributing yours is a small
change a reviewer can judge on knowing the provider rather than the codebase. And because the list
is never a gate, getting a detail wrong degrades an experience instead of locking anyone out.

See [Adding a provider](/development/providers/).

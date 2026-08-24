---
title: Security
description: What leaves your server, who can make it happen, and how to restrict it.
sidebar:
  order: 4
---

Your server acts as a network client on someone else's behalf in two places. Both are useful, both
are worth understanding before you expose an instance.

## The provider proxy

The browser never holds a provider key and never addresses a provider. It calls `/api/llm/{id}`,
which resolves the connection by id, checks that the caller may use it, and injects the key
server-side. There is no unauthenticated relay: the generic CORS proxy that used to serve the
browser-only mode has been removed, along with `PROXY_ALLOWED_ORIGINS`.

The rules an admin sets about which models are shared are applied there, and again on a turn that
runs in the server, so neither path is a way around the other.

## The web fetch tool

Web fetch reads the URL a user pastes, from inside your network. Private, loopback and link-local
addresses are refused, the cloud metadata endpoint included, and redirects are re-checked at every
hop. But an instance open to untrusted users is still letting them choose what your server
connects to.

Restrict it with `FETCH_ALLOWED_ORIGINS`, or turn it off for everyone under
_Settings → Admin → Shared tools_. That switch is enforced by the endpoint itself, not merely
hidden in the interface.

## Sharing is enforced server-side

Shared tools, shared model allow-lists and locked instance prompts are applied in the endpoints
(the turn that resolves them, and `/api/llm`), not only in the interface. A hand-crafted request is policed the same
way the app's own is.

A locked instance prompt is guaranteed **present** rather than exclusive: it is prepended in the
proxy, so a persona's own system prompt adds to it instead of replacing it.

## Reporting something

Open a [security advisory](https://github.com/cedhuf/security/advisories/new) rather than a
public issue.

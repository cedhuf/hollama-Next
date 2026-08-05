---
title: Security
description: What leaves your server, who can make it happen, and how to restrict it.
sidebar:
  order: 4
---

Two features make your server act as a network client on someone else's behalf. Both are useful,
both are worth understanding before you expose an instance.

## The provider proxy

`/api/proxy/…` forwards a request to whatever origin it is given, and **requires no signed-in
user**. That is deliberate: in local mode the browser holds the keys and the proxy only exists to
get past CORS, including reaching Ollama on `localhost`, so it cannot refuse private addresses the
way the fetch tool does.

- **In server mode the route is disabled outright** (404). The browser goes through the
  authenticated `/api/llm/…` proxy instead, which checks the session and injects the key
  server-side.
- **In local mode**, if the instance is reachable from your network, set `PROXY_ALLOWED_ORIGINS`
  to your providers' origins. With the default empty allowlist it is an open proxy for anyone who
  can reach it.

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
(`/api/fetch`, `/api/llm`), not only in the interface. A hand-crafted request is policed the same
way the app's own is.

A locked instance prompt is guaranteed **present** rather than exclusive: it is prepended in the
proxy, so a persona's own system prompt adds to it instead of replacing it.

## Reporting something

Open a [security advisory](https://github.com/cedhuf/llooma/security/advisories/new) rather than a
public issue.

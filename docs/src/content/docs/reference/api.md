---
title: HTTP API
description: What the API is for, and how far to trust it.
sidebar:
  order: 4
---

Llooma's API exists to serve Llooma's own interface. It is documented so the behaviour is
auditable and so a self-hosted instance can be scripted, not because it is a stable public
contract. It changes with the interface.

The generated, endpoint-by-endpoint reference is in the sidebar under **HTTP API**.

## Authentication

Every endpoint requires a signed-in session unless its page says otherwise. Sessions are cookies
issued by Auth.js on sign-in.

Note that `/api` is exempt from the page-level auth guard: **each endpoint checks the session
itself**. That is why an endpoint that forgets to is a real vulnerability rather than a missing
redirect, and why the [generic proxy](/llooma/guides/security/) has to refuse server mode from
inside its own handler.

## Shape of the surface

| Prefix          | Purpose                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `/api/data/*`   | The user's own collections (sessions, knowledge, personas), read and written per item |
| `/api/llm/…`    | Authenticated provider proxy; the server injects the API key                          |
| `/api/proxy/…`  | Local-mode-only CORS proxy; **404 in server mode**                                    |
| `/api/admin/…`  | Instance configuration, users, shared servers. Admin only                             |
| `/api/search/…` | Full-text search across the user's conversations                                      |
| `/api/*/config` | The resolved, per-user view of an admin-shared setting                                |

## Documentation status

Endpoints marked `x-status: todo` in the spec have their path and methods recorded but not yet
their request and response shapes. The surface itself is complete and kept honest by CI:
`scripts/check-api-docs.mjs` fails the build if a route exists that the spec does not describe, or
the reverse.

So: if an endpoint is listed, it exists. If its body is documented, that part has been written
down deliberately.

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Allowed target origins, comma-separated, e.g.
 *   PROXY_ALLOWED_ORIGINS="https://api.openai.com,http://localhost:11434"
 *
 * Empty (the default) means the proxy forwards anywhere. That is the price of a
 * frictionless local instance — the browser has to reach Ollama on localhost and
 * whatever endpoint the user typed, so no address range can be blocked here the
 * way `fetchPage` blocks them. Local mode has a single user and no session to
 * check, so this is only ever as exposed as the instance itself; an instance put
 * on a network should set the allowlist.
 */
const allowedOrigins = (env.PROXY_ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

export async function GET({ request, params }) {
	return proxy(request, params.path);
}

export async function POST({ request, params }) {
	return proxy(request, params.path);
}

async function proxy(request: Request, path: string | undefined) {
	// Server mode never uses this route — the browser talks to `/api/llm/<id>`,
	// which checks the session and injects the key server-side. Left reachable it
	// would be an unauthenticated relay in front of a multi-user instance, and the
	// auth guard exempts every `/api` path, so the refusal has to live here.
	if (publicEnv.PUBLIC_MODE === 'server') {
		return new Response('Not found', { status: 404 });
	}

	const targetBaseUrl = request.headers.get('X-Target-Base-Url');
	if (!targetBaseUrl) {
		return new Response('Missing X-Target-Base-Url header', { status: 400 });
	}

	let url: URL;
	try {
		url = new URL(`${targetBaseUrl.replace(/\/+$/, '')}${path ? `/${path}` : ''}`);
	} catch {
		return new Response('Invalid target URL', { status: 400 });
	}

	// Only ever proxy HTTP(S); reject file:, gopher:, data:, etc.
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return new Response('Unsupported target protocol', { status: 400 });
	}

	if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
		return new Response('Target origin not allowed', { status: 403 });
	}

	const headers = new Headers();
	for (const name of ['authorization', 'content-type', 'accept']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	const body = request.method === 'POST' ? await request.text() : undefined;

	const response = await fetch(url, {
		method: request.method,
		headers,
		body,
		// When an allowlist is enforced, don't let a redirect bounce the request
		// (and its Authorization header) to a host outside it.
		redirect: allowedOrigins.length > 0 ? 'manual' : 'follow'
	});

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'content-type': response.headers.get('content-type') || 'application/json'
		}
	});
}

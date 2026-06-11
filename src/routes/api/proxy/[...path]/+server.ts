import { env } from '$env/dynamic/private';

/**
 * Allowed target origins, comma-separated, e.g.
 *   PROXY_ALLOWED_ORIGINS="https://api.openai.com,http://localhost:11434"
 *
 * Empty (the default) means the proxy forwards anywhere — acceptable for a
 * personal/local instance, but operators of a shared/public instance should
 * lock this down to close the open-relay/SSRF surface. Per-user authorization
 * (forwarding by serverId, with keys held server-side) arrives with the server
 * mode; see ARCHITECTURE.md §6.
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

import { error } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getServer, getServerApiKey } from '$lib/server/db/servers';
import { applyChatPolicy, PolicyError } from '$lib/server/llmPolicy';

import type { RequestHandler } from './$types';

/**
 * Authenticated LLM proxy for server mode. The client references a server by id
 * only — never a URL or key. We verify the session and that the user may use
 * this server (system, or their own), then forward to the real endpoint with
 * the decrypted key injected. The key never reaches the browser.
 */
const proxy: RequestHandler = async (event) => {
	const user = await requireUser(event);
	const server = getServer(event.params.serverId);
	if (!server) throw error(404, 'Server not found');
	if (server.owner_user_id !== null && server.owner_user_id !== user.id) {
		throw error(403, 'Forbidden');
	}
	if (!server.is_enabled) throw error(403, 'Server is disabled');

	const path = event.params.path ? `/${event.params.path}` : '';
	const url = `${server.base_url.replace(/\/+$/, '')}${path}`;

	const headers = new Headers();
	for (const name of ['content-type', 'accept']) {
		const value = event.request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const key = getServerApiKey(server);
	if (key) headers.set('authorization', `Bearer ${key}`);

	let body = event.request.method === 'POST' ? await event.request.text() : undefined;

	// The admin's rules are applied here rather than in the browser: this is the
	// only path a request can take, so a hand-crafted one is policed too.
	try {
		body = applyChatPolicy(server, user.role === 'admin', event.params.path ?? '', body);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	const response = await fetch(url, { method: event.request.method, headers, body });

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'content-type': response.headers.get('content-type') || 'application/json'
		}
	});
};

export const GET = proxy;
export const POST = proxy;

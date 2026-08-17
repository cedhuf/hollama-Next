import { error } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getModelPricing, getServer, getServerApiKey } from '$lib/server/db/servers';
import { isOverLimit } from '$lib/server/db/usage';
import { applyChatPolicy, PolicyError } from '$lib/server/llmPolicy';
import { meter } from '$lib/server/usageMeter';

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

	/**
	 * Whether this request is a turn, as opposed to asking what models exist.
	 *
	 * Only a turn is metered and only a turn is refused. Listing models when you
	 * are over your allowance still works, because an app that cannot draw its own
	 * settings page is broken rather than restrained.
	 */
	const isCompletion = /(chat\/completions|\bapi\/chat|\bapi\/generate|\/completions)$/.test(
		event.params.path ?? ''
	);

	// Asked before the turn starts, never during one: a conversation already under
	// way always finishes. Someone over their allowance is told so plainly, which
	// is the only moment a limit is allowed to interrupt anything.
	if (isCompletion && isOverLimit(user.id)) throw error(402, 'Credit limit reached');

	const model = modelIn(body);
	if (isCompletion) body = askForUsage(body);

	// The admin's rules are applied here rather than in the browser: this is the
	// only path a request can take, so a hand-crafted one is policed too.
	try {
		body = applyChatPolicy(server, user.role === 'admin', event.params.path ?? '', body);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	const response = await fetch(url, { method: event.request.method, headers, body });

	// Counted from what the provider reports, on the way past. The browser's half
	// of the stream is untouched and waits for nothing.
	const stream =
		isCompletion && response.ok && response.body && model
			? meter(response.body, user.id, (name) => getModelPricing(server.id)[name], model)
			: response.body;

	return new Response(stream, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'content-type': response.headers.get('content-type') || 'application/json'
		}
	});
};

/** The model a request names, which is what its cost is looked up by. */
function modelIn(body: string | undefined): string | undefined {
	if (!body) return undefined;
	try {
		const parsed = JSON.parse(body) as { model?: unknown };
		return typeof parsed.model === 'string' ? parsed.model : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Ask an OpenAI-compatible provider to report usage on a streamed answer.
 *
 * Without `stream_options.include_usage` there is no `usage` block on a stream
 * at all, so every streamed turn — which is every turn — would go uncounted.
 * Ollama reports its counts unasked, and ignores the field.
 *
 * Left alone if the body is not JSON or already says otherwise: this is a meter,
 * and a meter that rewrites a request it did not understand is a bug waiting for
 * the one provider that reads the field differently.
 */
function askForUsage(body: string | undefined): string | undefined {
	if (!body) return body;
	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		if (parsed.stream !== true) return body;
		const options = (parsed.stream_options ?? {}) as Record<string, unknown>;
		if ('include_usage' in options) return body;
		return JSON.stringify({ ...parsed, stream_options: { ...options, include_usage: true } });
	} catch {
		return body;
	}
}

export const GET = proxy;
export const POST = proxy;

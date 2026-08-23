import { error } from '@sveltejs/kit';

import { refusal } from '$lib/chat/refusal';
import { hasPriceFigure } from '$lib/connections';
import { requireUser } from '$lib/server/api';
import { getModelPricing, getServer, getServerApiKey } from '$lib/server/db/servers';
import { creditLimitFor, isOverLimit } from '$lib/server/db/usage';
import { applyChatPolicy, PolicyError } from '$lib/server/llmPolicy';
import { meter, meterImages } from '$lib/server/usageMeter';

import type { RequestHandler } from './$types';

/**
 * Authenticated LLM proxy for server mode. The client references a server by id
 * only. Never a URL or key. We verify the session and that the user may use
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

	/**
	 * Whether this request is a turn, as opposed to asking what models exist.
	 *
	 * Only work is metered and only work is refused. Listing models when you
	 * are over your allowance still works, because an app that cannot draw its own
	 * settings page is broken rather than restrained.
	 */
	const isCompletion = /(chat\/completions|\bapi\/chat|\bapi\/generate|\/completions)$/.test(
		event.params.path ?? ''
	);

	/**
	 * Whether this request draws something.
	 *
	 * Matched on the tail rather than on a whole path, because the prefix is not
	 * ours to predict: OpenAI puts this under `/v1`, and Infomaniak puts it under
	 * neither the same API version nor the same `/v1` as its own chat endpoint.
	 * What every one of them ends in is `images/<verb>`.
	 *
	 * It is here because until now it matched nothing: a drawing went through this
	 * relay unmetered, unlimited, and without anyone checking that its model had
	 * ever been shared. That was not a decision, it was a regex written when the
	 * only thing the app could ask for was a conversation.
	 */
	const isImage = /images\/(generations(\/[a-z_]+)?|edits|variations)$/.test(
		event.params.path ?? ''
	);

	/** Anything that makes the provider work, and therefore anything that costs. */
	const isBillable = isCompletion || isImage;

	/**
	 * The root this request hangs off.
	 *
	 * Two, because one was an assumption: a provider may serve its image endpoints
	 * from somewhere the chat base cannot reach by appending a path. Resolved here
	 * and only here, so the browser keeps sending a plain relative path and never
	 * learns either address, which is the whole point of this relay in server
	 * mode.
	 */
	const base = (isImage && server.image_base_url) || server.base_url;
	const path = event.params.path ? `/${event.params.path}` : '';
	const url = `${base.replace(/\/+$/, '')}${path}`;

	const headers = new Headers();
	for (const name of ['content-type', 'accept']) {
		const value = event.request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const key = getServerApiKey(server);
	if (key) headers.set('authorization', `Bearer ${key}`);

	let body = event.request.method === 'POST' ? await event.request.text() : undefined;

	/**
	 * Whether this account's spending is being watched at all.
	 *
	 * Only on the instance's own connections. A personal server is somebody's own
	 * key and their own bill, and neither counting it against an instance
	 * allowance nor refusing it in the name of one would be defensible.
	 */
	const metered = server.owner_user_id === null;
	const limit = metered && isBillable ? creditLimitFor(user.id) : 0;

	const model = modelIn(body);

	if (limit > 0) {
		// Asked before the turn starts, never during one: a conversation already
		// under way always finishes. This is the only moment a limit is allowed to
		// interrupt anything.
		if (isOverLimit(user.id)) throw error(402, refusal('credit-limit'));

		/**
		 * A model with no price is refused while a limit is in force.
		 *
		 * Not counted would mean not limited, and an unpriced model is almost
		 * always an oversight rather than a decision: one forgotten model is an
		 * unlimited allowance for everybody, quietly, for as long as nobody
		 * notices. The message names the cause so the user asks their
		 * administrator rather than concluding the app is broken.
		 */
		if (model && !hasPriceFigure(getModelPricing(server.id)[model])) {
			throw error(402, refusal('unpriced-model', model));
		}
	}

	// Only a conversation reports token counts, and only a conversation is asked
	// to. An image endpoint handed an unknown field answers 400.
	if (isCompletion) body = askForUsage(body);

	/**
	 * How many images this asks for, capped at what the request may say.
	 *
	 * Read before the call because it is the only place the number exists before
	 * the answer does, and the answer is several megabytes of base64 that the
	 * meter has no business opening. One when unstated, which is what every
	 * provider defaults to.
	 */
	const imageCount = isImage ? imagesAskedFor(body) : 0;

	// The admin's rules are applied here rather than in the browser: this is the
	// only path a request can take, so a hand-crafted one is policed too.
	try {
		body = applyChatPolicy(server, user.role === 'admin', event.params.path ?? '', body);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	// Started before the call because a model billed per minute is billed for the
	// time this takes, and the only clock that can see it is this one.
	const startedAt = Date.now();
	const response = await fetch(url, { method: event.request.method, headers, body });

	// Counted from what the provider reports, on the way past. The browser's half
	// of the stream is untouched and waits for nothing.
	const countable = metered && response.ok && response.body && model;
	let stream: ReadableStream<Uint8Array> | null = response.body;
	if (countable && isCompletion) {
		stream = meter(response.body!, user.id, (name) => getModelPricing(server.id)[name], model!);
	} else if (countable && isImage) {
		stream = meterImages(
			response.body!,
			user.id,
			getModelPricing(server.id)[model!],
			imageCount,
			startedAt
		);
	}

	return new Response(stream, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'content-type': response.headers.get('content-type') || 'application/json'
		}
	});
};

/**
 * How many images a request asks for.
 *
 * Clamped rather than trusted: `n` is a number the browser sends, and a meter
 * that multiplies a price by it would be a meter anyone could set to zero. The
 * ceiling is the highest any provider the app talks to accepts, so a request
 * above it was going to be refused by the provider anyway.
 */
function imagesAskedFor(body: string | undefined): number {
	if (!body) return 1;
	try {
		const parsed = JSON.parse(body) as { n?: unknown };
		const n = Math.floor(Number(parsed.n));
		if (!Number.isFinite(n) || n < 1) return 1;
		return Math.min(n, 10);
	} catch {
		return 1;
	}
}

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
 * at all, so every streamed turn (which is every turn) would go uncounted.
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

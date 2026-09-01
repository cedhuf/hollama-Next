import { error } from '@sveltejs/kit';

import { refusal } from '$lib/chat/refusal';
import { hasPriceFigure, reportsCost, type ConnectionType } from '$lib/connections';
import { requireServer, requireUser } from '$lib/server/api';
import { getModelPricing, getServerApiKey } from '$lib/server/db/servers';
import { creditLimitFor, isOverLimit } from '$lib/server/db/usage';
import { applyChatPolicy, PolicyError } from '$lib/server/llmPolicy';
import { meter, meterImages } from '$lib/server/usageMeter';

import type { RequestHandler } from './$types';

/**
 * Authenticated LLM proxy for server mode. The client references a server by id
 * only, never a URL or key; this verifies the session and that the user may use
 * that server, then forwards with the decrypted key injected.
 */
const proxy: RequestHandler = async (event) => {
	const user = await requireUser(event);
	const server = requireServer(user.id, event.params.serverId);

	/** Only work is metered and only work is refused: listing models over your allowance still works, since an app that cannot draw its settings page is broken rather than restrained. */
	const isCompletion = /(chat\/completions|\bapi\/chat|\bapi\/generate|\/completions)$/.test(
		event.params.path ?? ''
	);

	/**
	 * Whether this request draws something. Matched on the tail, because the prefix
	 * is not ours to predict: OpenAI puts this under `/v1` and Infomaniak under
	 * neither the same API version nor the same `/v1` as its chat endpoint. All of
	 * them end in `images/<verb>`.
	 *
	 * Until now it matched nothing, so a drawing went through unmetered and without
	 * anyone checking its model had been shared.
	 */
	const isImage = /images\/(generations(\/[a-z_]+)?|edits|variations)$/.test(
		event.params.path ?? ''
	);

	/** Anything that makes the provider work, and therefore anything that costs. */
	const isBillable = isCompletion || isImage;

	/**
	 * The root this request hangs off. Two, because one was an assumption: a
	 * provider may serve its image endpoints where the chat base cannot reach by
	 * appending a path. Resolved here alone, so the browser never learns either
	 * address.
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

	/** Only on the instance's own connections: a personal server is somebody's own key and their own bill. */
	const metered = server.owner_user_id === null;
	const limit = metered && isBillable ? creditLimitFor(user.id) : 0;

	const model = modelIn(body);

	if (limit > 0) {
		// Asked before the turn starts, never during one: a conversation already under
		// way always finishes.
		if (isOverLimit(user.id)) throw error(402, refusal('credit-limit'));

		/**
		 * A model with no price is refused while a limit is in force: not counted would
		 * mean not limited, and one forgotten model is an unlimited allowance for
		 * everybody. The message names the cause, so the user asks their administrator
		 * rather than concluding the app is broken.
		 */
		if (
			model &&
			!hasPriceFigure(getModelPricing(server.id)[model]) &&
			// Unless the provider will say what the call cost: the rule exists because
			// uncounted means unlimited, and insisting on a figure in the table would refuse
			// the one provider whose figures are exact.
			!reportsCost(server.connection_type as ConnectionType)
		) {
			throw error(402, refusal('unpriced-model', model));
		}
	}

	// Only a conversation reports token counts, and only a conversation is asked to.
	// An image endpoint handed an unknown field answers 400.
	if (isCompletion) body = askForUsage(body);

	/** Read before the call, the only place the number exists before the answer does, and the answer is megabytes of base64 the meter has no business opening. One when unstated. */
	const imageCount = isImage ? imagesAskedFor(body) : 0;

	// The admin's rules are applied here rather than in the browser: this is the
	// only path a request can take, so a hand-crafted one is policed too.
	try {
		body = applyChatPolicy(server, user.role === 'admin', event.params.path ?? '', body);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	// Started before the call: a model billed per minute is billed for the time this
	// takes, and the only clock that can see it is this one.
	const startedAt = Date.now();
	const response = await fetch(url, { method: event.request.method, headers, body });

	// Counted from what the provider reports, on the way past. The browser's half of
	// the stream is untouched and waits for nothing.
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

/** Clamped rather than trusted: `n` comes from the browser, and a meter that multiplies a price by it is one anyone could set to zero. */
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
 * Without `stream_options.include_usage` a stream carries no `usage` block at
 * all, so every streamed turn would go uncounted. Ollama reports unasked and
 * ignores the field.
 *
 * It is also all a gateway needs: OpenRouter puts its `cost` in that same block,
 * so a second field asking for the cost changed nothing and was deleted.
 *
 * Left alone if the body is not JSON or already says otherwise: a meter that
 * rewrites a request it did not understand is a bug waiting for the one provider
 * that reads the field differently.
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

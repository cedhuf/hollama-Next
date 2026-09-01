import {
	hasPriceFigure,
	reportsCost,
	type ConnectionType,
	type ModelPrice
} from '$lib/connections';
import { countsInBody, resolveCost, type RunUsage } from '$lib/usageCounts';

import { getModelPricing, getServer, type ServerRow } from './db/servers';
import { addUsage, creditLimitFor, isOverLimit } from './db/usage';

/** Writing down what a turn consumed as it goes past. The reading itself is in `$lib/usageCounts`, which has no database behind it; this half is the plumbing. */

/**
 * Watch a response body on its way to the browser, and record what it says.
 *
 * A `TransformStream` rather than `tee()`: a tee has two consumers, and the
 * background one can be cancelled when the request ends, before it has read the
 * chunk carrying the totals, which is the last one. Here every chunk passes
 * through and the recording happens when the stream closes.
 */
export function meter(
	body: ReadableStream<Uint8Array>,
	userId: string,
	priceFor: (model: string) => ModelPrice | undefined,
	model: string
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	let seen = '';

	const watcher = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			controller.enqueue(chunk);
			try {
				// Only the tail is kept: holding a whole answer to read its last line would pay
				// for the conversation twice. Sixty-four kilobytes, because a body that is not
				// streamed is one JSON object whose `usage` may not be at the very end.
				seen = (seen + decoder.decode(chunk, { stream: true })).slice(-65536);
			} catch {
				// A body that is not text has no counts in it.
			}
		},
		flush() {
			try {
				const counts = countsInBody(seen);
				if (!counts) {
					// Said out loud, or a provider that reports nothing looks like a quiet month.
					console.warn(`[usage] ${model} reported no token counts; nothing recorded`);
					return;
				}

				// What the provider said it cost, and the table only where it said nothing. An
				// unpriced model with nothing reported is not counted at all: see `costOf`.
				const cost = resolveCost(counts, priceFor(model));
				if (cost === undefined) {
					console.warn(`[usage] ${model} has no price on this connection; nothing recorded`);
					return;
				}

				addUsage(userId, {
					inputTokens: counts.input,
					outputTokens: counts.output,
					seconds: counts.seconds,
					cost
				});
			} catch {
				// A meter that throws must never be the reason a turn fails.
			}
		}
	});

	return body.pipeThrough(watcher);
}

/**
 * Watch a drawing on its way out, and record what it cost. The same passthrough
 * as `meter`, reading nothing: an image response carries no token counts, and
 * both things it is billed by are known without opening it. The count comes from
 * the request, and the clock stops when the stream closes, since generation is
 * still running while the body is on its way.
 */
export function meterImages(
	body: ReadableStream<Uint8Array>,
	userId: string,
	price: ModelPrice | undefined,
	images: number,
	startedAt: number
): ReadableStream<Uint8Array> {
	const watcher = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			controller.enqueue(chunk);
		},
		flush() {
			try {
				const seconds = (Date.now() - startedAt) / 1000;
				const cost = resolveCost({ input: 0, output: 0, images, seconds }, price);
				// An unpriced model is not counted at all: see `costOf`.
				if (cost === undefined) {
					console.warn('[usage] image model has no price on this connection; nothing recorded');
					return;
				}
				addUsage(userId, { images, seconds, cost });
			} catch {
				// A meter that throws must never be the reason a request fails.
			}
		}
	});

	return body.pipeThrough(watcher);
}

/**
 * Record what a server-side turn consumed. The counts arrive as an event rather
 * than as bytes, because here the server *is* the client. The pricing lookup is
 * the relay's, so a model costs the same whichever road the turn took.
 *
 * A personal connection is somebody's own key and bill, so it is neither counted
 * nor limited.
 */
export function recordRunUsage(
	userId: string,
	serverId: string | undefined,
	model: string | undefined,
	used: RunUsage
): void {
	if (
		!serverId ||
		!model ||
		(!used.input && !used.output && !used.images && !used.seconds && used.cost === undefined)
	) {
		return;
	}

	const row = getServer(serverId);
	if (!row || row.owner_user_id !== null) return;

	const cost = resolveCost(used, getModelPricing(serverId)[model]);
	if (cost === undefined) {
		console.warn(`[usage] ${model} has no price on this connection; nothing recorded`);
		return;
	}

	addUsage(userId, {
		inputTokens: used.input,
		outputTokens: used.output,
		images: used.images,
		seconds: used.seconds,
		cost
	});
}

/** Only the instance's own connections: a personal server is somebody's own key and their own bill. */
export function isMetered(server: ServerRow): boolean {
	return server.owner_user_id === null;
}

/**
 * Why this account may not start another billable call, if it may not. The same
 * two questions the chat relay asks, in one place so the voice routes ask them
 * the same way: both were unguarded, so somebody out of credit could still
 * dictate and still be read to.
 *
 * The unpriced rule exempts a provider that reports what its calls cost: nothing
 * there goes uncounted, so nothing needs refusing.
 */
export function refuseForCredit(
	userId: string,
	server: ServerRow,
	model: string
): 'credit-limit' | 'unpriced-model' | null {
	if (!isMetered(server)) return null;
	if (creditLimitFor(userId) <= 0) return null;
	if (isOverLimit(userId)) return 'credit-limit';

	if (reportsCost(server.connection_type as ConnectionType)) return null;
	return hasPriceFigure(getModelPricing(server.id)[model]) ? null : 'unpriced-model';
}

/**
 * Record what one voice call consumed. Its own entry point because
 * `recordRunUsage` is about a turn: it re-reads the connection from an id and
 * refuses a personal one, where here the connection is already in hand.
 *
 * Silent on failure: somebody already has their words or their sound, and a
 * meter that threw would turn a successful call into an error after the fact.
 */
export function recordVoiceUsage(
	userId: string,
	server: ServerRow,
	model: string,
	used: RunUsage
): void {
	if (!isMetered(server)) return;

	// Nothing reported and nothing to count against a price, which happens on a
	// synthesis whose provider names no way to ask. The app does not estimate in
	// order to charge. Said out loud, or it looks like a quiet month.
	if (used.cost === undefined && !used.input && !used.output && !used.seconds) {
		console.warn(`[usage] ${model} reported nothing countable; nothing recorded`);
		return;
	}

	try {
		const cost = resolveCost(used, getModelPricing(server.id)[model]);
		if (cost === undefined) {
			console.warn(`[usage] ${model} reported no cost and has no price; nothing recorded`);
			return;
		}
		addUsage(userId, {
			inputTokens: used.input,
			outputTokens: used.output,
			seconds: used.seconds,
			cost
		});
	} catch {
		// A meter must never make a call that worked look like a failure.
	}
}

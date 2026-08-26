import {
	hasPriceFigure,
	reportsCost,
	type ConnectionType,
	type ModelPrice
} from '$lib/connections';
import { countsInBody, resolveCost, type RunUsage } from '$lib/usageCounts';

import { getModelPricing, getServer, type ServerRow } from './db/servers';
import { addUsage, creditLimitFor, isOverLimit } from './db/usage';

/**
 * Writing down what a turn consumed, as it goes past.
 *
 * The reading itself is in `$lib/usageCounts`, which has no database behind it
 * and can therefore be checked on its own. This half is the plumbing: split the
 * stream, drain one side, record what it said.
 */

/**
 * Watch a response body on its way to the browser, and record what it says.
 *
 * A `TransformStream` rather than `tee()`, and the difference is not stylistic.
 * A tee has two consumers: one is the response, the other is a loop running in
 * the background with nobody waiting for it, and when the request ends the
 * second half can be cancelled before it has read the chunk that carries the
 * totals, which is the last one. Nothing was counted, and nothing said so.
 *
 * Here there is one consumer. Every chunk passes through on its way out, the
 * meter sees exactly what the browser sees, and the recording happens when the
 * stream closes because that is the same moment the answer finishes.
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
				// Only the tail is kept: holding a whole answer in memory to read its
				// last line would be paying for the conversation twice. Sixty-four
				// kilobytes because a body that is not streamed is one JSON object, and
				// its `usage` is not guaranteed to be at the very end of it.
				seen = (seen + decoder.decode(chunk, { stream: true })).slice(-65536);
			} catch {
				// A body that is not text is a body with no counts in it.
			}
		},
		flush() {
			try {
				const counts = countsInBody(seen);
				if (!counts) {
					// Said out loud, because the alternative is a spend of zero that looks
					// like a quiet month. A provider that reports nothing cannot be
					// counted, and whoever runs the instance needs to know which one.
					console.warn(`[usage] ${model} reported no token counts; nothing recorded`);
					return;
				}

				// What the provider said it cost, and the table only where it said
				// nothing. An unpriced model with nothing reported is not counted at
				// all: see `costOf`.
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
 * Watch a drawing on its way out, and record what it cost.
 *
 * The same passthrough as `meter`, reading nothing. There is nothing to read: an
 * image response carries no token counts, and the two things it is billed by are
 * both known without opening it: how many images were asked for, and how long
 * the provider took. The count comes from the request, which is the only place
 * it is stated before the answer exists, and the clock stops when the stream
 * closes rather than when the headers land, because generation is still running
 * while the body is on its way.
 *
 * A body that is several megabytes of base64 is therefore never buffered here.
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
 * Record what a server-side turn consumed.
 *
 * The counts arrive as an event rather than as bytes on a stream, because on
 * this path the server *is* the client: it holds the provider connection, and
 * what it reports is already parsed. The pricing lookup is the same one the
 * relay does, so a model costs the same whichever road the turn took.
 *
 * The server a turn ran on is the one named in its input; a personal connection
 * is somebody's own key and own bill, so it is neither counted nor limited.
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

/**
 * Whether a call on this connection counts against an allowance at all.
 *
 * Only the instance's own connections. A personal server is somebody's own key
 * and their own bill, and neither counting it against an instance allowance nor
 * refusing it in the name of one would be defensible.
 */
export function isMetered(server: ServerRow): boolean {
	return server.owner_user_id === null;
}

/**
 * Why this account may not start another billable call, if it may not.
 *
 * The same two questions the chat relay asks, in one place so the voice routes
 * ask them the same way rather than approximately the same way. Both were
 * unguarded until now: somebody at the end of their credit could still dictate
 * and still be read to, indefinitely.
 *
 * The unpriced rule has an exception it did not used to need. Refusing an
 * unpriced model exists because uncounted means unlimited, and one forgotten
 * model would be an unlimited allowance for everybody. That reasoning stops
 * applying to a provider that reports what its calls cost: nothing there goes
 * uncounted, so nothing needs refusing, and insisting on a figure in the table
 * would block the one provider whose figures are exact.
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
 * Record what one voice call consumed.
 *
 * Its own entry point rather than `recordRunUsage`, because that one is about a
 * turn: it re-reads the connection from an id it was given, and refuses a
 * personal one. Here the connection is already in hand and already checked, and
 * what is being recorded is a length of audio or a handful of tokens rather than
 * a conversation.
 *
 * Silent on failure, deliberately. Somebody has already been given their words
 * or their sound; a meter that threw at this point would turn a successful call
 * into an error after the fact.
 */
export function recordVoiceUsage(
	userId: string,
	server: ServerRow,
	model: string,
	used: RunUsage
): void {
	if (!isMetered(server)) return;

	// Nothing reported and nothing to count against a price. It happens on a
	// synthesis whose provider names no way to ask what it cost: the answer is
	// sound, the characters that produced it are not a reading anybody bills on,
	// and the app does not estimate in order to charge. Said out loud, because the
	// alternative is a spend of zero that looks like a quiet month.
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
		// A meter must never be the reason a call that worked looks like a failure.
	}
}

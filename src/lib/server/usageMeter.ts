import type { ModelPrice } from '$lib/connections';
import { costOf, countsInBody } from '$lib/usageCounts';

import { addUsage } from './db/usage';

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
 * totals — which is the last one. Nothing was counted, and nothing said so.
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

				const cost = costOf(counts, priceFor(model));
				// An unpriced model is not counted at all: see `costOf`.
				if (cost === undefined) {
					console.warn(`[usage] ${model} has no price on this connection; nothing recorded`);
					return;
				}

				addUsage(userId, {
					inputTokens: counts.input,
					outputTokens: counts.output,
					cost
				});
			} catch {
				// A meter that throws must never be the reason a turn fails.
			}
		}
	});

	return body.pipeThrough(watcher);
}

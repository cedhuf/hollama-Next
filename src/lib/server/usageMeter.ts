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
 * Read a response body as it goes past, and record what it says.
 *
 * The stream is split in two: one half is handed straight back to the browser
 * untouched, the other is drained here. Nothing waits for the meter, so a slow
 * or failing count can delay an answer by exactly nothing.
 */
export function meter(
	body: ReadableStream<Uint8Array>,
	userId: string,
	priceFor: (model: string) => ModelPrice | undefined,
	model: string
): ReadableStream<Uint8Array> {
	const [toClient, toMeter] = body.tee();

	void (async () => {
		try {
			const text = await new Response(toMeter).text();
			const counts = countsInBody(text);
			if (!counts) return;

			const cost = costOf(counts, priceFor(model));
			// An unpriced model is not counted at all: see `costOf`.
			if (cost === undefined) return;

			addUsage(userId, {
				inputTokens: counts.input,
				outputTokens: counts.output,
				cost
			});
		} catch {
			// A meter that throws must never be the reason a turn fails.
		}
	})();

	return toClient;
}

import type { ModelPrice } from '$lib/connections';

/**
 * Reading what a turn consumed, out of what the provider said.
 *
 * Pure on purpose, and in its own module for one reason: this is the arithmetic
 * that decides whether somebody is over their limit, and it has to be checkable
 * without a database, a session or a request. The half that writes the figure
 * down lives in `server/usageMeter`.
 *
 * Never our own estimate. `estimateTokens` divides characters by 3.7 and exists
 * to colour a ring; using it to charge somebody would be inventing a number and
 * then acting on it. The provider reports, or nothing is counted.
 *
 * Two shapes cover every endpoint the app talks to. OpenAI-compatible responses
 * carry `usage.prompt_tokens` / `usage.completion_tokens`, on the last chunk when
 * streaming; Ollama carries `prompt_eval_count` / `eval_count` on its final
 * object. Anything else goes uncounted, which is the honest failure: a guardrail
 * that under-counts lets somebody through, one that guesses accuses them.
 */

export interface TokenCount {
	input: number;
	output: number;
}

/** The counts in one parsed JSON object, if it carries any. */
function countsIn(value: unknown): TokenCount | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;

	const usage = o.usage as Record<string, unknown> | undefined;
	if (usage) {
		const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
		const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
		if (input || output) return { input, output };
	}

	const input = Number(o.prompt_eval_count ?? 0);
	const output = Number(o.eval_count ?? 0);
	if (input || output) return { input, output };

	return undefined;
}

/**
 * The counts in a whole response body, streamed or not.
 *
 * The last ones win: a stream repeats the running totals, and the final chunk is
 * the one that is true. Parsing is per line and failures are silent by design —
 * this is a meter reading a body it does not own, and a malformed chunk must
 * cost the user nothing, least of all their answer.
 */
export function countsInBody(text: string): TokenCount | undefined {
	let last: TokenCount | undefined;

	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (!line || line === 'data: [DONE]') continue;
		const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
		if (!payload.startsWith('{')) continue;

		try {
			const counts = countsIn(JSON.parse(payload));
			if (counts) last = counts;
		} catch {
			// A half-written chunk is not a reading.
		}
	}

	return last;
}

/**
 * What a turn cost, or `undefined` when the model has no price.
 *
 * Unpriced is not free. Returning nothing here is what keeps a model nobody got
 * round to pricing out of the totals entirely, rather than adding zero to them
 * and quietly reporting that somebody spent nothing.
 */
export function costOf(counts: TokenCount, price: ModelPrice | undefined): number | undefined {
	if (!price || (price.input == null && price.output == null)) return undefined;
	const input = ((price.input ?? 0) * counts.input) / 1_000_000;
	const output = ((price.output ?? 0) * counts.output) / 1_000_000;
	return input + output;
}

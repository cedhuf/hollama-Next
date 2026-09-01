import { hasPriceFigure, priceUnit, type ModelPrice } from '$lib/connections';

/**
 * Reading what a turn consumed, out of what the provider said.
 *
 * Pure and in its own module, because this is the arithmetic that decides
 * whether somebody is over their limit and it has to be checkable without a
 * database. The half that writes it down is `server/usageMeter`.
 *
 * Never our own estimate: `estimateTokens` divides characters by 3.7 and exists
 * to colour a ring. The provider reports, or nothing is counted.
 *
 * Where the provider reports the *cost* rather than the counts, that wins. A
 * price stored against a connection assumes one model has one price there, and
 * on a gateway that is false: OpenRouter routes to whichever upstream it likes.
 *
 * Two shapes cover every endpoint: OpenAI-compatible `usage.prompt_tokens` /
 * `completion_tokens`, and Ollama's `prompt_eval_count` / `eval_count`. Anything
 * else goes uncounted, which is the honest failure.
 */

export interface TokenCount {
	input: number;
	output: number;
	/**
	 * What the provider says this actually cost, when it says. Absent is not zero:
	 * absent means nobody reported and the price table answers instead, while zero
	 * is a free model reported as free.
	 *
	 * In whatever currency the provider bills in. Nothing is converted anywhere, so
	 * a total mixing two currencies is a known limit rather than a surprise.
	 */
	cost?: number;
	/** Seconds of audio, where the provider reports them. */
	seconds?: number;
}

/** The counts in one parsed JSON object, if it carries any. */
function countsIn(value: unknown): TokenCount | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;

	const usage = o.usage as Record<string, unknown> | undefined;
	if (usage) {
		const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
		const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
		// Only when it is actually there: a reported zero is a free model and must be
		// honoured, while a zero invented here would replace a price somebody entered.
		const cost = typeof usage.cost === 'number' ? usage.cost : undefined;
		// Audio, where a provider bills the length. Reported on the transcription route
		// and nowhere else, which is why it is read rather than timed.
		const seconds = typeof usage.seconds === 'number' ? usage.seconds : undefined;
		if (input || output || cost !== undefined || seconds !== undefined) {
			return { input, output, cost, seconds };
		}
	}

	const input = Number(o.prompt_eval_count ?? 0);
	const output = Number(o.eval_count ?? 0);
	if (input || output) return { input, output };

	return undefined;
}

/** The last ones win: a stream repeats the running totals and the final chunk is true. Parsing failures are silent by design, since a malformed chunk must cost the user nothing. */
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

/** `TokenCount` widened rather than replaced: a chat turn reports tokens and every existing caller keeps handing over exactly that. */
export interface RunUsage extends TokenCount {
	/** Images returned. */
	images?: number;
}

/**
 * What a call cost, or `undefined` when the model has no price. Unpriced is not
 * free: returning nothing keeps an unpriced model out of the totals rather than
 * adding zero and reporting that somebody spent nothing.
 *
 * The unit decides which reading is used; a reading it does not ask for is
 * ignored rather than added.
 */
export function costOf(used: RunUsage, price: ModelPrice | undefined): number | undefined {
	if (!hasPriceFigure(price)) return undefined;

	switch (priceUnit(price)) {
		case 'image':
			return (price!.rate ?? 0) * (used.images ?? 0);
		case 'second':
			return (price!.rate ?? 0) * (used.seconds ?? 0);
		case 'minute':
			return ((price!.rate ?? 0) * (used.seconds ?? 0)) / 60;
		default: {
			const input = ((price!.input ?? 0) * used.input) / 1_000_000;
			const output = ((price!.output ?? 0) * used.output) / 1_000_000;
			return input + output;
		}
	}
}

/**
 * What to charge for one call: your figure if you set one, otherwise theirs.
 *
 * A price entered against a model wins outright. That is what entering one
 * means: a decision to bill this model at your own rate whatever they say.
 * Nobody types a number for a case that never happens.
 *
 * Where nothing was entered, the provider's figure is used, and on a gateway it
 * is the only one that can be right. A reported zero is a figure like any other:
 * free models exist and cost zero.
 *
 * Nothing from either side means the call goes uncounted, which is a real hole:
 * an uncounted call is one an allowance never sees. Entering a price closes it.
 */
export function resolveCost(used: RunUsage, price: ModelPrice | undefined): number | undefined {
	return costOf(used, price) ?? used.cost;
}

import { hasPriceFigure, priceUnit, type ModelPrice } from '$lib/connections';

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
 * And where the provider reports the *cost* rather than only the counts, that is
 * what is used. A price stored against a connection is an assumption that one
 * model has one price there, and on a gateway it is simply false: OpenRouter
 * routes to whichever upstream provider it likes, and `openai/whisper-large-v3`
 * is 0.0000075 on one and 0.0015 on another. No table filled in by hand can be
 * right about that, and the answer that is right arrives in the response.
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
	/**
	 * What the provider says this actually cost, when it says.
	 *
	 * Absent is not zero. Absent means nobody reported, and the price table answers
	 * instead; zero means a free model, reported as free, and is charged as zero.
	 *
	 * In whatever currency the provider bills in, which for the one gateway that
	 * reports this is dollars. Nothing is converted, here or anywhere else in the
	 * app, and a total that mixes two currencies is a known limit rather than a
	 * surprise.
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
		// Only when it is actually there. A zero that was reported is a free model
		// and must be honoured as zero; a zero this invented would silently replace
		// a price somebody had entered.
		const cost = typeof usage.cost === 'number' ? usage.cost : undefined;
		// Audio, where a provider bills the length rather than the tokens. Reported
		// on the transcription route and nowhere else, which is why it is read here
		// and not measured with a clock.
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

/**
 * The counts in a whole response body, streamed or not.
 *
 * The last ones win: a stream repeats the running totals, and the final chunk is
 * the one that is true. Parsing is per line and failures are silent by design,
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
 * What one call consumed, whatever kind of call it was.
 *
 * `TokenCount` widened rather than replaced: a chat turn reports tokens and
 * nothing else, and every existing caller keeps handing over exactly that. What
 * a drawing consumes is a number of images and a length of time, neither of
 * which a token count has anywhere to put.
 */
export interface RunUsage extends TokenCount {
	/** Images returned. */
	images?: number;
}

/**
 * What a call cost, or `undefined` when the model has no price.
 *
 * Unpriced is not free. Returning nothing here is what keeps a model nobody got
 * round to pricing out of the totals entirely, rather than adding zero to them
 * and quietly reporting that somebody spent nothing.
 *
 * The unit decides which reading is used, and a reading the unit does not ask
 * for is ignored rather than added: a model billed per image costs the same
 * whether the request also happened to report tokens.
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
 * One function so there is one answer, and so the order of authority is written
 * once rather than repeated at each of the four places that record something.
 *
 * A price entered against a model wins outright. That is what entering one now
 * means: not a spare figure kept in case the provider forgets to mention theirs,
 * but a decision to bill this model at your own rate whatever they say. Anyone
 * rebilling a team, or working to a negotiated rate, is doing arithmetic the
 * provider knows nothing about. Nobody types a number for a case that never
 * happens, so a number that is typed is a number that is meant.
 *
 * Where nothing has been entered, the provider's own figure is used, and on a
 * gateway it is the only one that can be right: it routes each request to
 * whichever upstream provider it likes, at that provider's rate, and says so
 * afterwards. A reported zero is a figure like any other. Free models exist, they
 * report zero, and they cost zero.
 *
 * Nothing from either side means the call goes uncounted. That is a real hole and
 * it is named rather than papered over: an uncounted call is one an allowance
 * never sees. Entering a price is what closes it, which is the second thing
 * entering one is for.
 */
export function resolveCost(used: RunUsage, price: ModelPrice | undefined): number | undefined {
	return costOf(used, price) ?? used.cost;
}

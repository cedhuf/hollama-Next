import { ConnectionType } from '$lib/connections';

/**
 * What a picture should look like, said in words the app owns.
 *
 * Providers do not agree on how to ask for either of these, and there is no way
 * to find out what one accepts: image endpoints have no capability discovery,
 * `/v1/models` returns identifiers and nothing else, and the only way to
 * "ask" would be to send something invalid and read the refusal. So the app
 * asks the person in terms that are stable — a shape and a level of effort — and
 * translates at the last moment.
 *
 * A ratio is the right unit because it is the one thing that has not changed:
 * every image model since the first has offered square, portrait and landscape,
 * while the pixel counts behind them differ per model and change with each new
 * one. Three entries per provider instead of a list per model.
 *
 * And when a translation is not known, nothing is sent. Omitting is valid
 * everywhere, since every endpoint has a default; guessing is a 400 that arrives
 * thirty seconds later.
 */

export type ImageRatio = 'square' | 'portrait' | 'landscape';
export const IMAGE_RATIOS: ImageRatio[] = ['square', 'portrait', 'landscape'];

export type ImageQuality = 'low' | 'standard' | 'high';
export const IMAGE_QUALITIES: ImageQuality[] = ['low', 'standard', 'high'];

/** What one connection understands, empty where the app has nothing to say. */
export interface ImageOptions {
	sizes?: Record<ImageRatio, string>;
	qualities?: Record<ImageQuality, string>;
}

/** OpenAI's current image model, and Infomaniak's, happen to differ on both. */
const GPT_IMAGE: ImageOptions = {
	sizes: { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' },
	qualities: { low: 'low', standard: 'medium', high: 'high' }
};

/**
 * The older pair of steps, used by `dall-e-3` and by Infomaniak.
 *
 * Two levels where the app offers three, so the bottom two collapse onto the
 * same request. Collapsing is the honest failure: the alternative is hiding a
 * control on some providers and not others, which makes the same setting mean
 * different things depending on where you are.
 */
const TWO_STEP: Pick<ImageOptions, 'qualities'> = {
	qualities: { low: 'standard', standard: 'standard', high: 'hd' }
};

const DALL_E_3: ImageOptions = {
	sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
	...TWO_STEP
};

const INFOMANIAK: ImageOptions = {
	sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
	...TWO_STEP
};

/**
 * What this connection accepts for this model.
 *
 * Keyed on the connection first and refined by the model name second, because
 * one provider can serve several image models that disagree: on OpenAI,
 * `dall-e-3` takes 1024x1792 where `gpt-image-1` takes 1024x1536, and their
 * quality words are not the same words either.
 *
 * An unrecognised name returns nothing rather than the provider's other model's
 * answer. A self-hosted endpoint returns nothing too — it is whatever somebody
 * installed last week, and pretending to know is how you get a refusal.
 */
export function imageOptionsFor(connectionType: string, model: string): ImageOptions {
	const id = model.toLowerCase();

	if (connectionType === ConnectionType.Infomaniak) return INFOMANIAK;

	if (connectionType === ConnectionType.OpenAI) {
		if (id.includes('gpt-image')) return GPT_IMAGE;
		if (id.includes('dall-e-3')) return DALL_E_3;
		return {};
	}

	return {};
}

/** The size to send, or nothing when the app cannot say. */
export function sizeFor(options: ImageOptions, ratio: ImageRatio): string | undefined {
	return options.sizes?.[ratio];
}

/** The quality to send, or nothing when the app cannot say. */
export function qualityFor(options: ImageOptions, quality: ImageQuality): string | undefined {
	return options.qualities?.[quality];
}

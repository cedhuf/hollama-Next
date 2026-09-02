import type { ProviderDescriptor } from './types';

/**
 * Infomaniak AI Tools, the provider that forced most of this file's shape.
 *
 * Its endpoint is fixed except for the product id in the path, so the form asks
 * for that value and builds the URL, starting blank rather than carrying a
 * template with `{productId}` still in it.
 *
 * Its images are not under its chat endpoint: chat is API version 2 under
 * `/openai/v1`, images are version 1 under `/openai`, which is why a connection
 * can carry two roots. Chat stays on version 2, where function calling and
 * multimodal input are documented.
 */

/** Everything but the product id, which the connection form asks for. */
export const INFOMANIAK_URL_TEMPLATE = 'https://api.infomaniak.com/2/ai/{productId}/openai/v1';
const IMAGE_URL_TEMPLATE = 'https://api.infomaniak.com/1/ai/{productId}/openai';
const RESULTS_URL_TEMPLATE = 'https://api.infomaniak.com/1/ai/{productId}/results';
const PHOTO_MAKER_URL_TEMPLATE =
	'https://api.infomaniak.com/1/ai/{productId}/images/generations/photo_maker';

/** The name this app gives that route, so it can be priced and shared like a model. */
export const INFOMANIAK_PHOTO_MAKER = 'photo_maker';

/** The product id out of a stored endpoint, or nothing when there is none in it. */
export function infomaniakProductId(baseUrl: string): string {
	const found = baseUrl?.match(/\/ai\/([^/]+)\/openai/)?.[1] ?? '';
	// An unsubstituted placeholder reads as no id, which is what it is.
	return found === '{productId}' ? '' : found;
}

/** The chat endpoint for a product id, or nothing to build it from. */
export function infomaniakBaseUrl(productId: string): string {
	const id = productId.trim();
	return id ? INFOMANIAK_URL_TEMPLATE.replace('{productId}', id) : '';
}

/** The image endpoint for a product id, built from the same one field. */
export function infomaniakImageBaseUrl(productId: string): string {
	const id = productId.trim();
	return id ? IMAGE_URL_TEMPLATE.replace('{productId}', id) : '';
}

/** Not under `/openai` like drawing and not under `/v1` like chat: Infomaniak's own route, hanging off the product. Derived from the same one field as the other two. */
export function infomaniakPhotoMakerUrl(productId: string): string {
	const id = productId.trim();
	return id ? PHOTO_MAKER_URL_TEMPLATE.replace('{productId}', id) : '';
}

/** Where an asynchronous job's answer is collected, from the same product id. */
export function infomaniakResultsUrl(productId: string): string {
	const id = productId.trim();
	return id ? RESULTS_URL_TEMPLATE.replace('{productId}', id) : '';
}

export const infomaniak: ProviderDescriptor = {
	id: 'infomaniak',
	name: 'Infomaniak',
	family: 'openai',
	identified: true,
	baseUrl: INFOMANIAK_URL_TEMPLATE,
	urlField: {
		label: 'productId',
		placeholder: '123456',
		toBaseUrl: infomaniakBaseUrl,
		fromBaseUrl: infomaniakProductId
	},
	requiresApiKey: true,
	apiKeyHelpUrl: 'https://manager.infomaniak.com/v3/infomaniak-api',
	badge: { id: 'infomaniak', color: '#BA7517' },
	nativeTools: true,
	thinkingRequest: true,
	imageGeneration: true,
	// One image model, one answer, so no rules are needed: `flux` is what the
	// product lists, with these three sizes and two quality words.
	images: {
		sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
		qualities: { low: 'standard', standard: 'standard', high: 'hd' }
	},
	imageBaseFrom: (baseUrl) => infomaniakImageBaseUrl(infomaniakProductId(baseUrl)),
	// A route rather than a model, so nothing lists it. Named here it becomes one:
	// priced, shared, and refused unpriced like everything else.
	extraModels: [INFOMANIAK_PHOTO_MAKER],
	/**
	 * Transcription departs from the contract twice: it is on version 1 under
	 * `/openai`, so the connection's own root does not reach it, and it is
	 * asynchronous, the POST answering with a batch id. Their catalogue lists the
	 * model on version 2 all the same, so the obvious address 404s.
	 */
	transcription: {
		url: ({ baseUrl }) =>
			`${infomaniakImageBaseUrl(infomaniakProductId(baseUrl))}/audio/transcriptions`,
		poll: {
			url: ({ baseUrl }, accepted) => {
				const batch = (accepted as { batch_id?: string })?.batch_id ?? '';
				return `${infomaniakResultsUrl(infomaniakProductId(baseUrl))}/${batch}`;
			},
			/**
			 * Their job envelope: `status` is at the root and `data` is a *string* holding
			 * the JSON with the words in it. Their transcription arrives with a leading
			 * space, which the app trims.
			 */
			read: (body) => {
				const job = body as { status?: unknown; data?: unknown };
				const status = String(job?.status ?? '').toLowerCase();
				if (['error', 'failed', 'failure', 'canceled', 'cancelled'].includes(status)) {
					return { done: false, failed: status };
				}
				if (status && !['success', 'succeeded', 'done', 'completed'].includes(status)) {
					return { done: false };
				}

				let payload: unknown = job?.data;
				if (typeof payload === 'string') {
					try {
						payload = JSON.parse(payload);
					} catch {
						// Not JSON: then it is the transcript itself, which some formats are.
						return { done: true, text: payload as string };
					}
				}
				const text = (payload as { text?: unknown })?.text;
				return typeof text === 'string' ? { done: true, text } : { done: false };
			}
		}
	},
	modelRules: [
		{
			matches: [INFOMANIAK_PHOTO_MAKER],
			// The same three sizes and two quality words as the drawing endpoint.
			images: {
				sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
				qualities: { low: 'standard', standard: 'standard', high: 'hd' }
			},
			references: {
				// One is enough, more is better, six is their ceiling.
				max: 6,
				field: 'images[]',
				// The likeness goes where the prompt says: "portrait photo of a woman img".
				// Without the word the endpoint refuses rather than ignoring it.
				trigger: 'img',
				// No model: this route is one, so naming another is a field it refuses.
				url: ({ baseUrl }) => infomaniakPhotoMakerUrl(infomaniakProductId(baseUrl))
			}
		}
	]
};

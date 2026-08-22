import type { ProviderDescriptor } from './types';

/**
 * Infomaniak AI Tools.
 *
 * The provider that forced most of this file's shape, and the one worth reading
 * if you are adding another.
 *
 * Its endpoint is fixed except for the product id in the path, so the form asks
 * for that one value and builds the URL. It starts blank rather than carrying
 * the template: an address with `{productId}` still in it is not an address, and
 * leaving it empty is what stops the connection being synced before it can work.
 *
 * And its images are not under its chat endpoint. Chat is API version 2 under
 * `/openai/v1`; images are only on version 1 under `/openai`, with no `/v1` at
 * all. No path appended to the first reaches the second, which is why a
 * connection can carry two roots and why this file derives the second from the
 * first.
 *
 * Chat stays on version 2 deliberately. Version 1's chat route is marked
 * deprecated in their own specification, and version 2 is the one that documents
 * function calling and multimodal input, both of which this app uses.
 */

/** Everything but the product id, which the connection form asks for. */
export const INFOMANIAK_URL_TEMPLATE = 'https://api.infomaniak.com/2/ai/{productId}/openai/v1';
const IMAGE_URL_TEMPLATE = 'https://api.infomaniak.com/1/ai/{productId}/openai';
const PHOTO_MAKER_URL_TEMPLATE =
	'https://api.infomaniak.com/1/ai/{productId}/images/generations/photo_maker';

/** The name this app gives that route, so it can be priced and shared like a model. */
export const INFOMANIAK_PHOTO_MAKER = 'photo_maker';

/** The product id out of a stored endpoint, or nothing when there is none in it. */
export function infomaniakProductId(baseUrl: string): string {
	const found = baseUrl?.match(/\/ai\/([^/]+)\/openai/)?.[1] ?? '';
	// An unsubstituted placeholder reads as no id at all, which is what it is.
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

/**
 * Portrait customisation, which is a third root again.
 *
 * Not under `/openai` like the drawing endpoint, and not under `/v1` like chat:
 * it is Infomaniak's own route, so it hangs directly off the product. Derived
 * from the same product id as the other two, so a connection still asks for one
 * value and gets all three.
 */
export function infomaniakPhotoMakerUrl(productId: string): string {
	const id = productId.trim();
	return id ? PHOTO_MAKER_URL_TEMPLATE.replace('{productId}', id) : '';
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
	// product lists, and their specification enumerates these three sizes and
	// these two quality words for it.
	images: {
		sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
		qualities: { low: 'standard', standard: 'standard', high: 'hd' }
	},
	imageBaseFrom: (baseUrl) => infomaniakImageBaseUrl(infomaniakProductId(baseUrl)),
	// A route rather than a model, so nothing lists it. Named here, it becomes one:
	// it shows up in Models and pricing, it is priced per minute, it is shared or
	// not, and the credit limit refuses it unpriced exactly like everything else.
	extraModels: [INFOMANIAK_PHOTO_MAKER],
	modelRules: [
		{
			matches: [INFOMANIAK_PHOTO_MAKER],
			// The same three sizes and two quality words as the drawing endpoint, per
			// their specification, so nothing is repeated here that is not different.
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

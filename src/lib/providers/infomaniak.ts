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
	imageBaseFrom: (baseUrl) => infomaniakImageBaseUrl(infomaniakProductId(baseUrl))
};

import { anthropic } from './anthropic';
import { compatible } from './compatible';
import { infomaniak } from './infomaniak';
import { ollama } from './ollama';
import { openai } from './openai';
import { openrouter } from './openrouter';
import type {
	Catalogue,
	ImageOptions,
	ImageQuality,
	ImageRatio,
	ModelRule,
	ProviderDescriptor,
	ReferenceImages
} from './types';

/**
 * The providers this app has been told about.
 *
 * Order matters once: it is the order the connection picker offers them in, and
 * the compatible entry sits last because a list opening with "or something else"
 * reads as a shrug.
 *
 * Adding one is a file and a line here. Nothing else in the application names a
 * provider, which is the property this folder exists to hold.
 */
export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
	ollama,
	openai,
	anthropic,
	infomaniak,
	openrouter,
	compatible
];

/** The door for anything nobody has described. Never a failure, always an answer. */
export const FALLBACK_DESCRIPTOR = compatible;

export function describeProvider(connectionType: string): ProviderDescriptor {
	return PROVIDER_DESCRIPTORS.find((p) => p.id === connectionType) ?? FALLBACK_DESCRIPTOR;
}

/** The model's own rule if one matches, the provider's default otherwise, and nothing when neither says, which leaves both fields out of the request. */
export function imageOptionsFor(connectionType: string, model: string): ImageOptions {
	const descriptor = describeProvider(connectionType);
	const id = model.toLowerCase();
	const rule = descriptor.modelRules?.find((r: ModelRule) =>
		r.matches.some((needle) => id.includes(needle))
	);
	return rule?.images ?? descriptor.images ?? {};
}

/** The model's own rule first, the provider's second, and nothing when neither says, which leaves the drop zone shut rather than offering a control the endpoint would refuse. */
export function referencesFor(connectionType: string, model: string): ReferenceImages | undefined {
	const descriptor = describeProvider(connectionType);
	const id = model.toLowerCase();
	const rule = descriptor.modelRules?.find((r: ModelRule) =>
		r.matches.some((needle) => id.includes(needle))
	);
	return rule?.references ?? descriptor.references;
}

/** Models a provider serves that its own catalogue does not list. */
export function declaredModels(connectionType: string): string[] {
	return describeProvider(connectionType).extraModels ?? [];
}

/** Empty for almost everyone, which is the point: a provider whose catalogue is its catalogue says nothing and nothing extra is fetched. */
export function extraCatalogues(connectionType: string, roots: { baseUrl: string }): Catalogue[] {
	return describeProvider(connectionType).catalogues?.(roots) ?? [];
}

/** The size to send, or nothing when the app cannot say. */
export function sizeFor(options: ImageOptions, ratio: ImageRatio): string | undefined {
	return options.sizes?.[ratio];
}

/** The quality to send, or nothing when the app cannot say. */
export function qualityFor(options: ImageOptions, quality: ImageQuality): string | undefined {
	return options.qualities?.[quality];
}

export {
	INFOMANIAK_URL_TEMPLATE,
	infomaniakBaseUrl,
	infomaniakImageBaseUrl,
	infomaniakProductId
} from './infomaniak';
export {
	type Catalogue,
	IMAGE_QUALITIES,
	IMAGE_RATIOS,
	type ImageOptions,
	type ImageQuality,
	type ImageRatio,
	MODEL_KINDS,
	type ModelKind,
	type ProviderDescriptor,
	type ReferenceImages,
	type Speech
} from './types';

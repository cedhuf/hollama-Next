import { anthropic } from './anthropic';
import { compatible } from './compatible';
import { infomaniak } from './infomaniak';
import { ollama } from './ollama';
import { openai } from './openai';
import type {
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
 * Order matters once: it is the order the connection picker offers them in. The
 * compatible entry sits last because it is the answer for everything the others
 * are not, and a list that opens with "or something else" reads as a shrug.
 *
 * Adding one is adding a file and a line here. Nothing else in the application
 * names a provider, which is the property this folder exists to hold: if you can
 * find a provider's name anywhere outside its own file, that is a bug in the
 * arrangement rather than a detail.
 */
export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
	ollama,
	openai,
	anthropic,
	infomaniak,
	compatible
];

/** The door for anything nobody has described. Never a failure, always an answer. */
export const FALLBACK_DESCRIPTOR = compatible;

export function describeProvider(connectionType: string): ProviderDescriptor {
	return PROVIDER_DESCRIPTORS.find((p) => p.id === connectionType) ?? FALLBACK_DESCRIPTOR;
}

/**
 * What this provider accepts for this model.
 *
 * The model's own rule if one matches, and the provider's default otherwise.
 * Nothing at all when neither says, which is what leaves both fields out of the
 * request so the model uses its own default.
 */
export function imageOptionsFor(connectionType: string, model: string): ImageOptions {
	const descriptor = describeProvider(connectionType);
	const id = model.toLowerCase();
	const rule = descriptor.modelRules?.find((r: ModelRule) =>
		r.matches.some((needle) => id.includes(needle))
	);
	return rule?.images ?? descriptor.images ?? {};
}

/**
 * Reference pictures this model takes, if it takes any.
 *
 * The model's own rule first, the provider's answer second, and nothing when
 * neither says, which is what leaves the drop zone shut rather than offering a
 * control the endpoint would refuse.
 */
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
	IMAGE_QUALITIES,
	IMAGE_RATIOS,
	type ImageOptions,
	type ImageQuality,
	type ImageRatio,
	type ProviderDescriptor,
	type ReferenceImages
} from './types';

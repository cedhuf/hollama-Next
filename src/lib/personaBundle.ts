import { get } from 'svelte/store';

import { saveKnowledge, type Knowledge } from '$lib/knowledge';
import { knowledgeStore, settingsStore } from '$lib/localStorage';
import { bundleAuthored, contentDigest } from '$lib/personaDigest';
import {
	newPersona,
	pickAvatarColor,
	savePersona,
	type Persona,
	type PersonaParams,
	type PersonaSource
} from '$lib/personas';
import { generateRandomId } from '$lib/utils';

/**
 * What a persona looks like when it travels.
 *
 * Deliberately not a `Persona`: the stored record is an account of one install,
 * which means nothing to whoever receives it, and its `knowledgeIds` pointed at
 * documents the recipient did not have. A bundle carries what was written, its
 * documents included, by content.
 *
 * `modelName` is absent on purpose: a model named in a bundle is wrong for
 * almost everyone who reads it and stale for the rest. Installing uses your
 * default.
 */
export const PERSONA_BUNDLE_FORMAT = 'llooma.persona';
export const PERSONA_BUNDLE_VERSION = 1;

/**
 * A face, in one of three forms. A glyph is a name and a colour, drawn with the
 * app's own ink; an image is inlined as a data URI, the only way it survives the
 * trip; initials are a form rather than an absence.
 */
export type BundleAvatar =
	| { kind: 'glyph'; id: string; color: string }
	| { kind: 'image'; src: string; color?: string }
	| { kind: 'initials'; color: string };

export interface BundleKnowledge {
	name: string;
	content: string;
}

export interface PersonaBundle {
	format: typeof PERSONA_BUNDLE_FORMAT;
	version: number;
	/** Its identity in a catalogue, stable across revisions: this is what says "the Pixel you already installed". A bundle from a file may have none. */
	id?: string;
	/** Bumped whenever the bundle's contents change. */
	revision?: number;
	/** BCP 47, informational: the language the prompt is written in, not what the persona answers in. Models are not monolingual. */
	locale?: string;
	author?: string;
	license?: string;
	homepage?: string;
	persona: {
		name: string;
		tagline: string;
		avatar: BundleAvatar;
		systemPrompt: string;
		greeting?: string;
		params?: PersonaParams;
		webSearch?: boolean;
		suggestions?: string[];
		tags?: string[];
	};
	knowledge?: BundleKnowledge[];
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function strings(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.map((v) => str(v)).filter((v): v is string => !!v);
	return items.length ? items : undefined;
}

function parseAvatar(value: unknown): BundleAvatar | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;
	const color = str(o.color);
	if (o.kind === 'image') {
		const src = str(o.src);
		return src ? { kind: 'image', src, color } : undefined;
	}
	// A colour is the disc a glyph or a pair of initials is drawn on, so it is not
	// optional for either.
	if (!color) return undefined;
	if (o.kind === 'initials') return { kind: 'initials', color };
	const id = str(o.id);
	return id ? { kind: 'glyph', id, color } : undefined;
}

function parseParams(value: unknown): PersonaParams | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;
	const params: PersonaParams = {};
	if (typeof o.temperature === 'number') params.temperature = o.temperature;
	const stop = strings(o.stop);
	if (stop) params.stop = stop;
	return Object.keys(params).length ? params : undefined;
}

/** Everything a catalogue hands over goes through here, our own included: a file served from a URL is not more trustworthy for having been written by us. */
export function parsePersonaBundle(json: unknown): PersonaBundle | undefined {
	if (!json || typeof json !== 'object') return undefined;
	const o = json as Record<string, unknown>;
	if (o.format !== PERSONA_BUNDLE_FORMAT) return undefined;

	const p = o.persona;
	if (!p || typeof p !== 'object') return undefined;
	const persona = p as Record<string, unknown>;

	const name = str(persona.name);
	const avatar = parseAvatar(persona.avatar);
	if (!name || !avatar) return undefined;

	const knowledge = (Array.isArray(o.knowledge) ? o.knowledge : [])
		.map((item) => {
			if (!item || typeof item !== 'object') return undefined;
			const k = item as Record<string, unknown>;
			const kn = str(k.name);
			const content = str(k.content);
			return kn && content ? { name: kn, content } : undefined;
		})
		.filter((k): k is BundleKnowledge => !!k);

	return {
		format: PERSONA_BUNDLE_FORMAT,
		version: typeof o.version === 'number' ? o.version : PERSONA_BUNDLE_VERSION,
		id: str(o.id),
		revision: typeof o.revision === 'number' ? o.revision : undefined,
		locale: str(o.locale),
		author: str(o.author),
		license: str(o.license),
		homepage: str(o.homepage),
		persona: {
			name,
			tagline: str(persona.tagline) ?? '',
			avatar,
			systemPrompt: typeof persona.systemPrompt === 'string' ? persona.systemPrompt : '',
			greeting: str(persona.greeting),
			params: parseParams(persona.params),
			webSearch: persona.webSearch === true || undefined,
			suggestions: strings(persona.suggestions),
			tags: strings(persona.tags)
		},
		knowledge: knowledge.length ? knowledge : undefined
	};
}

/** The catalogue draws faces for personas nobody has installed, so this is needed before there is a `Persona`. One conversion, or the listing and the install disagree the day a fourth kind appears. */
export function avatarFields(
	avatar: BundleAvatar,
	name: string
): Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'> {
	return {
		avatarColor: avatar.color ?? pickAvatarColor(name),
		avatarGlyph: avatar.kind === 'glyph' ? avatar.id : undefined,
		avatarImage: avatar.kind === 'image' ? avatar.src : undefined
	};
}

/** The model an installed persona starts on: yours, whichever it is. */
function defaultModelName(): string {
	const settings = get(settingsStore);
	return settings.defaultModel || settings.models[0]?.name || '';
}

/**
 * A copy, not a link: the persona lands in your library with a fresh id and is
 * yours to edit. `source` only records where it came from. Its documents are
 * copied the same way.
 */
export function installPersonaBundle(bundle: PersonaBundle, source: PersonaSource): Persona {
	const knowledgeIds: string[] = [];
	for (const document of bundle.knowledge ?? []) {
		const item: Knowledge = {
			id: generateRandomId(),
			name: document.name,
			content: document.content,
			updatedAt: new Date().toISOString()
		};
		saveKnowledge(item);
		knowledgeIds.push(item.id);
	}

	const persona = personaFromBundle(bundle, source);
	if (knowledgeIds.length) persona.knowledgeIds = knowledgeIds;

	savePersona(persona);
	return persona;
}

/**
 * Take the published version over the one in the library: the authored fields
 * are replaced and everything of yours is kept, which is why this is not
 * `installPersonaBundle` under another name.
 *
 * Called from the update button, the reset button, and the automatic pass that
 * runs when the listing arrives.
 */
export function applyBundleToPersona(
	persona: Persona,
	bundle: PersonaBundle,
	source: PersonaSource
): Persona {
	const fresh = personaFromBundle(bundle, source);
	const updated: Persona = {
		...persona,
		name: fresh.name,
		tagline: fresh.tagline,
		avatarColor: fresh.avatarColor,
		avatarGlyph: fresh.avatarGlyph,
		avatarImage: fresh.avatarImage,
		systemPrompt: fresh.systemPrompt,
		greeting: fresh.greeting,
		params: fresh.params,
		webSearch: fresh.webSearch,
		suggestions: fresh.suggestions,
		tags: fresh.tags,
		source: fresh.source
	};
	savePersona(updated);
	return updated;
}

/**
 * The persona a bundle describes, without putting it anywhere: for an admin
 * offering one from the store to their instance without adding it to their own
 * library.
 *
 * No documents, because a shared persona's knowledge ids would name documents in
 * the admin's store, which mean nothing to anyone else.
 */
export function personaFromBundle(bundle: PersonaBundle, source: PersonaSource): Persona {
	const { avatar, ...authored } = bundle.persona;
	return {
		...newPersona(),
		...authored,
		...avatarFields(avatar, bundle.persona.name),
		modelName: defaultModelName(),
		// What it said on the way in, so "you edited this" and "the store moved on" can
		// be told apart. From the bundle rather than the persona just built, so the two
		// sides hash the same thing.
		source: { ...source, digest: source.digest ?? contentDigest(bundleAuthored(bundle)) }
	};
}

/** The attached documents are inlined here, which is the difference between sharing a persona and sharing a description of one. */
export function personaToBundle(persona: Persona): PersonaBundle {
	const documents = get(knowledgeStore) ?? [];
	const knowledge = (persona.knowledgeIds ?? [])
		.map((id) => documents.find((k) => k.id === id))
		.filter((k): k is Knowledge => !!k)
		.map(({ name, content }) => ({ name, content }));

	const avatar: BundleAvatar = persona.avatarImage
		? { kind: 'image', src: persona.avatarImage, color: persona.avatarColor }
		: persona.avatarGlyph
			? { kind: 'glyph', id: persona.avatarGlyph, color: persona.avatarColor }
			: { kind: 'initials', color: persona.avatarColor };

	return {
		format: PERSONA_BUNDLE_FORMAT,
		version: PERSONA_BUNDLE_VERSION,
		persona: {
			name: persona.name,
			tagline: persona.tagline,
			avatar,
			systemPrompt: persona.systemPrompt,
			greeting: persona.greeting,
			params: persona.params,
			webSearch: persona.webSearch,
			suggestions: persona.suggestions,
			tags: persona.tags
		},
		knowledge: knowledge.length ? knowledge : undefined
	};
}

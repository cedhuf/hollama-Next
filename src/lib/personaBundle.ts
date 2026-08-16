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
 * Deliberately not a `Persona`. The stored record is an account of one install:
 * its id, the conversation it is bound to, when you created it, whether an admin
 * shared it. None of that means anything to whoever receives it, and exporting it
 * was handing over somebody else's bookkeeping. Worse, `knowledgeIds` pointed at
 * documents the recipient did not have, so a persona with attached knowledge
 * arrived quietly broken.
 *
 * A bundle carries what was written and nothing else. Its documents are in it, by
 * content; the install side gives them fresh ids on the way in.
 *
 * `modelName` is absent on purpose. There are hundreds of models across nearly as
 * many providers, all naming them differently and all revising them constantly, so
 * a model named in a bundle is wrong for almost everyone who reads it and stale for
 * the rest. Installing uses your default, and the persona's own field is yours to
 * change afterwards.
 */
export const PERSONA_BUNDLE_FORMAT = 'llooma.persona';
export const PERSONA_BUNDLE_VERSION = 1;

/**
 * A face, in one of the three forms it can take.
 *
 * A glyph is a name and a colour, so it costs nothing to carry and is drawn with
 * the app's own ink. An image is whatever was uploaded, inlined as a data URI,
 * which is the only way it survives the trip. Initials are the fallback, and are
 * a form rather than an absence: a persona that has chosen to be a coloured disc
 * with two letters on it is saying so.
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
	/**
	 * Its identity in a catalogue, stable across revisions.
	 *
	 * Not a storage id: this is what says "the Pixel you already installed" when a
	 * newer Pixel appears. A bundle from a file may have none.
	 */
	id?: string;
	/** Bumped whenever the bundle's contents change. */
	revision?: number;
	/** BCP 47, as written. What the persona speaks, not what the reader does. */
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
	// optional for either: without it the persona has no face at all, only a shape.
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

/**
 * Read a bundle out of parsed JSON, or nothing.
 *
 * Everything a catalogue hands over goes through here, including our own: a file
 * served from a URL is not more trustworthy for having been written by us, and
 * one shape check is cheaper than the ten guards its absence would scatter
 * downstream. What comes out is a value of the declared type or `undefined`.
 */
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

/**
 * A bundle's avatar as the three fields a persona stores it in.
 *
 * The catalogue draws faces for personas nobody has installed, so this is needed
 * before there is a `Persona` to draw. One conversion rather than two, since the
 * listing and the install would otherwise disagree the day a fourth kind appears.
 */
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
 * Install a bundle as an editable persona of your own.
 *
 * A copy, not a link. The persona lands in your library with a fresh id and is
 * yours to edit or delete; `source` only records where it came from, so the
 * catalogue can show it as already installed and so a later revision can be
 * noticed. Its documents are copied in the same way, since a catalogue's
 * knowledge has no existence in your store until it does.
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
 * The persona a bundle describes, without putting it anywhere.
 *
 * For the one case that is not an install: an admin offering a persona from the
 * store to everyone on their instance, without adding it to their own library
 * first. Sharing and owning stopped being the same act, so building and saving
 * had to stop being the same call.
 *
 * No documents, because there is nowhere to put them: a shared persona's
 * knowledge ids would name documents in the admin's store, which mean nothing to
 * anyone else. Already true of everything shared from a library, and the reason
 * a bundle carries its documents in the first place.
 */
export function personaFromBundle(bundle: PersonaBundle, source: PersonaSource): Persona {
	const { avatar, ...authored } = bundle.persona;
	return {
		...newPersona(),
		...authored,
		...avatarFields(avatar, bundle.persona.name),
		modelName: defaultModelName(),
		// What it said on the way in, so "you edited this" and "the store moved on"
		// can be told apart later. Taken from the bundle rather than from the persona
		// just built, so the two sides hash the same thing.
		source: { ...source, digest: source.digest ?? contentDigest(bundleAuthored(bundle)) }
	};
}

/**
 * Turn one of your personas into a bundle, for the export action.
 *
 * The attached documents are resolved and inlined here, which is the whole
 * difference between sharing a persona and sharing a description of one.
 */
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

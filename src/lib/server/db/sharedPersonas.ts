import type { Persona } from '$lib/personas';

import { getConfig, setConfig } from './config';

/**
 * What an instance offers its users, which is two lists and not one.
 *
 * An admin shares in two different senses, and collapsing them was a mistake
 * worth spelling out. Sharing **their** persona means handing out a thing they
 * wrote: it lives in their library, they edit it, and what users get is a copy of
 * that. Sharing one **from the store** means saying "this instance also offers
 * Maïté", which is not a thing they wrote at all.
 *
 * Made into one list, the second became a copy of the store's persona sitting
 * beside the store's persona: the same face twice in the catalogue, one badged
 * official and one badged shared. And a copy freezes, so the store's next
 * revision never reached the people who took the admin's.
 *
 * So a relay is a reference. `sharedPersonas` holds the personas an admin
 * actually wrote; `sharedCatalogIds` holds the store ids they have chosen to
 * relay. Which also means an admin can install Maïté, rewrite half of her, and
 * share that as their own, with the store's original still listed beside it.
 *
 * Note what a shared persona does not carry: attached knowledge. The documents
 * live in the library it was shared from, and their ids mean nothing in anyone
 * else's. A relay has no such problem, since what users install is the bundle.
 */
const PERSONAS = 'sharedPersonas';
const CATALOG_IDS = 'sharedCatalogIds';

/** The personas an admin wrote and flagged `shared`, as a snapshot of their library. */
export function sharedPersonas(): Persona[] {
	try {
		const raw = getConfig(PERSONAS);
		return raw ? (JSON.parse(raw) as Persona[]) : [];
	} catch {
		return [];
	}
}

/**
 * The fields an admin actually shares, and no others.
 *
 * An allowlist rather than the object as it arrives, on the same principle the
 * export bundle already follows: this is the one place where one account's
 * persona is handed to every other, so anything that lands on `Persona` and is
 * not named here is a thing that would have been broadcast by accident. It used
 * to send the whole object, which meant the admin's conversation id travelled
 * with it.
 *
 * Memory is not on this list and could not be: it is not on the persona at all,
 * it is keyed on the pair of persona and account precisely so that sharing a
 * persona cannot share what it remembers.
 */
function shareable(persona: Persona): Persona {
	return {
		id: persona.id,
		name: persona.name,
		tagline: persona.tagline,
		avatarColor: persona.avatarColor,
		avatarImage: persona.avatarImage,
		avatarGlyph: persona.avatarGlyph,
		systemPrompt: persona.systemPrompt,
		greeting: persona.greeting,
		modelName: persona.modelName,
		language: persona.language,
		params: persona.params,
		webSearch: persona.webSearch,
		suggestions: persona.suggestions,
		tags: persona.tags,
		source: persona.source,
		shared: true,
		createdAt: persona.createdAt,
		updatedAt: persona.updatedAt
	};
}

export function setSharedPersonas(list: Persona[]): void {
	setConfig(PERSONAS, JSON.stringify(list.map(shareable)));
}

/** The store personas this instance relays, by their catalogue id. */
export function sharedCatalogIds(): string[] {
	try {
		const raw = getConfig(CATALOG_IDS);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}

export function relayCatalogPersona(id: string): void {
	const ids = sharedCatalogIds();
	if (!ids.includes(id)) setConfig(CATALOG_IDS, JSON.stringify([...ids, id]));
}

export function stopRelayingCatalogPersona(id: string): void {
	setConfig(CATALOG_IDS, JSON.stringify(sharedCatalogIds().filter((it) => it !== id)));
}

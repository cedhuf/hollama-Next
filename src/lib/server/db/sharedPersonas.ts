import type { Persona } from '$lib/personas';

import { getConfig, setConfig } from './config';

/**
 * What an instance offers its users, which is two lists and not one.
 *
 * Sharing **their** persona hands out a thing they wrote, and users get a copy.
 * Sharing one **from the store** says "this instance also offers Maite", which
 * is not a thing they wrote. As one list, the second became a copy sitting
 * beside the store's own, and a copy freezes.
 *
 * So a relay is a reference: `sharedPersonas` holds what an admin wrote,
 * `sharedCatalogIds` the store ids they relay.
 *
 * A shared persona does not carry its attached knowledge: the ids mean nothing
 * elsewhere. A relay has no such problem, since users install the bundle.
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
 * An allowlist rather than the object as it arrives: this is the one place where
 * one account's persona is handed to every other, so anything not named here
 * would have been broadcast by accident. It used to send the whole object, so
 * the admin's conversation id travelled with it.
 *
 * Memory is not on this list and could not be: it is keyed on the pair of
 * persona and account precisely so sharing cannot share what it remembers.
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

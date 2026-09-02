import { get } from 'svelte/store';

import { knowledgeStore, settingsStore } from '$lib/localStorage';
import { generateRandomId } from '$lib/utils';

export interface Knowledge {
	id: string;
	name: string;
	content: string;
	updatedAt: string;
	/** The collection it belongs to, if any. Loose knowledge has none. */
	collectionId?: string;
}

/**
 * A named group of knowledge. The two words were being used for the same thing:
 * a *knowledge* is one body of text, a *collection* is a set of them, and
 * attaching a collection attaches everything in it.
 *
 * They live in the user's settings rather than a store of their own: three
 * fields and a name, belonging to whoever owns the knowledge, so no new table,
 * endpoint or migration. An empty collection survives, which a folder implied by
 * its contents could not.
 */
export interface KnowledgeCollection {
	id: string;
	name: string;
}

/** Accepts a single object or an array, and tolerates a few common field names (name/title, content/text), so files from elsewhere still import. */
export function parseKnowledgeImport(data: unknown): Knowledge[] {
	const items = Array.isArray(data) ? data : [data];
	const out: Knowledge[] = [];
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const name = typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : '';
		const content =
			typeof o.content === 'string' ? o.content : typeof o.text === 'string' ? o.text : '';
		if (!name && !content) continue;
		out.push({
			id: generateRandomId(),
			name: name || 'Imported',
			content,
			updatedAt: new Date().toISOString()
		});
	}
	return out;
}

export const loadKnowledge = (id: string): Knowledge => {
	let knowledge: Knowledge | null = null;

	const currentKnowledges = get(knowledgeStore);

	if (currentKnowledges) {
		const existingKnowledge = currentKnowledges.find((s) => s.id === id);
		if (existingKnowledge) knowledge = existingKnowledge;
	}

	if (!knowledge) {
		knowledge = { id, name: '', content: '', updatedAt: new Date().toISOString() };
	}

	return knowledge;
};

export const saveKnowledge = (knowledge: Knowledge): void => {
	knowledgeStore.upsert(knowledge);
};

// --- collections -----------------------------------------------------------

export function createCollection(name: string): KnowledgeCollection {
	const collection: KnowledgeCollection = { id: generateRandomId(), name: name.trim() };
	settingsStore.update((settings) => ({
		...settings,
		knowledgeCollections: [...(settings.knowledgeCollections ?? []), collection]
	}));
	return collection;
}

export function renameCollection(id: string, name: string): void {
	settingsStore.update((settings) => ({
		...settings,
		knowledgeCollections: (settings.knowledgeCollections ?? []).map((collection) =>
			collection.id === id ? { ...collection, name: name.trim() } : collection
		)
	}));
}

/** A collection arranges knowledge, it does not own it: deleting the arrangement and taking the contents with it is the kind of surprise nobody forgives, so its knowledge becomes loose again. */
export function deleteCollection(id: string): void {
	settingsStore.update((settings) => ({
		...settings,
		knowledgeCollections: (settings.knowledgeCollections ?? []).filter(
			(collection) => collection.id !== id
		)
	}));

	for (const knowledge of get(knowledgeStore) ?? []) {
		if (knowledge.collectionId === id) {
			knowledgeStore.upsert({ ...knowledge, collectionId: undefined });
		}
	}
}

export function knowledgeInCollection(knowledge: Knowledge[], collectionId: string): Knowledge[] {
	return knowledge.filter((item) => item.collectionId === collectionId);
}

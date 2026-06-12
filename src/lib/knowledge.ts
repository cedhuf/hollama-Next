import { get } from 'svelte/store';

import { knowledgeStore, sortStore } from '$lib/localStorage';
import { generateRandomId } from '$lib/utils';

export interface Knowledge {
	id: string;
	name: string;
	content: string;
	updatedAt: string;
}

/**
 * Parse an imported JSON file into knowledge collections. Accepts a single
 * object or an array, and tolerates a few common field names (name/title,
 * content/text) so files from elsewhere still import.
 */
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

	// Retrieve the current knowledges
	const currentKnowledges = get(knowledgeStore);

	// Find the knowledge with the given id
	if (currentKnowledges) {
		const existingKnowledge = currentKnowledges.find((s) => s.id === id);
		if (existingKnowledge) knowledge = existingKnowledge;
	}

	if (!knowledge) {
		// Create a new knowledge
		knowledge = { id, name: '', content: '', updatedAt: new Date().toISOString() };
	}

	return knowledge;
};

export const saveKnowledge = (knowledge: Knowledge): void => {
	// Retrieve the current knowledges
	const currentKnowledges = get(knowledgeStore) || [];

	// Find the index of the knowledge with the same id, if it exists
	const existingIndex = currentKnowledges.findIndex((k) => k.id === knowledge.id);

	if (existingIndex !== -1) {
		// Update the existing knowledge
		currentKnowledges[existingIndex] = knowledge;
	} else {
		// Add the new knowledge if it doesn't exist
		currentKnowledges.push(knowledge);
	}

	// Sort the knowledges by updatedAt in descending order (most recent first)
	const sortedKnowledges = sortStore(currentKnowledges);

	// Update the store with the sorted knowledges
	knowledgeStore.set(sortedKnowledges);
};

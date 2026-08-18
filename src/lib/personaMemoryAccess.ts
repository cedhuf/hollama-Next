import { get } from 'svelte/store';

import type { MemoryAccess } from '$lib/chat/run/orchestrator';
import { personaMemoryStore } from '$lib/localStorage';
import {
	emptyMemory,
	forgetNote,
	setProfile,
	writeNote,
	type MemoryNote,
	type MemoryResult,
	type PersonaMemory
} from '$lib/personaMemory';
import { personasConfig } from '$lib/personasConfig';
import { generateRandomId } from '$lib/utils';

/**
 * The browser's half of a persona's memory.
 *
 * Reads and writes the same store the persona editor shows, so a note written
 * mid-conversation appears there without a reload, and a note deleted there is
 * gone from the next turn. One copy, two windows onto it.
 */
export function browserMemory(personaId: string | undefined): MemoryAccess | undefined {
	if (!personaId) return undefined;
	// An instance that has turned memory off has turned it off here too: the
	// tools are never offered and nothing is injected, which is the difference
	// between a feature being disabled and a feature being merely discouraged.
	if (!get(personasConfig).memoryEnabled) return undefined;

	const read = (): PersonaMemory =>
		get(personaMemoryStore).find((memory) => memory.id === personaId) ?? emptyMemory(personaId);

	const commit = (result: MemoryResult<PersonaMemory>): MemoryResult<PersonaMemory> => {
		if (result.ok) personaMemoryStore.upsert(result.value);
		return result;
	};

	return {
		read,
		note: (id: string): MemoryNote | null =>
			read().notes.find((candidate) => candidate.id === id) ?? null,
		setProfile: (text) => commit(setProfile(read(), text)),
		write: (input) => commit(writeNote(read(), input, generateRandomId)),
		forget: (id) => commit(forgetNote(read(), id))
	};
}

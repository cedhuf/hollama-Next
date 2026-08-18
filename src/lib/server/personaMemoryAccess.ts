import type { MemoryAccess } from '$lib/chat/run/orchestrator';
import {
	emptyMemory,
	forgetNote,
	setProfile,
	writeNote,
	type MemoryNote,
	type MemoryResult,
	type PersonaMemory
} from '$lib/personaMemory';
import { personaMemoryEnabled } from '$lib/server/db/config';
import { getPersonaMemory, savePersonaMemory } from '$lib/server/db/personaMemory';
import { generateRandomId } from '$lib/utils';

/**
 * The server's half of a persona's memory.
 *
 * Takes the account from the run's principal and never from its body. A client
 * that names a persona is naming one of its own; a client that could name whose
 * memory to read would be naming somebody else's, which for this collection is
 * the only failure that really matters.
 *
 * Read once per turn and written through on each call, rather than held and
 * flushed at the end: a turn that is cancelled mid-way has still remembered what
 * it decided to remember, and two turns cannot end by overwriting each other.
 */
export function serverMemory(
	userId: string | null,
	personaId: string | undefined
): MemoryAccess | undefined {
	if (!userId || !personaId) return undefined;
	if (!personaMemoryEnabled()) return undefined;

	const read = (): PersonaMemory => getPersonaMemory(userId, personaId) ?? emptyMemory(personaId);

	const commit = (result: MemoryResult<PersonaMemory>): MemoryResult<PersonaMemory> => {
		if (result.ok) savePersonaMemory(userId, result.value);
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

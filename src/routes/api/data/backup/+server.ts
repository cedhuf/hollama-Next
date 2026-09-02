import { error, json } from '@sveltejs/kit';

import { adoptLegacyNotes } from '$lib/chat/legacyNotes';
import { StorageKey } from '$lib/data/keys';
import { requireUser } from '$lib/server/api';
import {
	getKnowledge,
	getPersonas,
	getPlaybooks,
	getSessions,
	getSettings,
	replaceKnowledge,
	replacePersonas,
	replacePlaybooks,
	replaceSessions,
	replaceSettings
} from '$lib/server/db/collections';
import { getAllPersonaMemory, replacePersonaMemory } from '$lib/server/db/personaMemory';
import type { Settings } from '$lib/settings';

// Backups are keyed by StorageKey, so files stay portable between local and
// server mode. Servers are admin-managed in server mode and excluded here.

export async function GET(event) {
	const user = await requireUser(event);
	return json({
		[StorageKey.Sessions]: getSessions(user.id),
		[StorageKey.Knowledge]: getKnowledge(user.id),
		[StorageKey.Personas]: getPersonas(user.id),
		[StorageKey.Playbooks]: getPlaybooks(user.id),
		[StorageKey.PersonaMemory]: getAllPersonaMemory(user.id),
		[StorageKey.Preferences]: getSettings(user.id) ?? {}
	});
}

export async function POST(event) {
	const user = await requireUser(event);
	const backup = await event.request.json();
	if (typeof backup !== 'object' || backup === null) throw error(400, 'Expected an object');

	const sessions = backup[StorageKey.Sessions];
	const knowledge = backup[StorageKey.Knowledge];
	const personas = backup[StorageKey.Personas];
	const playbooks = backup[StorageKey.Playbooks];
	const personaMemory = backup[StorageKey.PersonaMemory];
	const settings = backup[StorageKey.Preferences] as Settings | undefined;

	// An exported file never ages out: one written before notes became a single
	// field is converted on the way in.
	if (Array.isArray(sessions)) {
		adoptLegacyNotes(sessions);
		replaceSessions(user.id, sessions);
	}
	if (Array.isArray(knowledge)) replaceKnowledge(user.id, knowledge);
	if (Array.isArray(personas)) replacePersonas(user.id, personas);
	if (Array.isArray(playbooks)) replacePlaybooks(user.id, playbooks);
	if (Array.isArray(personaMemory)) replacePersonaMemory(user.id, personaMemory);
	if (settings && typeof settings === 'object') replaceSettings(user.id, settings);

	return new Response(null, { status: 204 });
}

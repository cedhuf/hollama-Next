import { error, json } from '@sveltejs/kit';

import { readBackupEntry, StorageKey } from '$lib/data/keys';
import { requireUser } from '$lib/server/api';
import {
	getKnowledge,
	getPersonas,
	getSessions,
	getSettings,
	replaceKnowledge,
	replacePersonas,
	replaceSessions,
	replaceSettings
} from '$lib/server/db/collections';
import type { Settings } from '$lib/settings';

// Backups are keyed by StorageKey so files stay portable between local and
// server mode. Servers are admin-managed in server mode (step 5) and excluded
// here for now.

export async function GET(event) {
	const user = await requireUser(event);
	return json({
		[StorageKey.Sessions]: getSessions(user.id),
		[StorageKey.Knowledge]: getKnowledge(user.id),
		[StorageKey.Personas]: getPersonas(user.id),
		[StorageKey.Preferences]: getSettings(user.id) ?? {}
	});
}

export async function POST(event) {
	const user = await requireUser(event);
	const backup = await event.request.json();
	if (typeof backup !== 'object' || backup === null) throw error(400, 'Expected an object');

	// Read through the legacy keys too: a file exported before the rename to
	// Llooma has no way of knowing the app is now called something else.
	const sessions = readBackupEntry(backup, StorageKey.Sessions);
	const knowledge = readBackupEntry(backup, StorageKey.Knowledge);
	const personas = readBackupEntry(backup, StorageKey.Personas);
	const settings = readBackupEntry<Settings>(backup, StorageKey.Preferences);

	if (Array.isArray(sessions)) replaceSessions(user.id, sessions);
	if (Array.isArray(knowledge)) replaceKnowledge(user.id, knowledge);
	if (Array.isArray(personas)) replacePersonas(user.id, personas);
	if (settings && typeof settings === 'object') replaceSettings(user.id, settings);

	return new Response(null, { status: 204 });
}

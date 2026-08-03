import { error, json } from '@sveltejs/kit';

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

export async function GET(event) {
	const user = await requireUser(event);

	switch (event.params.collection) {
		case 'sessions':
			return json(getSessions(user.id));
		case 'knowledge':
			return json(getKnowledge(user.id));
		case 'personas':
			return json(getPersonas(user.id));
		case 'settings':
			return json(getSettings(user.id));
		default:
			throw error(404, 'Unknown collection');
	}
}

/**
 * Replace a whole collection.
 *
 * Restoring a backup, and nothing else — ordinary saves go through the per-item
 * routes, which don't make the cost of a write grow with the history and don't
 * let a client with a stale list delete what it never knew about.
 */
export async function PUT(event) {
	const user = await requireUser(event);
	const body = await event.request.json();

	switch (event.params.collection) {
		case 'sessions':
			if (!Array.isArray(body)) throw error(400, 'Expected an array');
			replaceSessions(user.id, body);
			break;
		case 'knowledge':
			if (!Array.isArray(body)) throw error(400, 'Expected an array');
			replaceKnowledge(user.id, body);
			break;
		case 'personas':
			if (!Array.isArray(body)) throw error(400, 'Expected an array');
			replacePersonas(user.id, body);
			break;
		case 'settings':
			if (typeof body !== 'object' || body === null) throw error(400, 'Expected an object');
			replaceSettings(user.id, body);
			break;
		default:
			throw error(404, 'Unknown collection');
	}

	return new Response(null, { status: 204 });
}

import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import {
	getKnowledge,
	getPersonas,
	getPlaybooks,
	getSessionSummaries,
	getSettings,
	replaceKnowledge,
	replacePersonas,
	replacePlaybooks,
	replaceSessions,
	replaceSettings
} from '$lib/server/db/collections';
import { getAllPersonaMemory, replacePersonaMemory } from '$lib/server/db/personaMemory';

export async function GET(event) {
	const user = await requireUser(event);

	switch (event.params.collection) {
		case 'sessions':
			return json(getSessionSummaries(user.id));
		case 'knowledge':
			return json(getKnowledge(user.id));
		case 'personas':
			return json(getPersonas(user.id));
		case 'playbooks':
			return json(getPlaybooks(user.id));
		case 'persona-memory':
			return json(getAllPersonaMemory(user.id));
		case 'settings':
			return json(getSettings(user.id));
		default:
			throw error(404, 'Unknown collection');
	}
}

/** Restoring a backup, and nothing else: ordinary saves go through the per-item routes, which do not make a write's cost grow with the history. */
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
		case 'playbooks':
			if (!Array.isArray(body)) throw error(400, 'Expected an array');
			replacePlaybooks(user.id, body);
			break;
		case 'persona-memory':
			if (!Array.isArray(body)) throw error(400, 'Expected an array');
			replacePersonaMemory(user.id, body);
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

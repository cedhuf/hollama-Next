import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { deleteItem, getItem, upsertItem } from '$lib/server/db/collections';
import {
	deletePersonaMemory,
	getPersonaMemory,
	savePersonaMemory
} from '$lib/server/db/personaMemory';

/** The collection-level PUT next door replaces everything the user has; these write and delete a single row. Both are scoped to the signed-in user. */
const TABLES = ['sessions', 'knowledge', 'personas', 'playbooks'] as const;
type Table = (typeof TABLES)[number];

/**
 * Persona memory is handled apart rather than added to `TABLES`: the generic
 * helpers key on a globally unique `id`, and a memory is keyed on the pair
 * (persona, account), because the same persona is remembered separately by
 * everyone who uses it. That key is the feature.
 */
const MEMORY = 'persona-memory';

function tableFor(collection: string | undefined): Table {
	const table = TABLES.find((candidate) => candidate === collection);
	if (!table) throw error(404, 'Unknown collection');
	return table;
}

export async function GET(event) {
	const user = await requireUser(event);
	if (event.params.collection === MEMORY) {
		const memory = getPersonaMemory(user.id, event.params.id);
		if (!memory) throw error(404, 'Not found');
		return json(memory);
	}
	const table = tableFor(event.params.collection);

	const item = getItem(table, user.id, event.params.id);
	if (!item) throw error(404, 'Not found');
	return json(item);
}

export async function PUT(event) {
	const user = await requireUser(event);
	const body = await event.request.json();

	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw error(400, 'Expected an object');
	}
	// The URL is the authority on which item this is; a body claiming another id
	// would write to a row the request did not name.
	if (body.id !== event.params.id) throw error(400, 'Body id does not match the URL');

	if (event.params.collection === MEMORY) {
		savePersonaMemory(user.id, body);
		return new Response(null, { status: 204 });
	}

	const table = tableFor(event.params.collection);
	upsertItem(table, user.id, body);
	return new Response(null, { status: 204 });
}

export async function DELETE(event) {
	const user = await requireUser(event);
	if (event.params.collection === MEMORY) {
		deletePersonaMemory(user.id, event.params.id);
		return new Response(null, { status: 204 });
	}
	const table = tableFor(event.params.collection);

	deleteItem(table, user.id, event.params.id);
	return new Response(null, { status: 204 });
}

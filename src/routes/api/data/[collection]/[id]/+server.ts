import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { deleteItem, getItem, upsertItem } from '$lib/server/db/collections';

/**
 * One item of a collection.
 *
 * The collection-level PUT next door replaces everything the user has; these
 * write and delete a single row, which is what a save and a delete actually are.
 * Both are scoped to the signed-in user, so an id from elsewhere reaches nothing.
 */
const TABLES = ['sessions', 'knowledge', 'personas', 'playbooks'] as const;
type Table = (typeof TABLES)[number];

function tableFor(collection: string | undefined): Table {
	const table = TABLES.find((candidate) => candidate === collection);
	if (!table) throw error(404, 'Unknown collection');
	return table;
}

export async function GET(event) {
	const user = await requireUser(event);
	const table = tableFor(event.params.collection);

	const item = getItem(table, user.id, event.params.id);
	if (!item) throw error(404, 'Not found');
	return json(item);
}

export async function PUT(event) {
	const user = await requireUser(event);
	const table = tableFor(event.params.collection);
	const body = await event.request.json();

	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw error(400, 'Expected an object');
	}
	// The URL is the authority on which item this is; a body claiming another id
	// would write to a row the request did not name.
	if (body.id !== event.params.id) throw error(400, 'Body id does not match the URL');

	upsertItem(table, user.id, body);
	return new Response(null, { status: 204 });
}

export async function DELETE(event) {
	const user = await requireUser(event);
	const table = tableFor(event.params.collection);

	deleteItem(table, user.id, event.params.id);
	return new Response(null, { status: 204 });
}

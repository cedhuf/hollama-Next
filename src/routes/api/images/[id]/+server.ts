import { error } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { deleteImage, getImage, setImageTitle } from '$lib/server/db/generatedImages';
import { removeImage } from '$lib/server/imageStore';

/** Name a picture. The only field of one that is ever edited after the fact. */
export async function PATCH(event) {
	const user = await requireUser(event);

	const image = getImage(user.id, event.params.id);
	if (!image) throw error(404, 'Not found');

	const body = await event.request.json().catch(() => null);
	const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 60) : '';
	if (!title) throw error(400, 'A title is required');

	setImageTitle(user.id, event.params.id, title);
	return new Response(null, { status: 204 });
}

/** The row goes first: a file that outlives a failed unlink is wasted disk, where the other order would leave a picture somebody thought they had deleted. */
export async function DELETE(event) {
	const user = await requireUser(event);

	const image = getImage(user.id, event.params.id);
	if (!image) throw error(404, 'Not found');

	deleteImage(user.id, event.params.id);
	removeImage(user.id, event.params.id, image.contentType);

	return new Response(null, { status: 204 });
}

import { error } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { deleteImage, getImage } from '$lib/server/db/generatedImages';
import { removeImage } from '$lib/server/imageStore';

/**
 * Forget one picture, bytes and all.
 *
 * The row goes first: it is what makes an image exist, so a file that outlives a
 * failed unlink is wasted disk rather than a picture somebody thought they had
 * deleted. The other order would be the one that lies.
 */
export async function DELETE(event) {
	const user = await requireUser(event);

	const image = getImage(user.id, event.params.id);
	if (!image) throw error(404, 'Not found');

	deleteImage(user.id, event.params.id);
	removeImage(user.id, event.params.id, image.contentType);

	return new Response(null, { status: 204 });
}

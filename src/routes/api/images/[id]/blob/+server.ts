import { error } from '@sveltejs/kit';

import { downloadName, IMAGE_TYPES } from '$lib/generatedImages';
import { requireUser } from '$lib/server/api';
import { getImage } from '$lib/server/db/generatedImages';
import { readImage } from '$lib/server/imageStore';

/**
 * The picture itself.
 *
 * Behind the session and scoped to the owner: an id is not a permission. A
 * missing row and somebody else's row answer the same 404, because the
 * difference between them is information about somebody else.
 *
 * The type is served from the stored value, decided from the bytes when it
 * arrived and never from what the provider said, with `nosniff` on top. Both
 * matter because this comes back from the app's own origin.
 */
export async function GET(event) {
	const user = await requireUser(event);

	const image = getImage(user.id, event.params.id);
	if (!image) throw error(404, 'Not found');

	// Belt and braces: a row is only written with a type off the allowlist, so one
	// carrying anything else did not come from this app.
	if (!IMAGE_TYPES[image.contentType]) throw error(404, 'Not found');

	const bytes = readImage(user.id, image.id, image.contentType);
	if (!bytes) throw error(404, 'Not found');

	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': image.contentType,
			'content-length': String(bytes.length),
			'x-content-type-options': 'nosniff',
			// Ids are unique and the bytes behind one never change, so this is fetched once
			// per image per browser.
			'cache-control': 'private, max-age=31536000, immutable',
			'content-disposition': `inline; filename="${downloadName(image)}"`
		}
	});
}

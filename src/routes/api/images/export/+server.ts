import { downloadZip } from 'client-zip';

import { downloadName, extensionFor } from '$lib/generatedImages';
import { requireUser } from '$lib/server/api';
import { listImages } from '$lib/server/db/generatedImages';
import { readImage } from '$lib/server/imageStore';

/**
 * Everything this account has drawn, as one archive.
 *
 * Streamed rather than assembled: an account may hold two gigabytes, and a route
 * that held all of it before answering would fall over on the one export that
 * matters. Pictures are read, written out and dropped one at a time.
 *
 * Nothing is compressed, and `client-zip` stores by default, which is right
 * here: every file is already a compressed format.
 */
export async function GET(event) {
	const user = await requireUser(event);
	const images = listImages(user.id);

	/** The manifest first, because it is the part that cannot be recovered: a folder of pictures is a folder of pictures, and what made each one only exists in the app. */
	const manifest = images.map((image) => ({
		file: fileNameFor(image.id, image),
		title: image.title,
		prompt: image.prompt,
		sentPrompt: image.sentPrompt,
		negativePrompt: image.negativePrompt,
		model: image.model,
		size: image.size,
		seconds: image.seconds,
		cost: image.cost,
		currency: image.currency,
		createdAt: image.createdAt
	}));

	async function* entries() {
		yield {
			name: 'images.json',
			lastModified: new Date(),
			input: JSON.stringify(manifest, null, '\t')
		};

		for (const image of images) {
			const bytes = readImage(user.id, image.id, image.contentType);
			// A row can outlive its file. Skipping one beats refusing the whole archive to
			// somebody trying to get the rest out.
			if (!bytes) continue;
			yield {
				name: fileNameFor(image.id, image),
				lastModified: new Date(image.createdAt),
				input: new Uint8Array(bytes)
			};
		}
	}

	const stamp = new Date().toISOString().slice(0, 10);
	const response = downloadZip(entries(), { buffersAreUTF8: true });

	return new Response(response.body, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="llooma-images-${stamp}.zip"`,
			// Nothing about this is cacheable: a snapshot of a list that changes every time
			// somebody draws.
			'cache-control': 'no-store'
		}
	});
}

/**
 * A name inside the archive: readable, and unique. The title, or the prompt
 * where there is none, is what makes it recognisable and is the one piece of
 * metadata every desktop search indexes. The id makes it unique, since two
 * pictures of the same prompt are the commonest thing in a gallery.
 */
function fileNameFor(
	id: string,
	image: { title?: string; prompt: string; contentType: string }
): string {
	const stem = downloadName(image).replace(/\.[^.]+$/, '');
	return `${stem}-${id.slice(0, 8)}.${extensionFor(image.contentType)}`;
}

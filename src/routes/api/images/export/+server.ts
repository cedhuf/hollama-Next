import { downloadZip } from 'client-zip';

import { downloadName, extensionFor } from '$lib/generatedImages';
import { requireUser } from '$lib/server/api';
import { listImages } from '$lib/server/db/generatedImages';
import { readImage } from '$lib/server/imageStore';

/**
 * Everything this account has drawn, as one archive.
 *
 * Streamed rather than assembled: an account may hold two gigabytes, and a route
 * that had to hold all of it before answering would be a route that falls over
 * on the one export that matters. The generator is pulled entry by entry, so a
 * picture is read off the disk, written out and dropped before the next one is
 * touched.
 *
 * Nothing is compressed, and `client-zip` stores by default, which is the right
 * behaviour here: every file in this archive is already a compressed format, and
 * deflating a PNG spends real time to make it marginally bigger.
 */
export async function GET(event) {
	const user = await requireUser(event);
	const images = listImages(user.id);

	/**
	 * The manifest, first, because it is the part that cannot be recovered.
	 *
	 * A folder of pictures is a folder of pictures; what made each one — the
	 * prompt, the model, what it cost — only exists in the app until it is written
	 * down beside them.
	 */
	const manifest = images.map((image) => ({
		file: fileNameFor(image.id, image),
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
			// A row can outlive its file. Skipping one is a better answer than
			// refusing the whole archive to somebody trying to get the rest out.
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
			// Nothing about this is cacheable: it is a snapshot of a list that
			// changes every time somebody draws.
			'cache-control': 'no-store'
		}
	});
}

/**
 * A name inside the archive: readable, and unique.
 *
 * The prompt makes it recognisable, which is the whole reason not to number them
 * one to four hundred. The id makes it unique, because two pictures of the same
 * prompt are the commonest thing in a gallery and a zip with two identical names
 * in it is a zip that unpacks to one file.
 */
function fileNameFor(id: string, image: { prompt: string; contentType: string }): string {
	const stem = downloadName(image).replace(/\.[^.]+$/, '');
	return `${stem}-${id.slice(0, 8)}.${extensionFor(image.contentType)}`;
}

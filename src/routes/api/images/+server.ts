import { error, json } from '@sveltejs/kit';

import { IMAGE_QUALITIES, IMAGE_RATIOS } from '$lib/connections';
import { requireServer, requireUser } from '$lib/server/api';
import { listImages } from '$lib/server/db/generatedImages';
import { generateImages, ImageError } from '$lib/server/imageGeneration';

/** Everything this account has drawn, newest first. Metadata only. */
export async function GET(event) {
	const user = await requireUser(event);
	return json({ images: listImages(user.id) });
}

/** Long, and deliberately not a job queue: the work happens here and what it produces is written to the gallery before this answers, so a tab that closes loses the response and nothing else. */
export async function POST(event) {
	const user = await requireUser(event);

	const body = await event.request.json().catch(() => null);
	if (!body?.serverId || !body?.model || typeof body?.prompt !== 'string') {
		throw error(400, 'serverId, model and prompt are required');
	}

	const server = requireServer(user.id, body.serverId);

	try {
		const images = await generateImages(user.id, user.role === 'admin', server, {
			prompt: body.prompt,
			sentPrompt: typeof body.sentPrompt === 'string' ? body.sentPrompt : undefined,
			negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt : undefined,
			model: body.model,
			// The app's own words, and only the ones it knows: anything else is dropped
			// rather than passed through to a provider that would refuse it.
			ratio: IMAGE_RATIOS.includes(body.ratio) ? body.ratio : undefined,
			quality: IMAGE_QUALITIES.includes(body.quality) ? body.quality : undefined,
			style: typeof body.style === 'string' ? body.style : undefined,
			n: Number(body.n) || 1,
			// Data URLs, kept as strings here: whether they are pictures at all is read from
			// their bytes further in, which is the only place that answer can be trusted.
			references: Array.isArray(body.references)
				? body.references.filter((item: unknown): item is string => typeof item === 'string')
				: undefined
		});
		return json({ images }, { status: 201 });
	} catch (e) {
		if (e instanceof ImageError) throw error(e.status, e.message);
		throw e;
	}
}

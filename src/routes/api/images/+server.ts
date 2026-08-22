import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { imagesEnabled } from '$lib/server/db/config';
import { listImages } from '$lib/server/db/generatedImages';
import { getServer } from '$lib/server/db/servers';
import { generateImages, ImageError } from '$lib/server/imageGeneration';

/** Everything this account has drawn, newest first. Metadata only. */
export async function GET(event) {
	const user = await requireUser(event);
	return json({ enabled: imagesEnabled(), images: listImages(user.id) });
}

/**
 * Draw something.
 *
 * Long, and deliberately not a job queue. The work happens here, in the server,
 * and what it produces is written to the gallery before this answers — so a tab
 * that closes halfway through loses the response and nothing else. The picture
 * is on the next page load. A queue would buy a progress bar, and cost a whole
 * second lifecycle to keep correct.
 */
export async function POST(event) {
	const user = await requireUser(event);
	if (!imagesEnabled()) throw error(403, 'Image generation is disabled on this instance');

	const body = await event.request.json().catch(() => null);
	if (!body?.serverId || !body?.model || typeof body?.prompt !== 'string') {
		throw error(400, 'serverId, model and prompt are required');
	}

	const server = getServer(body.serverId);
	if (!server) throw error(404, 'Server not found');
	// The same two questions the relay asks: is this connection yours to use, and
	// is it switched on.
	if (server.owner_user_id !== null && server.owner_user_id !== user.id) {
		throw error(403, 'Forbidden');
	}
	if (!server.is_enabled) throw error(403, 'Server is disabled');

	try {
		const images = await generateImages(user.id, user.role === 'admin', server, {
			prompt: body.prompt,
			sentPrompt: typeof body.sentPrompt === 'string' ? body.sentPrompt : undefined,
			negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt : undefined,
			model: body.model,
			size: typeof body.size === 'string' ? body.size : undefined,
			style: typeof body.style === 'string' ? body.style : undefined,
			n: Number(body.n) || 1
		});
		return json({ images }, { status: 201 });
	} catch (e) {
		if (e instanceof ImageError) throw error(e.status, e.message);
		throw e;
	}
}

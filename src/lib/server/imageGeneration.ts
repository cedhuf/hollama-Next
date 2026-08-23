import { randomUUID } from 'node:crypto';

import { refusal } from '$lib/chat/refusal';
import {
	hasPriceFigure,
	imageBaseUrl,
	imageOptionsFor,
	modelKind,
	qualityFor,
	referencesFor,
	sizeFor,
	type ImageOptions,
	type ImageQuality,
	type ImageRatio,
	type ReferenceImages
} from '$lib/connections';
import {
	hasTrigger,
	IMAGE_INPUT_TYPES,
	IMAGE_LIMITS,
	IMAGE_TYPES,
	sniffImageType,
	type GeneratedImage
} from '$lib/generatedImages';
import { bytesHeld, insertImage } from '$lib/server/db/generatedImages';
import {
	getModelKinds,
	getModelPricing,
	getServerApiKey,
	getSharedModels,
	type ServerRow
} from '$lib/server/db/servers';
import { creditLimitFor, isOverLimit } from '$lib/server/db/usage';
import { writeImage } from '$lib/server/imageStore';
import { recordRunUsage } from '$lib/server/usageMeter';
import { costOf } from '$lib/usageCounts';

/**
 * Asking a provider for a picture, and keeping what comes back.
 *
 * Server-side and only server-side, which is not an implementation detail. The
 * key is here, the admin's rules are here, and the picture that arrives has to
 * be looked at before it is stored. None of which a browser can be asked to do
 * on its own behalf.
 *
 * It is also what makes a generation survive the tab that started it. The
 * request the browser makes is long, but nothing depends on the browser still
 * being there when it ends: the answer is written to the gallery, and the
 * gallery is what the page reads. Close the tab halfway through and the picture
 * is waiting on the next load.
 */

export class ImageError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

export interface ImageRequest {
	prompt: string;
	/** What the prompt was rewritten to, when it was. The original is still kept. */
	sentPrompt?: string;
	negativePrompt?: string;
	model: string;
	/** The app's words; this module turns them into whatever the provider calls them. */
	ratio?: ImageRatio;
	quality?: ImageQuality;
	style?: string;
	n?: number;
	/**
	 * Pictures to work from, as data URLs, when the model takes any.
	 *
	 * Never stored. They are read once into the request that uses them and then
	 * dropped: a reference is a thing you brought, not a thing the app keeps, and
	 * keeping it would mean a second quota and a second thing to delete.
	 */
	references?: string[];
}

/**
 * Vet a request against what the administrator actually allows.
 *
 * The same question the relay asks of a chat turn, asked here because this path
 * does not go through the relay: the server holds the connection itself, and a
 * rule that only lived in the proxy would be a rule this route quietly dropped.
 */
function vet(server: ServerRow, isAdmin: boolean, model: string): void {
	if (modelKind({ modelKinds: getModelKinds(server.id) }, model) !== 'image') {
		throw new ImageError(400, `"${model}" is not an image model on this connection`);
	}
	// Admins set these rules, and a connection somebody owns is their own business.
	if (isAdmin || server.owner_user_id !== null) return;
	if (!getSharedModels(server.id).includes(model)) {
		throw new ImageError(403, `Model "${model}" is not shared on this server`);
	}
}

/**
 * The body every provider the app draws with understands.
 *
 * Shape and quality are translated here and left out entirely when there is no
 * translation, which is the safe answer: every endpoint has a default, and a
 * field it does not recognise is a refusal arriving after the wait rather than
 * before it.
 */
function requestBody(input: ImageRequest, count: number, options: ImageOptions) {
	const size = input.ratio ? sizeFor(options, input.ratio) : undefined;
	const quality = input.quality ? qualityFor(options, input.quality) : undefined;

	return {
		model: input.model,
		prompt: input.sentPrompt?.trim() || input.prompt,
		n: count,
		// Base64, always. A URL would mean fetching a host the provider named,
		// which is a request the app makes on its own network from its own
		// address: the shape of every SSRF there has ever been.
		response_format: 'b64_json',
		...(input.negativePrompt?.trim() ? { negative_prompt: input.negativePrompt.trim() } : {}),
		...(size ? { size } : {}),
		...(quality ? { quality } : {}),
		...(input.style ? { style: input.style } : {})
	};
}

/**
 * A reference picture, read out of the data URL the browser sent.
 *
 * Inspected exactly like a picture coming back from a provider, and for the same
 * reason: the type is read from the bytes, never from what the sender labelled
 * them. The list is the input one rather than the one the app serves back, which
 * is narrower: a WebP passes every check here and is then refused by the
 * endpoint, so refusing it before the upload is the honest place.
 */
function decodeReference(dataUrl: string): { bytes: Buffer; contentType: string } {
	const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
	const bytes = Buffer.from(base64, 'base64');
	if (!bytes.length) throw new ImageError(400, 'A reference image is empty');
	if (bytes.length > IMAGE_LIMITS.maxBytes) {
		throw new ImageError(413, 'A reference image is too large');
	}

	const contentType = sniffImageType(bytes);
	if (!contentType || !IMAGE_INPUT_TYPES.includes(contentType)) {
		throw new ImageError(415, 'Reference images must be PNG or JPEG');
	}
	return { bytes, contentType };
}

/**
 * The request that carries reference pictures.
 *
 * Multipart, because that is what both endpoints want, their specifications
 * disagree, and the endpoints do not. The same fields as a plain drawing, so
 * there is one answer to "what does the app send" rather than two, plus the
 * pictures under whatever this provider calls that field.
 */
function referenceRequest(
	accepts: ReferenceImages,
	input: ImageRequest,
	count: number,
	options: ImageOptions,
	pictures: { bytes: Buffer; contentType: string }[]
): FormData {
	const form = new FormData();
	const body = requestBody(input, count, options);

	for (const [key, value] of Object.entries(body)) {
		// The model only where one is expected: a route of its own is the model, and
		// naming a second is a field it refuses.
		if (key === 'model' && !accepts.sendsModel) continue;
		if (value !== undefined) form.append(key, String(value));
	}

	for (const [index, picture] of pictures.entries()) {
		form.append(
			accepts.field,
			new Blob([new Uint8Array(picture.bytes)], { type: picture.contentType }),
			`reference-${index + 1}.${IMAGE_TYPES[picture.contentType]}`
		);
	}

	// Left to fetch, which appends the multipart boundary it generated.
	return form;
}

/**
 * Draw, and keep what comes back.
 *
 * Returns the rows as they were stored. Throws `ImageError` for anything the
 * caller did wrong and for anything the provider refused, so the route stays a
 * translation of errors into statuses and holds no rules of its own.
 */
export async function generateImages(
	userId: string,
	isAdmin: boolean,
	server: ServerRow,
	input: ImageRequest
): Promise<GeneratedImage[]> {
	const prompt = input.prompt.trim();
	if (!prompt) throw new ImageError(400, 'A prompt is required');
	if (prompt.length > IMAGE_LIMITS.prompt) throw new ImageError(400, 'Prompt is too long');
	if ((input.negativePrompt?.length ?? 0) > IMAGE_LIMITS.negativePrompt) {
		throw new ImageError(400, 'Negative prompt is too long');
	}

	vet(server, isAdmin, input.model);

	const count = Math.min(Math.max(Math.floor(input.n ?? 1), 1), IMAGE_LIMITS.maxPerRequest);

	// Asked before the work starts, never during it, which is the same rule the
	// credit limit follows: whatever is already running always finishes.
	if (bytesHeld(userId) >= IMAGE_LIMITS.maxBytesPerUser) {
		throw new ImageError(413, 'Image storage is full; delete some images first');
	}

	/**
	 * The allowance, asked here because this path does not go through the relay.
	 *
	 * The relay learned to meter and refuse drawings, but only the ones a browser
	 * sends through it. This route holds the provider connection itself, so a
	 * limit enforced only there would be a limit that images walked straight past
	 *, which is the hole that was just closed, reopened one level up.
	 *
	 * Only on the instance's own connections. A personal one is somebody's own key
	 * and their own bill.
	 */
	const price = getModelPricing(server.id)[input.model];
	if (server.owner_user_id === null && creditLimitFor(userId) > 0) {
		if (isOverLimit(userId)) throw new ImageError(402, refusal('credit-limit'));
		// Unpriced is not counted, and not counted would mean not limited. One model
		// nobody got round to pricing is an unlimited allowance for everybody.
		if (!hasPriceFigure(price)) throw new ImageError(402, refusal('unpriced-model', input.model));
	}

	const base = imageBaseUrl({
		baseUrl: server.base_url,
		imageBaseUrl: server.image_base_url ?? undefined
	}).replace(/\/+$/, '');

	const options = imageOptionsFor(server.connection_type, input.model);
	const key = getServerApiKey(server);

	/**
	 * Where this request goes, and in what shape.
	 *
	 * With no reference picture it is the drawing endpoint, unchanged. With one it
	 * is whatever the descriptor says this model takes them on, and a model that
	 * says nothing takes none, so the pictures are refused here rather than sent
	 * to an endpoint that would ignore them and bill for the ignoring.
	 */
	const references = input.references ?? [];
	const accepts = references.length
		? referencesFor(server.connection_type, input.model)
		: undefined;
	if (references.length && !accepts) {
		throw new ImageError(400, `"${input.model}" does not take reference images`);
	}
	if (accepts && references.length > accepts.max) {
		throw new ImageError(400, `At most ${accepts.max} reference images`);
	}
	// Asked here rather than only in the composer, and before the request goes out:
	// the endpoint refuses this after the wait and after the meter has run, and a
	// missing word is not worth a minute of somebody's allowance.
	if (accepts?.trigger && !hasTrigger(input.sentPrompt?.trim() || prompt, accepts.trigger)) {
		throw new ImageError(400, `The prompt must contain the word "${accepts.trigger}"`);
	}

	const pictures = references.map(decodeReference);
	const target = accepts
		? accepts.url({ baseUrl: server.base_url, imageBaseUrl: base })
		: `${base}/images/generations`;
	const request: { headers: Record<string, string>; body: BodyInit } = accepts
		? { headers: {}, body: referenceRequest(accepts, input, count, options, pictures) }
		: {
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(requestBody(input, count, options))
			};

	const startedAt = Date.now();

	let response: Response;
	try {
		response = await fetch(target, {
			method: 'POST',
			headers: {
				...request.headers,
				...(key ? { authorization: `Bearer ${key}` } : {})
			},
			body: request.body
		});
	} catch {
		throw new ImageError(502, 'The image provider could not be reached');
	}

	if (!response.ok) {
		// The provider's own words, trimmed. Whoever typed the prompt is the person
		// who can act on "prompt too long" or "model is loading", and hiding it
		// behind a generic failure sends them to their administrator for nothing.
		const detail = (await response.text().catch(() => '')).slice(0, 500);
		throw new ImageError(
			response.status === 401 ? 502 : response.status,
			detail || 'Generation failed'
		);
	}

	const seconds = (Date.now() - startedAt) / 1000;
	const payload = (await response.json().catch(() => null)) as {
		data?: { b64_json?: string }[];
	} | null;

	const encoded = (payload?.data ?? []).map((item) => item?.b64_json).filter(Boolean) as string[];
	if (!encoded.length) throw new ImageError(502, 'The provider returned no image');

	const now = new Date().toISOString();

	/**
	 * Everything that survived inspection, before anything is written.
	 *
	 * Nothing is stored inside the loop, because what each picture costs is a
	 * share of what the request cost, and that cannot be divided until it is known
	 * how many of them there are. Vetting first also means a batch never lands
	 * half-written.
	 */
	const usable: { bytes: Buffer; contentType: string }[] = [];
	for (const b64 of encoded) {
		const bytes = Buffer.from(b64, 'base64');
		if (!bytes.length || bytes.length > IMAGE_LIMITS.maxBytes) continue;

		// From the bytes, never from what the provider called them. This is served
		// back from the app's own origin, so an SVG accepted here would be script
		// running as the app.
		const contentType = sniffImageType(bytes);
		if (!contentType || !IMAGE_TYPES[contentType]) continue;

		usable.push({ bytes, contentType });
	}

	if (!usable.length) throw new ImageError(502, 'The provider returned nothing usable');

	/**
	 * What the request cost, and each picture's share of it.
	 *
	 * The request is what the provider bills: one stretch of time, or a count of
	 * images. Dividing it is only for the gallery, so a row can answer "what did
	 * this one cost" without implying it was charged four times. `undefined` stays
	 * undefined all the way down: an unpriced model is not free.
	 */
	const total = costOf({ input: 0, output: 0, images: usable.length, seconds }, price);
	const share = total === undefined ? undefined : total / usable.length;

	const stored: GeneratedImage[] = [];
	for (const { bytes, contentType } of usable) {
		const image: GeneratedImage = {
			id: randomUUID(),
			prompt,
			sentPrompt: input.sentPrompt?.trim() || undefined,
			negativePrompt: input.negativePrompt?.trim() || undefined,
			serverId: server.id,
			model: input.model,
			// What was actually sent, and what was asked for. The first is a fact about
			// this picture, the second is what "another like this" can be built from.
			size: input.ratio ? sizeFor(options, input.ratio) : undefined,
			ratio: input.ratio,
			quality: input.quality,
			style: input.style,
			contentType,
			bytes: bytes.length,
			seconds: seconds / usable.length,
			cost: share,
			currency: share === undefined ? undefined : (price?.currency ?? 'USD'),
			createdAt: now,
			updatedAt: now
		};

		writeImage(userId, image.id, contentType, bytes);
		insertImage(userId, image);
		stored.push(image);
	}

	// One reading for the whole request, priced the way a turn is. A personal
	// connection is somebody's own key and own bill, which `recordRunUsage`
	// already knows and refuses to count.
	recordRunUsage(userId, server.id, input.model, {
		input: 0,
		output: 0,
		images: stored.length,
		seconds
	});

	return stored;
}

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
	type ServerRow
} from '$lib/server/db/servers';
import { creditLimitFor, isOverLimit } from '$lib/server/db/usage';
import { ImageStoreError, writeImage } from '$lib/server/imageStore';
import { isModelShared } from '$lib/server/llmPolicy';
import { recordRunUsage } from '$lib/server/usageMeter';
import { costOf } from '$lib/usageCounts';

/**
 * Asking a provider for a picture, and keeping what comes back.
 *
 * Server-side only: the key is here, the admin's rules are here, and what
 * arrives has to be inspected before it is stored.
 *
 * It is also what makes a generation survive the tab that started it. The
 * answer is written to the gallery, and the gallery is what the page reads.
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
	/** Never stored: read once into the request that uses them and dropped. A reference is a thing you brought, not a thing the app keeps. */
	references?: string[];
}

/** The same question the relay asks of a chat turn, asked here because this path holds the connection itself and does not go through the relay. */
function vet(server: ServerRow, isAdmin: boolean, model: string): void {
	if (modelKind({ modelKinds: getModelKinds(server.id) }, model) !== 'image') {
		throw new ImageError(400, `"${model}" is not an image model on this connection`);
	}
	if (!isModelShared(server, isAdmin, model)) {
		throw new ImageError(403, `Model "${model}" is not shared on this server`);
	}
}

/** Shape and quality are translated here and left out where there is no translation: every endpoint has a default, and an unrecognised field is a refusal after the wait. */
function requestBody(input: ImageRequest, count: number, options: ImageOptions) {
	const size = input.ratio ? sizeFor(options, input.ratio) : undefined;
	const quality = input.quality ? qualityFor(options, input.quality) : undefined;

	return {
		model: input.model,
		prompt: input.sentPrompt?.trim() || input.prompt,
		n: count,
		// Base64, always. A URL would mean fetching a host the provider named, from the
		// app's own network and address: the shape of every SSRF there has ever been.
		response_format: 'b64_json',
		...(input.negativePrompt?.trim() ? { negative_prompt: input.negativePrompt.trim() } : {}),
		...(size ? { size } : {}),
		...(quality ? { quality } : {}),
		...(input.style ? { style: input.style } : {})
	};
}

/**
 * Inspected exactly like a picture coming back: the type is read from the bytes,
 * never from what the sender labelled them. The input list is narrower than the
 * one the app serves, so a WebP is refused before the upload rather than by the
 * endpoint.
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

/** Multipart, because that is what both endpoints want even though their specifications disagree. The same fields as a plain drawing, plus the pictures under whatever this provider calls that field. */
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

/** Returns the rows as stored. Throws `ImageError` for anything the caller did wrong and anything the provider refused, so the route holds no rules of its own. */
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

	// Asked before the work starts, never during it, like the credit limit:
	// whatever is already running always finishes.
	if (bytesHeld(userId) >= IMAGE_LIMITS.maxBytesPerUser) {
		throw new ImageError(413, 'Image storage is full; delete some images first');
	}

	/**
	 * The allowance, asked here because this path does not go through the relay: the
	 * relay meters what a browser sends through it, and this route holds the
	 * provider connection itself.
	 *
	 * Only on the instance's own connections. A personal one is somebody's own key
	 * and their own bill.
	 */
	const price = getModelPricing(server.id)[input.model];
	if (server.owner_user_id === null && creditLimitFor(userId) > 0) {
		if (isOverLimit(userId)) throw new ImageError(402, refusal('credit-limit'));
		// Unpriced is not counted, and not counted would mean not limited: one model
		// nobody priced is an unlimited allowance for everybody.
		if (!hasPriceFigure(price)) throw new ImageError(402, refusal('unpriced-model', input.model));
	}

	const base = imageBaseUrl({
		baseUrl: server.base_url,
		imageBaseUrl: server.image_base_url ?? undefined
	}).replace(/\/+$/, '');

	const options = imageOptionsFor(server.connection_type, input.model);
	const key = getServerApiKey(server);

	/** With no reference it is the drawing endpoint. With one it is whatever the descriptor says this model takes them on, and a model that says nothing takes none. */
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
	// Before the request goes out: the endpoint refuses this after the wait and
	// after the meter has run, and a missing word is not worth a minute of
	// somebody's allowance.
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
		// The provider's own words, trimmed. Whoever typed the prompt can act on
		// "prompt too long"; a generic failure sends them to their administrator.
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

	/** Nothing is stored inside the loop: what each picture costs is a share of what the request cost, which cannot be divided until the count is known. Vetting first also means a batch never lands half-written. */
	const usable: { bytes: Buffer; contentType: string }[] = [];
	for (const b64 of encoded) {
		const bytes = Buffer.from(b64, 'base64');
		if (!bytes.length || bytes.length > IMAGE_LIMITS.maxBytes) continue;

		// From the bytes, never from what the provider called them: this is served back
		// from the app's own origin, so an SVG accepted here would be script running as
		// the app.
		const contentType = sniffImageType(bytes);
		if (!contentType || !IMAGE_TYPES[contentType]) continue;

		usable.push({ bytes, contentType });
	}

	if (!usable.length) throw new ImageError(502, 'The provider returned nothing usable');

	/** The provider bills the request: one stretch of time, or a count of images. Dividing it is only for the gallery. `undefined` stays undefined: an unpriced model is not free. */
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
			// What was sent, and what was asked for: the first is a fact about this
			// picture, the second is what "another like this" is built from.
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

		try {
			writeImage(userId, image.id, contentType, bytes);
			insertImage(userId, image);
		} catch (cause) {
			// A picture that was drawn and paid for and cannot be kept. Reported as what it
			// is: the provider did its part and the instance could not do its own.
			//
			// Whatever landed before this stays. Deleting pictures somebody has been billed
			// for, to make a failure look neater, is worse than keeping them.
			throw new ImageError(
				500,
				cause instanceof ImageStoreError ? cause.message : 'The image could not be stored'
			);
		}
		stored.push(image);
	}

	// One reading for the whole request, priced the way a turn is. A personal
	// connection is somebody's own bill, which `recordRunUsage` refuses to count.
	recordRunUsage(userId, server.id, input.model, {
		input: 0,
		output: 0,
		images: stored.length,
		seconds
	});

	return stored;
}

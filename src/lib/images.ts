import { derived, get, writable } from 'svelte/store';

import { isServerMode } from '$lib/chat/endpoint';
import { modelKind } from '$lib/connections';
import type { GeneratedImage } from '$lib/generatedImages';
import type { ImageQuality, ImageRatio } from '$lib/connections';
import { writeImageTitle } from '$lib/imagePrompt';
import { serversStore, settingsStore } from '$lib/localStorage';

/**
 * The gallery, on the browser's side.
 *
 * Its own store rather than a collection in the repository, because images only
 * exist in server mode: the repository is the one interface both modes have to
 * satisfy, and putting something there that local mode cannot implement would
 * make the seam lie about what it is.
 */

export const imagesStore = writable<GeneratedImage[]>([]);
export const imagesLoaded = writable(false);

/** Where a picture's bytes are. Authenticated and scoped to its owner. */
export const imageUrl = (id: string) => `/api/images/${id}/blob`;

export async function loadImages(): Promise<void> {
	if (!isServerMode) {
		imagesLoaded.set(true);
		return;
	}
	try {
		const response = await fetch('/api/images');
		if (!response.ok) return;
		const data = (await response.json()) as { images: GeneratedImage[] };
		imagesStore.set(data.images ?? []);
	} catch {
		// A gallery that will not load is not a reason to break the page it is on.
	} finally {
		imagesLoaded.set(true);
	}
}

export interface GenerateInput {
	serverId: string;
	model: string;
	prompt: string;
	sentPrompt?: string;
	negativePrompt?: string;
	/** The app's own words. The server translates them for the provider it calls. */
	ratio?: ImageRatio;
	quality?: ImageQuality;
	n?: number;
}

/**
 * Ask for a picture, and put what comes back at the front of the gallery.
 *
 * Long, and nothing is done to hide that. What it is not is fragile: the server
 * writes what it made before answering, so a tab closed mid-request loses the
 * response and not the picture.
 */
export async function generateImages(input: GenerateInput): Promise<GeneratedImage[]> {
	const response = await fetch('/api/images', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		throw new Error(detail || `HTTP ${response.status}`);
	}

	const { images } = (await response.json()) as { images: GeneratedImage[] };
	imagesStore.update((current) => [...images, ...current]);
	return images;
}

/**
 * Name the pictures a request just produced, once they exist.
 *
 * After the fact and never awaited by the caller: the pictures are already
 * stored and already on screen, and a label arriving a second later is a label
 * arriving a second later. A failure is silent by design — everything that reads
 * a title falls back to the prompt, which is what it did before titles existed.
 *
 * One call for the batch, because four pictures from one request share one
 * prompt and would otherwise be given four goes at naming the same thing.
 */
export async function titleImages(images: GeneratedImage[], prompt: string): Promise<void> {
	if (!images.length) return;

	const title = await writeImageTitle(prompt);
	if (!title) return;

	await Promise.all(
		images.map((image) =>
			fetch(`/api/images/${image.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title })
			}).catch(() => undefined)
		)
	);

	const named = new Set(images.map((image) => image.id));
	imagesStore.update((current) =>
		current.map((image) => (named.has(image.id) ? { ...image, title } : image))
	);
}

export async function deleteImage(id: string): Promise<void> {
	const response = await fetch(`/api/images/${id}`, { method: 'DELETE' });
	if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
	imagesStore.update((current) => current.filter((image) => image.id !== id));
}

/** The models this account can draw with, across every connection it may use. */
export const imageModels = derived([settingsStore, serversStore], ([$settings, $servers]) =>
	($settings.models ?? []).filter((model) => {
		const server = $servers.find((s) => s.id === model.serverId);
		return modelKind(server, model.name) === 'image';
	})
);

/**
 * Whether the app should offer drawing at all: the right mode, and a model that
 * can do it.
 *
 * The second half is the whole permission now. There is no separate instance
 * switch: a model only counts as one that draws once somebody has marked it so
 * under Models and pricing, and on a system connection it only reaches anyone
 * once it is shared. An administrator who does not want this offers no image
 * model, which is the same decision expressed where the models already are.
 */
export const canDrawImages = derived(imageModels, ($models) => isServerMode && $models.length > 0);

/** The connection a model belongs to, which the server needs named explicitly. */
export function serverIdFor(model: string): string | undefined {
	return get(settingsStore).models?.find((m) => m.name === model)?.serverId;
}

import type { ImageQuality, ImageRatio } from '$lib/connections';

/**
 * A picture the app made, and everything about it that is not the picture.
 *
 * The bytes live on disk behind their own authenticated route; this is small,
 * listable and backupable. A gallery has to draw a hundred rows without carrying
 * a hundred megabytes, and the prompt outlives the image it produced.
 */
export interface GeneratedImage {
	id: string;
	/** Absent on anything drawn before titling existed or with it switched off, so every reader falls back to the prompt. A label, not a record. */
	title?: string;
	/** What the person asked for, in their words. Never overwritten. */
	prompt: string;
	/** Kept beside the original rather than instead of it, so "why does this not look like what I asked for" has an answer. */
	sentPrompt?: string;
	negativePrompt?: string;
	/** Which connection drew it, and with what. Both needed to draw it again. */
	serverId: string;
	model: string;
	/** The concrete size that was sent, when one was. Absent means the model chose. */
	size?: string;
	/** What "make another like this" needs: the pixel counts belong to whichever model drew it, and reusing them on another would be a refusal. A shape and a level of effort travel. */
	ratio?: ImageRatio;
	quality?: ImageQuality;
	style?: string;
	/** `image/png` and friends, decided here and never taken from the provider. */
	contentType: string;
	bytes: number;
	/** Seconds the provider took. The bill for most image models is this number. */
	seconds?: number;
	/** What it cost, when the model was priced. Absent is unpriced, not free. */
	cost?: number;
	currency?: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * A cap on one image and a cap on an account, because neither alone is enough:
 * without the first one enormous answer fills the disk, without the second a
 * thousand small ones do. Deliberately generous: a guard against runaway, not a
 * quota anybody should meet.
 */
export const IMAGE_LIMITS = {
	/** One image, in bytes. A 1792x1024 PNG lands around 3 MB. */
	maxBytes: 20 * 1024 * 1024,
	/** Everything one account holds, in bytes. */
	maxBytesPerUser: 2 * 1024 * 1024 * 1024,
	/** Images per request. Every provider the app talks to caps at or below this. */
	maxPerRequest: 4,
	prompt: 2000,
	negativePrompt: 1000
} as const;

/**
 * The types the app will serve back. An allowlist rather than whatever the
 * provider labelled its answer, because this is served from the app's own
 * origin: an SVG accepted here is script running as the app.
 */
/**
 * The types accepted as an *input* picture. Narrower on purpose: the providers
 * that take reference pictures take these two and refuse the rest, so a third
 * would fail after the upload rather than before it.
 */
export const IMAGE_INPUT_TYPES = ['image/png', 'image/jpeg'];

/** A word boundary each side, so `image` does not pass for `img` and a trailing comma does not stop one that should. */
export function hasTrigger(prompt: string, trigger: string): boolean {
	const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\b${escaped}\\b`, 'i').test(prompt);
}

export const IMAGE_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

/** From the magic bytes, never from a `content-type` the provider chose and never from a filename. Nothing is what refuses the write. */
export function sniffImageType(bytes: Uint8Array): string | undefined {
	const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);

	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
	// RIFF....WEBP: the four bytes in between are the length, so they are skipped.
	if (
		starts(0x52, 0x49, 0x46, 0x46) &&
		[0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b)
	) {
		return 'image/webp';
	}
	return undefined;
}

/** The file extension for a stored image, for the download name and the blob path. */
export function extensionFor(contentType: string): string {
	return IMAGE_TYPES[contentType] ?? 'bin';
}

/**
 * A filename somebody would recognise in their downloads folder, built from the
 * title or the prompt: a folder of `image-1.png` is one nobody can search, and a
 * filename is the one piece of metadata every desktop search already indexes.
 * Stripped and truncated: a two-thousand-character prompt is not a filename.
 */
export function downloadName(
	image: Pick<GeneratedImage, 'title' | 'prompt' | 'contentType'>
): string {
	const stem =
		(image.title || image.prompt)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'image';
	return `${stem}.${extensionFor(image.contentType)}`;
}

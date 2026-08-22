import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { IMAGE_INPUT_TYPES } from '$lib/generatedImages';
import type { ImageAttachment } from '$lib/promptAttachments';
import { generateRandomId } from '$lib/utils';

/**
 * Pictures coming *into* the app, from wherever the user got them.
 *
 * Three ways in, one meaning: the file picker, a paste, and a drop. They were
 * two copies of the same forty lines, in two files, which is how they came to
 * disagree about the wording of their own warning while agreeing about
 * everything that mattered. One place now, so a fourth way in is a call rather
 * than a third copy.
 *
 * Nothing here talks to a provider or to the server. It turns files into
 * attachments the interface can show, and refuses the ones it will not carry.
 */

/** The `accept` attribute for a file input, matching `IMAGE_INPUT_TYPES`. */
export const IMAGE_INPUT_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

/** One file read, or nothing when it could not be read. */
function readOne(file: File, name: string): Promise<ImageAttachment | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const dataUrl = event.target?.result as string;
			resolve(dataUrl ? { type: 'image', id: generateRandomId(), name, dataUrl } : null);
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(file);
	});
}

/** A name for a picture that arrived without one, which is every paste. */
function pastedName(type: string, index: number): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return `pasted-image-${timestamp}-${index + 1}.${type === 'image/png' ? 'png' : 'jpg'}`;
}

/**
 * Read what was handed over, and say what was left out.
 *
 * The refused ones are counted rather than listed: someone dropping a folder on
 * the composer wants to know that not all of it came through, not to read
 * fourteen filenames in a toast.
 */
export async function readImageFiles(
	files: File[],
	{ named }: { named?: (file: File, index: number) => string } = {}
): Promise<{ images: ImageAttachment[]; rejected: number }> {
	let rejected = 0;
	const wanted: Promise<ImageAttachment | null>[] = [];

	files.forEach((file, index) => {
		if (!IMAGE_INPUT_TYPES.includes(file.type)) {
			rejected++;
			return;
		}
		wanted.push(readOne(file, named?.(file, index) ?? file.name));
	});

	const read = await Promise.all(wanted);
	return { images: read.filter((image): image is ImageAttachment => image !== null), rejected };
}

/** The same, from a clipboard, where nothing has a name of its own. */
export function readPastedImages(
	data: DataTransfer
): Promise<{ images: ImageAttachment[]; rejected: number }> {
	const files = Array.from(data.items)
		.filter((item) => item.type.startsWith('image/'))
		.map((item) => item.getAsFile())
		.filter((file): file is File => file !== null);

	return readImageFiles(files, { named: (file, index) => pastedName(file.type, index) });
}

/** Whether a drag carries files at all, which is what a drop zone reacts to. */
export function carriesFiles(data: DataTransfer | null): boolean {
	return !!data && Array.from(data.types).includes('Files');
}

/** Ask the system for pictures. Resolves empty when the dialog is dismissed. */
export function pickImageFiles(): Promise<{ images: ImageAttachment[]; rejected: number }> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = IMAGE_INPUT_ACCEPT;
		input.multiple = true;
		input.onchange = (event) => {
			const files = (event.target as HTMLInputElement).files;
			if (!files?.length) return resolve({ images: [], rejected: 0 });
			resolve(readImageFiles(Array.from(files)));
		};
		input.click();
	});
}

/**
 * Say that some of it did not come through.
 *
 * Called by whoever asked, rather than from inside the reading, because the same
 * reading serves a composer that can warn and a drop zone that may prefer to say
 * it in place.
 */
export function warnRejected(rejected: number): void {
	if (rejected > 0) toast.warning(get(LL).imagesIgnored({ count: rejected }));
}

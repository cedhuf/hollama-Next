import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';

/**
 * A device driven by a finger, which is also one with a soft keyboard: focusing
 * a field there costs half the screen, so anything that focuses the composer on
 * its own behalf has to check first.
 *
 * The guard is a plain `typeof` rather than `browser` from `$app/environment`,
 * which is why this file is testable: `$app/*` are Vite's virtual modules, so
 * anything importing them can only run through Vite, and one import made the
 * entire suite unloadable in Node.
 */
export function isTouchPrimary() {
	return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function generateRandomId() {
	return Math.random().toString(36).substring(2, 8); // E.g. `z7avx9`
}

export function getUpdatedAtDate() {
	return new Date().toISOString();
}

export function formatTimestampToNow(timestamp: string) {
	return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

/**
 * Short relative time, for status lines that must not run long.
 * `formatDistanceToNow` hedges ("about 2 hours ago"); the strict variant does
 * not. Under a minute is not worth a number, so the caller passes the word.
 */
export function formatTimestampToNowShort(timestamp: string, justNow: string) {
	const elapsed = Date.now() - new Date(timestamp).getTime();
	if (elapsed < 60_000) return justNow;
	return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
}

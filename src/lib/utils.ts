import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';

/**
 * A device driven by a finger, which is also a device with a soft keyboard.
 *
 * Focusing a field there costs half the screen, so anything that focuses the
 * composer on its own behalf (rather than because someone tapped it) has to
 * check first. On a mouse-and-keyboard machine focus is free, and taking it is
 * the friendly thing to do.
 *
 * The guard is a plain `typeof` rather than `browser` from `$app/environment`,
 * and that is the whole of why this file is testable. `$app/*` are Vite's
 * virtual modules: anything importing them can only ever run through Vite, and
 * this one is a handful of pure helpers that half the app and every end-to-end
 * test pulls in. One import made the entire suite unloadable in Node.
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
 * Short relative time, for status lines that sit beside other content and must
 * not run long.
 *
 * `formatDistanceToNow` hedges: "less than a minute ago", "about 2 hours ago".
 * The strict variant drops the hedging and gives "1 minute ago", "2 hours ago".
 * Anything under a minute is not worth a number at all, so the caller passes the
 * word it wants for that case rather than showing "0 seconds ago".
 */
export function formatTimestampToNowShort(timestamp: string, justNow: string) {
	const elapsed = Date.now() - new Date(timestamp).getTime();
	if (elapsed < 60_000) return justNow;
	return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
}

import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';

import { browser } from '$app/environment';

/**
 * A device driven by a finger, which is also a device with a soft keyboard.
 *
 * Focusing a field there costs half the screen, so anything that focuses the
 * composer on its own behalf (rather than because someone tapped it) has to
 * check first. On a mouse-and-keyboard machine focus is free, and taking it is
 * the friendly thing to do.
 */
export function isTouchPrimary() {
	return browser && window.matchMedia('(pointer: coarse)').matches;
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

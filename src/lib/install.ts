import { get, writable } from 'svelte/store';

/**
 * When to offer putting the app on the home screen, and nothing about how.
 *
 * The how is `@khmyznikov/pwa-install`, and taking it was the right call: only
 * Chromium has an API for this, and it draws its own sheet from the manifest.
 * Everywhere else there is no mechanism at all, just a gesture to describe, and
 * describing it correctly on iOS, iPadOS, macOS, Android Chrome and Firefox is a
 * matrix nobody with a single phone can honestly claim to have tested.
 *
 * What is left to us is the timing, which is the part that belongs to the
 * product rather than to the platform. The component is therefore held in manual
 * mode: it shows nothing on its own, and this module decides.
 */

/** The element itself, once the browser has defined it. */
export interface PwaInstallDialog extends HTMLElement {
	showDialog(forced?: boolean): void;
	hideDialog(): void;
	isInstallAvailable: boolean;
	isUnderStandaloneMode: boolean;
}

const dialog = writable<PwaInstallDialog | null>(null);

export const installDialog = {
	subscribe: dialog.subscribe,
	set: dialog.set
};

/** Opens it on request, which is what the sidebar entry does. */
export function openInstallDialog(): void {
	get(dialog)?.showDialog(true);
}

/**
 * True when the app is already running as an installed app.
 *
 * The standard says one thing, iOS says another: both have to be asked, and a
 * `false` from either is not an answer.
 */
export function isInstalled(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.matchMedia('(display-mode: fullscreen)').matches ||
		('standalone' in window.navigator && window.navigator.standalone === true)
	);
}

/**
 * When the app last asked.
 *
 * Deliberately not in the settings store. Settings travel between devices;
 * whether this phone has the app on its home screen does not. Filed there, an
 * offer made on the laptop would count as made on a phone that never saw it.
 * The preference for being asked at all does travel, and lives in settings,
 * because that one is about the person rather than the device.
 */
const LAST_OFFERED_KEY = 'llooma-install-offered-at';

/** How long before asking again. Long enough not to nag, short enough to matter. */
const NUDGE_DAYS = 14;

/** Whether to offer of our own accord, rather than because someone asked. */
export function shouldOfferInstall(enabled: boolean): boolean {
	if (!enabled || isInstalled()) return false;

	try {
		const last = Number(localStorage.getItem(LAST_OFFERED_KEY));
		if (!last) return true;
		return Date.now() - last > NUDGE_DAYS * 24 * 60 * 60 * 1000;
	} catch {
		// Private browsing, or a full quota. Offering again is a smaller failure
		// than refusing to start.
		return true;
	}
}

export function markInstallOffered(): void {
	try {
		localStorage.setItem(LAST_OFFERED_KEY, String(Date.now()));
	} catch {
		// See above.
	}
}

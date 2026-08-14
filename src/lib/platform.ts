import { browser } from '$app/environment';

/**
 * Which modifier key this keyboard prints.
 *
 * Shared because the shortcut list, the search field's hint and anything else
 * that shows a key have to agree: a ⌘ next to a Ctrl in the same window is the
 * kind of detail that reads as a bug.
 *
 * `userAgentData` where it exists, since `navigator.platform` is deprecated;
 * the user agent string is the fallback. Off the browser it answers Ctrl, the
 * safer guess for a first paint that hydration corrects a moment later.
 */
export function isApplePlatform(): boolean {
	if (!browser) return false;
	const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
	return /mac|iphone|ipad/i.test(platform ?? navigator.userAgent);
}

/** The modifier as printed on the key: ⌘ on Apple keyboards, Ctrl elsewhere. */
export function modKey(): string {
	return isApplePlatform() ? '⌘' : 'Ctrl';
}

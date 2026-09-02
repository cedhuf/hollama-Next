import { browser } from '$app/environment';

/**
 * Which modifier key this keyboard prints. Shared, because the shortcut list,
 * the search hint and anything else showing a key have to agree.
 *
 * `userAgentData` where it exists, since `navigator.platform` is deprecated,
 * with the user agent string as fallback. Off the browser it answers Ctrl, which
 * hydration corrects a moment later.
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

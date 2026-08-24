import { writable } from 'svelte/store';

/**
 * Reading the pages a message links to.
 *
 * Web search hands the model titles and snippets (a sentence or two, sometimes
 * marketing copy) and asks it to write a factual answer from that. This closes
 * the gap: when the user names a URL, the model gets the page.
 */

export interface WebFetchConfig {
	available: boolean;
	editable: boolean;
	maxPages: number;
	maxChars: number;
}

export const webFetchConfig = writable<WebFetchConfig>({
	available: false,
	editable: true,
	maxPages: 3,
	maxChars: 20_000
});

/** The policy comes from the instance, which is also the one that enforces it. */
export async function loadWebFetchConfig(): Promise<void> {
	try {
		const resolved = await (await fetch('/api/fetch/config')).json();
		webFetchConfig.set({
			available: !!resolved.webFetch,
			editable: !!resolved.editable,
			maxPages: resolved.maxPages,
			maxChars: resolved.maxChars
		});
	} catch {
		webFetchConfig.set({ available: false, editable: false, maxPages: 3, maxChars: 20_000 });
	}
}

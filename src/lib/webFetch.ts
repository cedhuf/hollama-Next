import { get, writable } from 'svelte/store';

/**
 * Reading the pages a message links to.
 *
 * Web search hands the model titles and snippets (a sentence or two, sometimes
 * marketing copy) and asks it to write a factual answer from that. This closes
 * the gap: when the user names a URL, the model gets the page.
 */

export interface FetchedPage {
	url: string;
	title: string;
	text: string;
	truncated: boolean;
}

interface FailedPage {
	url: string;
	error: string;
}

export interface PageContext {
	context: string;
	pages: FetchedPage[];
	failures: FailedPage[];
}

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

/**
 * Fetches the given pages and formats them as a context block.
 *
 * `startNumber` continues the numbering from whatever the turn has already shown
 * the model, so one set of citation numbers covers the whole turn.
 */
export async function buildPageContext(
	urls: string[],
	startNumber = 1
): Promise<PageContext | null> {
	const config = get(webFetchConfig);
	const wanted = urls.slice(0, config.maxPages);
	if (!wanted.length) return null;

	const response = await fetch('/api/fetch', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ urls: wanted })
	});
	if (!response.ok) return null;

	const { pages: results } = (await response.json()) as {
		pages: (FetchedPage | FailedPage)[];
	};

	const pages = results.filter((p): p is FetchedPage => 'text' in p);
	const failures = results.filter((p): p is FailedPage => 'error' in p);
	if (!pages.length && !failures.length) return null;

	const body = [
		...pages.map(
			(page, i) =>
				`[${startNumber + i}] ${page.title}\n${page.url}\n\n${page.text}${
					page.truncated ? '\n\n[…truncated]' : ''
				}`
		),
		// Naming what failed stops the model from filling the silence with a guess.
		...failures.map((f) => `[!] ${f.url}\nCould not be read: ${f.error}`)
	].join('\n\n---\n\n');

	return { context: body, pages, failures };
}

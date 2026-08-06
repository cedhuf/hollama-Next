/**
 * Whether this turn is driven by native tool calling.
 *
 * The app has two ways to give a model the web: text protocols it answers with
 * (`<read>` blocks, plus a router pre-pass that decides on searching for it), and
 * native tool calls the provider transports as structured fields. The text path
 * is the one that works on every endpoint, so it stays the default and the
 * fallback; native is opted into.
 *
 * Deciding is deliberately conservative. Offering tools to a model that cannot
 * call them is not a clean failure: it improvises, and the user reads a reply with
 * a JSON blob in it, or a claim that it searched when nothing was called.
 */
import { ConnectionType, supportsNativeTools, type Server } from '$lib/connections';

import type { ToolSpec } from './index';
import { OllamaStrategy } from './ollama';

export type NativeToolsSetting = 'off' | 'auto' | 'force';

/**
 * The two tools, saying the same things the text prompts say.
 *
 * Kept in step with `searchRouter`, `searchContext` and `searchRead` on purpose:
 * the two paths have to produce the same behaviour, or a bug becomes a bug on
 * some providers only, which is the kind nobody can reproduce. Where those
 * prompts are editable in Settings and these are not, that is the trade for
 * having the provider carry the protocol instead of the prose.
 */
export const WEB_SEARCH_TOOL: ToolSpec = {
	name: 'web_search',
	description:
		'Search the web. Returns a numbered list of results, each with a title, an address and a short snippet. ' +
		'Use it for anything you are not certain of: current events, prices, schedules, opening hours, releases, ' +
		'and facts about a named thing such as a game, film, product, company, place or API. An unfamiliar or ' +
		'niche name is the strongest reason to search, not a reason to guess. Search again rather than taking ' +
		'back an earlier answer you have started to doubt. Cite the results you use inline with their [number].',
	parameters: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description:
					'A few keywords, no quotes. Use neutral, factual terms: do not add words like "rumor", "fake" ' +
					'or "hoax" because you doubt something exists. Write the query in the language the answer is ' +
					"documented in, which is the user's language for news, weather and local topics, and usually " +
					'English for software, games, science and technology. Never translate a proper noun yourself: ' +
					'spell it exactly as its makers do.'
			}
		},
		required: ['query']
	}
};

export const READ_PAGE_TOOL: ToolSpec = {
	name: 'read_page',
	description:
		'Fetch the full text of a page whose address you have already been given, in a search result or earlier ' +
		'in this conversation. Snippets are a sentence or two; use this when the detail decides the answer, and ' +
		'whenever you are about to contradict, doubt or take back something you said earlier from a source. ' +
		'You cannot open an address that has not appeared in this conversation.',
	parameters: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The exact address, copied from where it was given to you.'
			}
		},
		required: ['url']
	}
};

export async function useNativeTools(
	server: Server,
	model: string,
	setting: NativeToolsSetting
): Promise<boolean> {
	if (setting === 'off') return false;
	// The user asserting support for an endpoint that has no way to advertise it.
	// Taken at their word, including for Ollama: they may know a model handles
	// tools despite an older daemon not listing the capability.
	if (setting === 'force') return true;

	// Ollama answers per model, which is the finest-grained answer available
	// anywhere and the reason no per-model setting is needed for it.
	if (server.connectionType === ConnectionType.Ollama) {
		return new OllamaStrategy(server).supportsTools(model);
	}

	return supportsNativeTools(server.connectionType);
}

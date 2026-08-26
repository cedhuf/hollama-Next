import { declaredModels, extraCatalogues, type ModelKind } from '$lib/connections';
import { getServerApiKey, rememberModelKinds, type ServerRow } from '$lib/server/db/servers';

export interface ProviderTarget {
	connectionType: string;
	baseUrl: string;
	apiKey?: string | null;
	modelFilter?: string | null;
}

/**
 * Fetch the model names a provider offers, server-side. Throws on a connection
 * error (used by the verify endpoint to distinguish failure from empty).
 */
export async function fetchModels(target: ProviderTarget): Promise<string[]> {
	const base = target.baseUrl.replace(/\/+$/, '');
	const filter = target.modelFilter ?? '';

	if (target.connectionType === 'ollama') {
		const response = await fetch(`${base}/api/tags`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		return (data?.models ?? [])
			.map((m: { name: string }) => m.name)
			.filter((name: string) => name.startsWith(filter));
	}

	return readCatalogue(`${base}/models`, target.apiKey, filter);
}

/**
 * One OpenAI-shaped list of models, wherever it hangs.
 *
 * A URL rather than a base, because the second list a provider keeps is not
 * always a second root: OpenRouter's is the same route asked a different
 * question. Everything else about reading it is identical, which is why this is
 * one function and not two.
 */
async function readCatalogue(
	url: string,
	apiKey: string | null | undefined,
	filter: string
): Promise<string[]> {
	const response = await fetch(url, {
		headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const data = await response.json();
	return (data?.data ?? [])
		.map((m: { id: string }) => m.id)
		.filter((id: string) => id.startsWith(filter));
}

/**
 * Models a stored server offers (using its decrypted key). Best-effort:
 * returns [] on any failure.
 *
 * Both of its roots, when it has two. A provider that serves images from a
 * different base usually lists them from that base as well, and asking only the
 * chat one returns a catalogue with no image model in it, which is not a
 * missing feature, it is a section of the settings that stays empty for ever
 * while the connection works perfectly. Infomaniak is the case in hand: its chat
 * root lists eleven models and its image root is the only place `flux` appears.
 *
 * Nothing is classified by which root it came from. That root lists transcription
 * and embedding models too, so the name still decides, and the administrator
 * still overrides. Each list is fetched on its own so a root that is wrong or
 * down costs nothing but itself.
 *
 * The kinds beside the names are the exception to that, and the only one: a
 * catalogue fetched by asking "what speaks" has answered the question outright,
 * and an answer beats a guess. It is still not the last word. Whoever runs the
 * connection overrides it in Models and prices, the same as they override the
 * name.
 */
export async function listProviderModels(
	server: ServerRow
): Promise<{ names: string[]; kinds: Record<string, ModelKind> }> {
	const apiKey = getServerApiKey(server);
	const read = async (baseUrl: string): Promise<string[]> => {
		try {
			return await fetchModels({
				connectionType: server.connection_type,
				baseUrl,
				apiKey,
				modelFilter: server.model_filter
			});
		} catch {
			return [];
		}
	};

	const names = new Set(await read(server.base_url));
	// What the provider itself established, as opposed to what a name suggests.
	// Sparse, and never the last word: a correction stored against the connection
	// still beats it, the same as it beats the guess.
	const kinds: Record<string, ModelKind> = {};
	if (server.image_base_url && server.image_base_url !== server.base_url) {
		for (const name of await read(server.image_base_url)) names.add(name);
	}
	// And whatever the provider will only list when asked a narrower question. Same
	// treatment as a second root: its own call, its own failure, and nothing lost
	// from the main list when it goes wrong.
	const roots = { baseUrl: server.base_url.replace(/\/+$/, '') };
	for (const catalogue of extraCatalogues(server.connection_type, roots)) {
		try {
			for (const name of await readCatalogue(catalogue.url, apiKey, server.model_filter ?? '')) {
				names.add(name);
				// Asked "what speaks", answered with things that speak. That is worth
				// more than any reading of the name, and it is the only thing that
				// separates `fish-audio/s1` from `fish-audio/transcribe-1`.
				if (catalogue.kind) kinds[name] = catalogue.kind;
			}
		} catch {
			// A catalogue that is not there is a catalogue that adds nothing.
		}
	}
	// And whatever the provider serves without listing. A dedicated endpoint is a
	// route, so no catalogue mentions it; named in the descriptor it joins the list
	// here and is priced, shared and metered like everything else in it.
	for (const name of declaredModels(server.connection_type)) names.add(name);

	// Kept, so the server side knows it too. The browser is handed these with the
	// catalogue, but the route that reads a sentence aloud checks for itself that
	// the model can, and it has only the database to check against.
	rememberModelKinds(server.id, kinds);

	return {
		names: [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
		kinds
	};
}

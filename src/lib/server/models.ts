import { declaredModels, extraCatalogues, type ModelKind } from '$lib/connections';
import { getServerApiKey, rememberModelKinds, type ServerRow } from '$lib/server/db/servers';

export interface ProviderTarget {
	connectionType: string;
	baseUrl: string;
	apiKey?: string | null;
	modelFilter?: string | null;
}

/** Throws on a connection error, so the verify endpoint can tell failure from empty. */
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

/** A URL rather than a base, because a provider's second list is not always a second root: OpenRouter's is the same route asked a different question. */
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
 * Models a stored server offers, using its decrypted key. Best-effort: `[]` on
 * any failure.
 *
 * Both of its roots, when it has two: a provider serving images from another
 * base usually lists them there too. Each list is fetched on its own, so a root
 * that is down costs nothing but itself.
 *
 * Nothing is classified by which root it came from, since that root lists
 * transcription and embedding models too. The kinds are the exception: a
 * catalogue asked "what speaks" has answered outright, though Models and prices
 * still overrides it.
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
	// Sparse, and never the last word: a stored correction still beats it.
	const kinds: Record<string, ModelKind> = {};
	if (server.image_base_url && server.image_base_url !== server.base_url) {
		for (const name of await read(server.image_base_url)) names.add(name);
	}
	// And whatever the provider will only list when asked a narrower question. Same
	// treatment as a second root: its own call, its own failure.
	const roots = { baseUrl: server.base_url.replace(/\/+$/, '') };
	for (const catalogue of extraCatalogues(server.connection_type, roots)) {
		try {
			for (const name of await readCatalogue(catalogue.url, apiKey, server.model_filter ?? '')) {
				names.add(name);
				// Asked "what speaks", answered with things that speak. That is the only thing
				// that separates `fish-audio/s1` from `fish-audio/transcribe-1`.
				if (catalogue.kind) kinds[name] = catalogue.kind;
			}
		} catch {
			// A catalogue that is not there adds nothing.
		}
	}
	// And whatever the provider serves without listing: a dedicated endpoint is a
	// route, so no catalogue mentions it. Named in the descriptor it joins the list.
	for (const name of declaredModels(server.connection_type)) names.add(name);

	// Kept, so the server side knows it too: the route that reads a sentence aloud
	// checks for itself that the model can, and has only the database to check.
	rememberModelKinds(server.id, kinds);

	return {
		names: [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
		kinds
	};
}

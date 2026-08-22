import { declaredModels } from '$lib/connections';
import { getServerApiKey, type ServerRow } from '$lib/server/db/servers';

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

	const response = await fetch(`${base}/models`, {
		headers: target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}
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
 * chat one returns a catalogue with no image model in it — which is not a
 * missing feature, it is a section of the settings that stays empty for ever
 * while the connection works perfectly. Infomaniak is the case in hand: its chat
 * root lists eleven models and its image root is the only place `flux` appears.
 *
 * Nothing is classified by which root it came from. That root lists transcription
 * and embedding models too, so the name still decides, and the administrator
 * still overrides. Each list is fetched on its own so a root that is wrong or
 * down costs nothing but itself.
 */
export async function listProviderModels(server: ServerRow): Promise<string[]> {
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
	if (server.image_base_url && server.image_base_url !== server.base_url) {
		for (const name of await read(server.image_base_url)) names.add(name);
	}
	// And whatever the provider serves without listing. A dedicated endpoint is a
	// route, so no catalogue mentions it; named in the descriptor it joins the list
	// here and is priced, shared and metered like everything else in it.
	for (const name of declaredModels(server.connection_type)) names.add(name);
	return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

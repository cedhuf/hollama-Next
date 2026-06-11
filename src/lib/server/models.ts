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
 */
export async function listProviderModels(server: ServerRow): Promise<string[]> {
	try {
		return await fetchModels({
			connectionType: server.connection_type,
			baseUrl: server.base_url,
			apiKey: getServerApiKey(server),
			modelFilter: server.model_filter
		});
	} catch {
		return [];
	}
}

import { getServerApiKey, type ServerRow } from '$lib/server/db/servers';

/**
 * Fetch the model names a server actually offers, server-side, using its
 * decrypted key. Best-effort: returns [] on any failure. Used for personal
 * servers (system servers expose only the admin-curated shared_models).
 */
export async function listProviderModels(server: ServerRow): Promise<string[]> {
	const base = server.base_url.replace(/\/+$/, '');
	const filter = server.model_filter ?? '';

	try {
		if (server.connection_type === 'ollama') {
			const response = await fetch(`${base}/api/tags`);
			if (!response.ok) return [];
			const data = await response.json();
			return (data?.models ?? [])
				.map((m: { name: string }) => m.name)
				.filter((name: string) => name.startsWith(filter));
		}

		const key = getServerApiKey(server);
		const response = await fetch(`${base}/models`, {
			headers: key ? { Authorization: `Bearer ${key}` } : {}
		});
		if (!response.ok) return [];
		const data = await response.json();
		return (data?.data ?? [])
			.map((m: { id: string }) => m.id)
			.filter((id: string) => id.startsWith(filter));
	} catch {
		return [];
	}
}

import { env } from '$env/dynamic/public';
import type { Server } from '$lib/connections';

/** True when the app runs in multi-user server mode. */
export const isServerMode = env.PUBLIC_MODE === 'server';

/**
 * Base URL for direct (Ollama) fetches.
 * - server mode: the authenticated proxy resolves the real endpoint + key by id.
 * - local mode: the server's own base URL (Ollama is reached directly).
 */
export function ollamaBaseUrl(server: Server): string {
	return isServerMode ? `${globalThis.location.origin}/api/llm/${server.id}` : server.baseUrl;
}

/**
 * OpenAI SDK config.
 * - server mode: point at the authenticated proxy (key injected server-side).
 * - local mode: the CORS proxy, with the target URL + key supplied by the client.
 */
export function openaiClientConfig(server: Server): {
	baseURL: string;
	apiKey: string;
	defaultHeaders: Record<string, string>;
} {
	const origin = globalThis.location.origin;
	if (isServerMode) {
		return { baseURL: `${origin}/api/llm/${server.id}/`, apiKey: 'server', defaultHeaders: {} };
	}
	return {
		baseURL: `${origin}/api/proxy/`,
		apiKey: server.apiKey || '',
		defaultHeaders: { 'X-Target-Base-Url': server.baseUrl }
	};
}

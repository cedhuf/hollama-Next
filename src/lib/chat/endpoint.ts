import { env } from '$env/dynamic/public';
import type { Server } from '$lib/connections';

/** True when the app runs in multi-user server mode. */
export const isServerMode = env.PUBLIC_MODE === 'server';

/**
 * Who is placing the call.
 *
 * The proxy exists for the browser: it holds the keys the browser must not see,
 * and it stands in for an endpoint the browser cannot reach across origins. A
 * turn running inside the Node process is on the other side of that, and is in
 * fact the thing the proxy would have called, so it addresses the provider
 * directly. Not the same question as which mode the app is deployed in, which is
 * why it is a separate flag rather than another branch on `isServerMode`.
 */
export interface EndpointOptions {
	direct?: boolean;
}

/**
 * Base URL for direct (Ollama) fetches.
 * - server mode: the authenticated proxy resolves the real endpoint + key by id.
 * - local mode: the server's own base URL (Ollama is reached directly).
 */
export function ollamaBaseUrl(server: Server, { direct }: EndpointOptions = {}): string {
	if (direct) return server.baseUrl;
	return isServerMode ? `${globalThis.location.origin}/api/llm/${server.id}` : server.baseUrl;
}

/**
 * OpenAI SDK config.
 * - server mode: point at the authenticated proxy (key injected server-side).
 * - local mode: the CORS proxy, with the target URL + key supplied by the client.
 */
export function openaiClientConfig(
	server: Server,
	{ direct }: EndpointOptions = {}
): {
	baseURL: string;
	apiKey: string;
	defaultHeaders: Record<string, string>;
} {
	if (direct) {
		return { baseURL: server.baseUrl, apiKey: server.apiKey || '', defaultHeaders: {} };
	}
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

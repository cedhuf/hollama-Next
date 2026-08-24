import type { Server } from '$lib/connections';

/**
 * Who is placing the call.
 *
 * The proxy exists for the browser: it holds the keys the browser must not see,
 * and it stands in for an endpoint the browser cannot reach across origins. A
 * turn running inside the Node process is on the other side of that, and is in
 * fact the thing the proxy would have called, so it addresses the provider
 * directly.
 */
export interface EndpointOptions {
	direct?: boolean;
}

/**
 * Base URL for direct (Ollama) fetches: the authenticated proxy, which resolves
 * the real endpoint and its key by id.
 */
export function ollamaBaseUrl(server: Server, { direct }: EndpointOptions = {}): string {
	if (direct) return server.baseUrl;
	return `${globalThis.location.origin}/api/llm/${server.id}`;
}

/** OpenAI SDK config, pointed at the authenticated proxy (key injected server-side). */
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
	return {
		baseURL: `${globalThis.location.origin}/api/llm/${server.id}/`,
		apiKey: 'server',
		defaultHeaders: {}
	};
}

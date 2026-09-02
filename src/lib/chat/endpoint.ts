import type { Server } from '$lib/connections';

/**
 * Who is placing the call. The proxy exists for the browser: it holds the keys
 * and stands in for an endpoint it cannot reach across origins. A turn in the
 * Node process is what the proxy would have called, so it goes direct.
 *
 * `direct` is an override rather than the answer, since relying on it meant
 * relying on every caller to pass it, and the tool capability probe did not.
 */
export interface EndpointOptions {
	direct?: boolean;
}

/** There is no browser in the Node process, so there is nothing to be proxied to: we are the proxy. Asked of the environment, so a new call site cannot get it wrong by saying nothing. */
const throughProxy = () => typeof globalThis.location !== 'undefined';

/** Base URL for direct (Ollama) fetches: the authenticated proxy, which resolves the real endpoint and its key by id. */
export function ollamaBaseUrl(server: Server, { direct }: EndpointOptions = {}): string {
	if (direct || !throughProxy()) return server.baseUrl;
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
	if (direct || !throughProxy()) {
		return { baseURL: server.baseUrl, apiKey: server.apiKey || '', defaultHeaders: {} };
	}
	return {
		baseURL: `${globalThis.location.origin}/api/llm/${server.id}/`,
		apiKey: 'server',
		defaultHeaders: {}
	};
}

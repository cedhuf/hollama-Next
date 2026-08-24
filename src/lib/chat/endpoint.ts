import type { Server } from '$lib/connections';

/**
 * Who is placing the call.
 *
 * The proxy exists for the browser: it holds the keys the browser must not see,
 * and it stands in for an endpoint the browser cannot reach across origins. A
 * turn running inside the Node process is on the other side of that, and is in
 * fact the thing the proxy would have called, so it addresses the provider
 * directly.
 *
 * `direct` is now an override rather than the answer, because relying on it was
 * relying on every caller remembering to pass it. One did not: the tool
 * capability probe built a strategy with no options at all, which was harmless
 * while only browsers built strategies and became a crash the moment the turn
 * moved into the server. A rule applied by whoever remembers to apply it is not
 * a rule.
 */
export interface EndpointOptions {
	direct?: boolean;
}

/**
 * Whether this code is running somewhere that has a proxy to call.
 *
 * There is no browser in the Node process, so there is no origin to address and
 * nothing to be proxied to: we are the proxy. Asked of the environment rather
 * than of the caller, so a new call site cannot get it wrong by saying nothing.
 */
const throughProxy = () => typeof globalThis.location !== 'undefined';

/**
 * Base URL for direct (Ollama) fetches: the authenticated proxy, which resolves
 * the real endpoint and its key by id.
 */
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

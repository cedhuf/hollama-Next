import { ConnectionType, type Server } from '$lib/connections';
import type { Model } from '$lib/settings';

/** A usable provider as returned by /api/providers (server mode), without keys. */
export interface ProviderView {
	id: string;
	scope: 'system' | 'personal';
	connectionType: string;
	label: string | null;
	isEnabled: boolean;
	models?: string[];
	baseUrl?: string;
	modelFilter?: string | null;
	color?: string | null;
	hasApiKey?: boolean;
}

export interface ProvidersResponse {
	allowUserKeys: boolean;
	servers: ProviderView[];
}

const EMPTY: ProvidersResponse = { allowUserKeys: false, servers: [] };

let cache: Promise<ProvidersResponse> | null = null;

/** Fetch (and cache) the providers available to the current user in server mode. */
export function fetchProviders(force = false): Promise<ProvidersResponse> {
	if (!cache || force) {
		cache = fetch('/api/providers')
			.then((response) => (response.ok ? response.json() : EMPTY))
			.catch(() => EMPTY);
	}
	return cache;
}

/** Map a provider view to the `Server` shape the rest of the app expects. */
export function providerToServer(provider: ProviderView): Server {
	return {
		id: provider.id,
		connectionType: provider.connectionType as ConnectionType,
		baseUrl: provider.baseUrl ?? '', // unused in server mode (proxy resolves by id)
		isVerified: new Date(),
		isEnabled: provider.isEnabled,
		label: provider.label ?? undefined,
		modelFilter: provider.modelFilter ?? undefined,
		color: provider.color ?? undefined
	};
}

/** Flatten the providers' model lists into the app's Model[] shape. */
export function providerModels(servers: ProviderView[]): Model[] {
	return servers.flatMap((provider) =>
		(provider.models ?? []).map((name) => ({ serverId: provider.id, name }))
	);
}

import type { LoadOptions } from '$lib/chat/options';
import { ConnectionType, type ModelKind, type Server } from '$lib/connections';
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
	imageBaseUrl?: string | null;
	modelFilter?: string | null;
	color?: string | null;
	modelLabels?: Record<string, string>;
	modelKinds?: Record<string, ModelKind>;
	hasApiKey?: boolean;
	/** How this Ollama loads a model. Absent on anything that is not one. */
	loadOptions?: LoadOptions;
	/** ISO date of the last successful sync; null when it has never been synced. */
	verifiedAt?: string | null;
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
		imageBaseUrl: provider.imageBaseUrl ?? undefined,
		isVerified: new Date(),
		isEnabled: provider.isEnabled,
		label: provider.label ?? undefined,
		modelFilter: provider.modelFilter ?? undefined,
		color: provider.color ?? undefined,
		modelLabels: provider.modelLabels ?? undefined,
		modelKinds: provider.modelKinds ?? undefined,
		loadOptions: provider.loadOptions ?? undefined
	};
}

/** Flatten the providers' model lists into the app's Model[] shape. */
export function providerModels(servers: ProviderView[]): Model[] {
	return servers.flatMap((provider) =>
		(provider.models ?? []).map((name) => ({ serverId: provider.id, name }))
	);
}

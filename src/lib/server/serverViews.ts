import {
	getModelKinds,
	getModelLabels,
	getModelPricing,
	getSharedModels,
	type ServerRow
} from '$lib/server/db/servers';

/** Admin view of a system server: full config minus the (never-exposed) key. */
export function toAdminView(row: ServerRow) {
	return {
		id: row.id,
		connectionType: row.connection_type,
		baseUrl: row.base_url,
		label: row.label,
		modelFilter: row.model_filter,
		isEnabled: !!row.is_enabled,
		verifiedAt: row.verified_at,
		color: row.color,
		hasApiKey: !!row.api_key_enc,
		sharedModels: getSharedModels(row.id),
		modelLabels: getModelLabels(row.id),
		modelPricing: getModelPricing(row.id),
		modelKinds: getModelKinds(row.id)
	};
}

/**
 * The custom display names for the models a caller is actually allowed to see.
 *
 * Labels are keyed by model id, so handing over the whole map would disclose the
 * ids of models a user isn't offered — hence the filter through the visible list.
 */
export function pickModelLabels(serverId: string, models: string[]): Record<string, string> {
	const all = getModelLabels(serverId);
	const visible: Record<string, string> = {};
	for (const name of models) if (all[name]) visible[name] = all[name];
	return visible;
}

/**
 * The kinds of the models a caller may see, filtered for the same reason the
 * labels are: the map is keyed by model id, and handing it over whole would name
 * models this account was never offered.
 */
export function pickModelKinds(serverId: string, models: string[]) {
	const all = getModelKinds(serverId);
	const visible: Record<string, (typeof all)[string]> = {};
	for (const name of models) if (all[name]) visible[name] = all[name];
	return visible;
}

/**
 * User-facing view of a usable provider. System servers expose only the
 * admin-curated shared models and hide their endpoint; personal servers show
 * their own config (still never the key).
 */
export function toProviderView(row: ServerRow) {
	if (row.owner_user_id === null) {
		return {
			id: row.id,
			scope: 'system' as const,
			connectionType: row.connection_type,
			label: row.label,
			isEnabled: !!row.is_enabled,
			verifiedAt: row.verified_at,
			color: row.color,
			models: getSharedModels(row.id)
		};
	}
	return {
		id: row.id,
		scope: 'personal' as const,
		connectionType: row.connection_type,
		label: row.label,
		baseUrl: row.base_url,
		modelFilter: row.model_filter,
		isEnabled: !!row.is_enabled,
		verifiedAt: row.verified_at,
		color: row.color,
		hasApiKey: !!row.api_key_enc
	};
}

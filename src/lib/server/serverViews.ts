import { getModelLabels, getSharedModels, type ServerRow } from '$lib/server/db/servers';

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
		modelLabels: getModelLabels(row.id)
	};
}

/**
 * User-facing view of a usable provider. System servers expose only the
 * admin-curated shared models and hide their endpoint; personal servers show
 * their own config (still never the key).
 */
export function toProviderView(row: ServerRow) {
	if (row.owner_user_id === null) {
		const shared = getSharedModels(row.id);
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

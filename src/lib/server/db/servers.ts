import { randomUUID } from 'node:crypto';

import { decrypt, encrypt } from '$lib/server/crypto';

import { getDb } from './index';

export interface ServerRow {
	id: string;
	owner_user_id: string | null; // NULL = system/admin-shared
	connection_type: string;
	base_url: string;
	api_key_enc: string | null;
	label: string | null;
	model_filter: string | null;
	is_enabled: number;
	/** ISO date of the last successful sync; NULL when never verified. */
	verified_at: string | null;
	/** Badge colour override; NULL falls back to the provider default. */
	color: string | null;
	created_at: string;
}

export function listSystemServers(): ServerRow[] {
	return getDb()
		.prepare('SELECT * FROM servers WHERE owner_user_id IS NULL ORDER BY created_at')
		.all() as unknown as ServerRow[];
}

export function listUserServers(userId: string): ServerRow[] {
	return getDb()
		.prepare('SELECT * FROM servers WHERE owner_user_id = ? ORDER BY created_at')
		.all(userId) as unknown as ServerRow[];
}

export function getServer(id: string): ServerRow | undefined {
	return getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as
		| ServerRow
		| undefined;
}

/** The decrypted API key for a server, for server-side use only (the proxy). */
export function getServerApiKey(server: ServerRow): string | null {
	return server.api_key_enc ? decrypt(server.api_key_enc) : null;
}

export function createServer(input: {
	ownerUserId: string | null;
	connectionType: string;
	baseUrl: string;
	apiKey?: string | null;
	label?: string | null;
	modelFilter?: string | null;
	isEnabled?: boolean;
}): ServerRow {
	const id = randomUUID();
	getDb()
		.prepare(
			`INSERT INTO servers
			 (id, owner_user_id, connection_type, base_url, api_key_enc, label, model_filter, is_enabled, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			input.ownerUserId,
			input.connectionType,
			input.baseUrl,
			input.apiKey ? encrypt(input.apiKey) : null,
			input.label ?? null,
			input.modelFilter ?? null,
			input.isEnabled ? 1 : 0,
			new Date().toISOString()
		);
	return getServer(id)!;
}

/**
 * Patch a server. `apiKey`: omit to keep the existing key, pass `null`/`''` to
 * clear it, or a string to set a new one.
 */
export function updateServer(
	id: string,
	patch: {
		baseUrl?: string;
		apiKey?: string | null;
		label?: string | null;
		modelFilter?: string | null;
		isEnabled?: boolean;
		verifiedAt?: string | null;
		color?: string | null;
	}
): void {
	const sets: string[] = [];
	const values: unknown[] = [];

	if (patch.baseUrl !== undefined) {
		sets.push('base_url = ?');
		values.push(patch.baseUrl);
	}
	if (patch.apiKey !== undefined) {
		sets.push('api_key_enc = ?');
		values.push(patch.apiKey ? encrypt(patch.apiKey) : null);
	}
	if (patch.label !== undefined) {
		sets.push('label = ?');
		values.push(patch.label);
	}
	if (patch.modelFilter !== undefined) {
		sets.push('model_filter = ?');
		values.push(patch.modelFilter);
	}
	if (patch.isEnabled !== undefined) {
		sets.push('is_enabled = ?');
		values.push(patch.isEnabled ? 1 : 0);
	}
	if (patch.verifiedAt !== undefined) {
		sets.push('verified_at = ?');
		values.push(patch.verifiedAt);
	}
	if (patch.color !== undefined) {
		sets.push('color = ?');
		values.push(patch.color);
	}
	if (sets.length === 0) return;

	values.push(id);
	getDb()
		.prepare(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`)
		.run(...(values as (string | number | null)[]));
}

export function deleteServer(id: string): void {
	getDb().prepare('DELETE FROM servers WHERE id = ?').run(id);
}

export function getSharedModels(serverId: string): string[] {
	return (
		getDb()
			.prepare('SELECT model_name FROM shared_models WHERE server_id = ? ORDER BY model_name')
			.all(serverId) as { model_name: string }[]
	).map((row) => row.model_name);
}

/** Display-only labels for a server's models, keyed by the real model id. */
export function getModelLabels(serverId: string): Record<string, string> {
	const rows = getDb()
		.prepare('SELECT model_name, label FROM model_labels WHERE server_id = ?')
		.all(serverId) as { model_name: string; label: string }[];
	return Object.fromEntries(rows.map((row) => [row.model_name, row.label]));
}

/** Replaces the whole set; blank labels are dropped so the table stays sparse. */
export function setModelLabels(serverId: string, labels: Record<string, string>): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM model_labels WHERE server_id = ?').run(serverId);
		const insert = db.prepare(
			'INSERT INTO model_labels (server_id, model_name, label) VALUES (?, ?, ?)'
		);
		for (const [name, label] of Object.entries(labels)) {
			const trimmed = label?.trim();
			if (trimmed) insert.run(serverId, name, trimmed);
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

export function setSharedModels(serverId: string, models: string[]): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM shared_models WHERE server_id = ?').run(serverId);
		const insert = db.prepare('INSERT INTO shared_models (server_id, model_name) VALUES (?, ?)');
		for (const model of models) insert.run(serverId, model);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

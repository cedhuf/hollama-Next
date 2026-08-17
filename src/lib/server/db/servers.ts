import { randomUUID } from 'node:crypto';

import type { ModelPrice } from '$lib/connections';
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
	/** Badge accent, assigned by the client so it can avoid colours already in use. */
	color?: string | null;
}): ServerRow {
	const id = randomUUID();
	getDb()
		.prepare(
			`INSERT INTO servers
			 (id, owner_user_id, connection_type, base_url, api_key_enc, label, model_filter, is_enabled, color, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
			input.color ?? null,
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

/** What a million tokens costs on this connection, keyed by the real model id. */
export function getModelPricing(serverId: string): Record<string, ModelPrice> {
	const rows = getDb()
		.prepare('SELECT model_name, input, output, currency FROM model_pricing WHERE server_id = ?')
		.all(serverId) as {
		model_name: string;
		input: number | null;
		output: number | null;
		currency: string | null;
	}[];

	return Object.fromEntries(
		rows.map((row) => [
			row.model_name,
			{
				input: row.input ?? undefined,
				output: row.output ?? undefined,
				currency: row.currency ?? undefined
			}
		])
	);
}

/**
 * Replaces the whole set, dropping anything with no figure at all.
 *
 * A model priced at zero keeps its row: free is a price, and it is not the same
 * answer as "nobody has said". The meter counts the first and skips the second.
 */
export function setModelPricing(serverId: string, pricing: Record<string, ModelPrice>): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM model_pricing WHERE server_id = ?').run(serverId);
		const insert = db.prepare(
			`INSERT INTO model_pricing (server_id, model_name, input, output, currency)
			 VALUES (?, ?, ?, ?, ?)`
		);
		for (const [name, price] of Object.entries(pricing)) {
			if (price?.input == null && price?.output == null) continue;
			insert.run(serverId, name, price.input ?? null, price.output ?? null, price.currency ?? null);
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

/**
 * Shared models nobody has priced, per system connection.
 *
 * The hole a credit limit has if this is not checked: a model with no price is
 * not counted, so a limit that is in force everywhere else is simply absent on
 * that one — and it is absent for everybody, silently, because it was an
 * oversight rather than a decision. An administrator has to be able to see the
 * list, and the relay has to refuse it in the meantime.
 */
export function unpricedSharedModels(): { serverId: string; label: string; models: string[] }[] {
	const rows = getDb()
		.prepare(
			`SELECT s.id AS server_id, COALESCE(s.label, s.base_url) AS label, m.model_name
			 FROM shared_models m
			 JOIN servers s ON s.id = m.server_id
			 LEFT JOIN model_pricing p
			   ON p.server_id = m.server_id AND p.model_name = m.model_name
			 WHERE s.owner_user_id IS NULL AND s.is_enabled = 1 AND p.model_name IS NULL
			 ORDER BY label, m.model_name`
		)
		.all() as { server_id: string; label: string; model_name: string }[];

	const byServer = new Map<string, { serverId: string; label: string; models: string[] }>();
	for (const row of rows) {
		const entry = byServer.get(row.server_id) ?? {
			serverId: row.server_id,
			label: row.label,
			models: []
		};
		entry.models.push(row.model_name);
		byServer.set(row.server_id, entry);
	}
	return [...byServer.values()];
}

/**
 * The currencies this instance's prices are written in.
 *
 * One is the answer a figure can be labelled with; several is the answer that
 * has to be admitted to, since nothing is converted. Empty means nothing is
 * priced, and then no figure is worth labelling at all.
 */
export function pricedCurrencies(): string[] {
	const rows = getDb()
		.prepare(
			`SELECT DISTINCT COALESCE(p.currency, 'USD') AS currency
			 FROM model_pricing p JOIN servers s ON s.id = p.server_id
			 WHERE s.owner_user_id IS NULL AND (p.input IS NOT NULL OR p.output IS NOT NULL)`
		)
		.all() as { currency: string }[];
	return rows.map((row) => row.currency).sort();
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

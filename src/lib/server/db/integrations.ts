import { randomUUID } from 'node:crypto';

import {
	normaliseConfig,
	type IntegrationConfig,
	type IntegrationKind,
	type IntegrationView
} from '$lib/integrations';
import { decrypt, encrypt } from '$lib/server/crypto';

import { getDb } from './index';

export interface IntegrationRow {
	id: string;
	owner_user_id: string;
	kind: string;
	label: string | null;
	config: string;
	secret_enc: string | null;
	is_enabled: number;
	created_at: string;
}

/**
 * An integration with its settings parsed and its credential left alone.
 *
 * What the runtime works with. The secret is fetched separately, by the one
 * function that needs it, so a record can be logged or compared without any
 * risk of carrying a key into a place keys should not be.
 */
export interface IntegrationRecord {
	id: string;
	ownerUserId: string;
	kind: IntegrationKind;
	label: string;
	config: IntegrationConfig;
	hasSecret: boolean;
	enabled: boolean;
	createdAt: string;
}

function toRecord(row: IntegrationRow): IntegrationRecord {
	const kind = row.kind as IntegrationKind;
	let raw: unknown = {};
	try {
		raw = JSON.parse(row.config);
	} catch {
		// A row whose JSON cannot be read is a row that will be normalised into
		// defaults, which is inert: nothing runs without an address and a key.
	}
	return {
		id: row.id,
		ownerUserId: row.owner_user_id,
		kind,
		label: row.label ?? '',
		config: normaliseConfig(kind, raw),
		hasSecret: !!row.secret_enc,
		enabled: !!row.is_enabled,
		createdAt: row.created_at
	};
}

/** What a browser is allowed to know about one. */
export function toIntegrationView(record: IntegrationRecord): IntegrationView {
	return {
		id: record.id,
		kind: record.kind,
		label: record.label,
		enabled: record.enabled,
		hasSecret: record.hasSecret,
		config: record.config,
		createdAt: record.createdAt
	};
}

export function listIntegrations(userId: string): IntegrationRecord[] {
	const rows = getDb()
		.prepare('SELECT * FROM integrations WHERE owner_user_id = ? ORDER BY created_at')
		.all(userId) as unknown as IntegrationRow[];
	return rows.map(toRecord);
}

/** Every integration on the instance, for the supervisor and for the admin view. */
export function listAllIntegrations(): IntegrationRecord[] {
	const rows = getDb()
		.prepare('SELECT * FROM integrations ORDER BY created_at')
		.all() as unknown as IntegrationRow[];
	return rows.map(toRecord);
}

export function getIntegration(id: string): IntegrationRecord | null {
	const row = getDb().prepare('SELECT * FROM integrations WHERE id = ?').get(id) as unknown as
		IntegrationRow | undefined;
	return row ? toRecord(row) : null;
}

/** The decrypted credential, for server-side use only. */
export function getIntegrationSecret(id: string): string | null {
	const row = getDb().prepare('SELECT secret_enc FROM integrations WHERE id = ?').get(id) as
		{ secret_enc: string | null } | undefined;
	return row?.secret_enc ? decrypt(row.secret_enc) : null;
}

export function createIntegration(input: {
	ownerUserId: string;
	kind: IntegrationKind;
	label?: string | null;
	config: unknown;
	secret?: string | null;
	enabled?: boolean;
}): IntegrationRecord {
	const id = randomUUID();
	getDb()
		.prepare(
			`INSERT INTO integrations (id, owner_user_id, kind, label, config, secret_enc, is_enabled, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			input.ownerUserId,
			input.kind,
			input.label?.trim() || null,
			JSON.stringify(normaliseConfig(input.kind, input.config)),
			input.secret ? encrypt(input.secret) : null,
			input.enabled === false ? 0 : 1,
			new Date().toISOString()
		);
	return getIntegration(id)!;
}

/**
 * Save an edit. An absent field is left as it was.
 *
 * The credential follows the rule the provider keys already follow: omit it to
 * keep the stored one, send an empty string to clear it. A form that cannot
 * read a key back has no other way to say "leave it alone".
 */
export function updateIntegration(
	id: string,
	input: {
		label?: string | null;
		config?: unknown;
		secret?: string | null;
		enabled?: boolean;
	}
): IntegrationRecord | null {
	const current = getIntegration(id);
	if (!current) return null;

	const sets: string[] = [];
	const values: (string | number | null)[] = [];

	if (input.label !== undefined) {
		sets.push('label = ?');
		values.push(input.label?.trim() || null);
	}
	if (input.config !== undefined) {
		sets.push('config = ?');
		values.push(JSON.stringify(normaliseConfig(current.kind, input.config)));
	}
	if (input.secret !== undefined) {
		sets.push('secret_enc = ?');
		values.push(input.secret ? encrypt(input.secret) : null);
	}
	if (input.enabled !== undefined) {
		sets.push('is_enabled = ?');
		values.push(input.enabled ? 1 : 0);
	}
	if (!sets.length) return current;

	getDb()
		.prepare(`UPDATE integrations SET ${sets.join(', ')} WHERE id = ?`)
		.run(...values, id);
	return getIntegration(id);
}

export function deleteIntegration(id: string): void {
	getDb().prepare('DELETE FROM integrations WHERE id = ?').run(id);
}

/** How long a handled activation is remembered. Comfortably past the server's own retention. */
const SEEN_RETENTION_DAYS = 7;

/**
 * Claim an activation, once.
 *
 * Returns true the first time and false forever after, and it is the insert
 * itself that decides: two workers, or a worker and its own restarted twin,
 * race on a primary key rather than on a check followed by a write.
 */
export function claimSeen(integrationId: string, key: string): boolean {
	const result = getDb()
		.prepare(
			`INSERT OR IGNORE INTO integration_seen (integration_id, key, seen_at) VALUES (?, ?, ?)`
		)
		.run(integrationId, key, new Date().toISOString());
	return result.changes > 0;
}

/**
 * Whether an activation has already been dealt with, without claiming it.
 *
 * The read-only half of `claimSeen`, and the difference matters: this is asked
 * first, of everything the list hands back, so that work already done is passed
 * over in silence. Claiming decides who acts; this decides whether to look.
 */
export function hasSeen(integrationId: string, key: string): boolean {
	const row = getDb()
		.prepare('SELECT 1 AS present FROM integration_seen WHERE integration_id = ? AND key = ?')
		.get(integrationId, key) as { present: number } | undefined;
	return !!row;
}

export function sweepSeen(integrationId: string): void {
	const cutoff = new Date(Date.now() - SEEN_RETENTION_DAYS * 86_400_000).toISOString();
	getDb()
		.prepare('DELETE FROM integration_seen WHERE integration_id = ? AND seen_at < ?')
		.run(integrationId, cutoff);
}

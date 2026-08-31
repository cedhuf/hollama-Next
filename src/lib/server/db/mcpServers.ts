import { randomUUID } from 'node:crypto';

import { normaliseMcpUrl, slugify, type McpServerView } from '$lib/mcp';
import { decrypt, encrypt } from '$lib/server/crypto';

import { getDb } from './index';

/**
 * The MCP servers an account has configured.
 *
 * The same shape the integrations table already uses, for the same reasons: the
 * owner's switch and the administrator's suspension are two columns because they
 * answer two questions, and the credential lives encrypted and is fetched by the
 * one function that needs it, so a record can be logged or handed to a browser
 * without any risk of carrying a token somewhere tokens should not be.
 */

export interface McpServerRow {
	id: string;
	owner_user_id: string;
	label: string;
	slug: string;
	url: string;
	secret_enc: string | null;
	is_enabled: number;
	blocked: number;
	created_at: string;
	tools: string | null;
	tools_at: string | null;
	disabled_groups: string | null;
}

export interface McpServerRecord {
	id: string;
	ownerUserId: string;
	label: string;
	slug: string;
	url: string;
	hasSecret: boolean;
	enabled: boolean;
	blocked: boolean;
	createdAt: string;
	/** The catalogue this server last answered with, by name. */
	tools: string[];
	/** When it said so. Null for a server nobody has asked yet. */
	toolsAt: string | null;
	/** Groups this account has switched off, by name. A group is a server behind a gateway. */
	disabledGroups: string[];
}

function toRecord(row: McpServerRow): McpServerRecord {
	return {
		id: row.id,
		ownerUserId: row.owner_user_id,
		label: row.label,
		slug: row.slug,
		url: row.url,
		hasSecret: !!row.secret_enc,
		enabled: !!row.is_enabled,
		blocked: !!row.blocked,
		createdAt: row.created_at,
		tools: parseTools(row.tools),
		toolsAt: row.tools_at,
		disabledGroups: parseTools(row.disabled_groups)
	};
}

/** A stored catalogue, or none. A row that will not parse is a row nobody has asked yet. */
function parseTools(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((name): name is string => typeof name === 'string')
			: [];
	} catch {
		return [];
	}
}

/** What a browser is allowed to know about one. */
export function toMcpServerView(record: McpServerRecord): McpServerView {
	return {
		id: record.id,
		label: record.label,
		slug: record.slug,
		url: record.url,
		enabled: record.enabled,
		blocked: record.blocked,
		hasSecret: record.hasSecret,
		createdAt: record.createdAt,
		tools: record.tools,
		toolsAt: record.toolsAt,
		disabledGroups: record.disabledGroups
	};
}

export function listMcpServers(userId: string): McpServerRecord[] {
	const rows = getDb()
		.prepare('SELECT * FROM mcp_servers WHERE owner_user_id = ? ORDER BY created_at')
		.all(userId) as unknown as McpServerRow[];
	return rows.map(toRecord);
}

/** Every server on the instance, for the admin view. */
export function listAllMcpServers(): McpServerRecord[] {
	const rows = getDb()
		.prepare('SELECT * FROM mcp_servers ORDER BY created_at')
		.all() as unknown as McpServerRow[];
	return rows.map(toRecord);
}

export function getMcpServer(id: string): McpServerRecord | null {
	const row = getDb().prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as unknown as
		McpServerRow | undefined;
	return row ? toRecord(row) : null;
}

/** The decrypted token, for server-side use only. */
export function getMcpServerSecret(id: string): string | null {
	const row = getDb().prepare('SELECT secret_enc FROM mcp_servers WHERE id = ?').get(id) as
		{ secret_enc: string | null } | undefined;
	return row?.secret_enc ? decrypt(row.secret_enc) : null;
}

/**
 * A slug this owner is not already using.
 *
 * Suffixed rather than refused: the label is the user's to choose, including
 * choosing the same one twice, and a form that rejects "Mail" because another
 * server slugged to `mail` would be explaining an implementation detail. The
 * suffix is visible in the tools tab, which is where it means something.
 */
function freeSlug(ownerUserId: string, label: string, exceptId?: string): string {
	const base = slugify(label);
	const taken = new Set(
		listMcpServers(ownerUserId)
			.filter((server) => server.id !== exceptId)
			.map((server) => server.slug)
	);

	if (!taken.has(base)) return base;
	for (let n = 2; n < 100; n++) {
		const candidate = `${base}_${n}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${base}_${randomUUID().slice(0, 6)}`;
}

export function createMcpServer(input: {
	ownerUserId: string;
	label: string;
	url: string;
	secret?: string | null;
	enabled?: boolean;
}): McpServerRecord {
	const url = normaliseMcpUrl(input.url);
	if (!url) throw new Error('Not a valid MCP server address');

	const label = input.label.trim() || 'MCP';
	const id = randomUUID();
	getDb()
		.prepare(
			`INSERT INTO mcp_servers (id, owner_user_id, label, slug, url, secret_enc, is_enabled, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			input.ownerUserId,
			label,
			freeSlug(input.ownerUserId, label),
			url,
			input.secret ? encrypt(input.secret) : null,
			input.enabled === false ? 0 : 1,
			new Date().toISOString()
		);
	return getMcpServer(id)!;
}

/**
 * Save an edit. An absent field is left as it was.
 *
 * The token follows the rule the provider keys and the integration credentials
 * already follow: omit it to keep the stored one, send an empty string to clear
 * it. A form that cannot read a secret back has no other way to say "leave it
 * alone".
 */
export function updateMcpServer(
	id: string,
	input: {
		label?: string;
		url?: string;
		secret?: string | null;
		enabled?: boolean;
		disabledGroups?: string[];
	}
): McpServerRecord | null {
	const current = getMcpServer(id);
	if (!current) return null;

	const sets: string[] = [];
	const values: (string | number | null)[] = [];

	if (input.label !== undefined) {
		const label = input.label.trim() || current.label;
		sets.push('label = ?', 'slug = ?');
		values.push(label, freeSlug(current.ownerUserId, label, id));
	}
	if (input.url !== undefined) {
		const url = normaliseMcpUrl(input.url);
		if (!url) throw new Error('Not a valid MCP server address');
		sets.push('url = ?');
		values.push(url);
	}
	if (input.secret !== undefined) {
		sets.push('secret_enc = ?');
		values.push(input.secret ? encrypt(input.secret) : null);
	}
	if (input.enabled !== undefined) {
		sets.push('is_enabled = ?');
		values.push(input.enabled ? 1 : 0);
	}
	if (input.disabledGroups !== undefined) {
		sets.push('disabled_groups = ?');
		values.push(JSON.stringify(input.disabledGroups.filter((name) => typeof name === 'string')));
	}
	if (!sets.length) return current;

	getDb()
		.prepare(`UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`)
		.run(...values, id);
	return getMcpServer(id);
}

/**
 * Suspend one, or lift the suspension. An administrator's verb, and only theirs.
 *
 * Its own function rather than a field on `updateMcpServer`, so that the route an
 * owner reaches cannot set it by accident or by a crafted body.
 */
export function setMcpServerBlocked(id: string, blocked: boolean): void {
	getDb()
		.prepare('UPDATE mcp_servers SET blocked = ? WHERE id = ?')
		.run(blocked ? 1 : 0, id);
}

/**
 * Write down what a server just answered with.
 *
 * Names only, and replaced wholesale rather than merged: a tool that has gone
 * from the catalogue has to disappear from ours too, and a union of every list
 * ever seen would keep it forever.
 */
export function setMcpServerTools(id: string, tools: string[]): void {
	getDb()
		.prepare('UPDATE mcp_servers SET tools = ?, tools_at = ? WHERE id = ?')
		.run(JSON.stringify(tools), new Date().toISOString(), id);
}

export function deleteMcpServer(id: string): void {
	getDb().prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

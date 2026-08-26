import { randomUUID } from 'node:crypto';

import { parseLoadOptions, type LoadOptions } from '$lib/chat/options';
import {
	guessModelKind,
	hasPriceFigure,
	MODEL_KINDS,
	reportedCurrency,
	type ConnectionType,
	type ModelKind,
	type ModelPrice
} from '$lib/connections';
import { decrypt, encrypt } from '$lib/server/crypto';

import { getDb } from './index';

export interface ServerRow {
	id: string;
	owner_user_id: string | null; // NULL = system/admin-shared
	connection_type: string;
	base_url: string;
	/** Where image endpoints live, when that is not under `base_url`. NULL = same. */
	image_base_url: string | null;
	api_key_enc: string | null;
	label: string | null;
	model_filter: string | null;
	is_enabled: number;
	/** ISO date of the last successful sync; NULL when never verified. */
	verified_at: string | null;
	/** Badge colour override; NULL falls back to the provider default. */
	color: string | null;
	/** JSON `LoadOptions` for an Ollama connection; NULL means nothing was set. */
	load_options: string | null;
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
		ServerRow | undefined;
}

/** The decrypted API key for a server, for server-side use only (the proxy). */
export function getServerApiKey(server: ServerRow): string | null {
	return server.api_key_enc ? decrypt(server.api_key_enc) : null;
}

export function createServer(input: {
	ownerUserId: string | null;
	connectionType: string;
	baseUrl: string;
	imageBaseUrl?: string | null;
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
			 (id, owner_user_id, connection_type, base_url, image_base_url, api_key_enc, label, model_filter, is_enabled, color, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			input.ownerUserId,
			input.connectionType,
			input.baseUrl,
			input.imageBaseUrl || null,
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
		imageBaseUrl?: string | null;
		apiKey?: string | null;
		label?: string | null;
		modelFilter?: string | null;
		isEnabled?: boolean;
		verifiedAt?: string | null;
		color?: string | null;
		loadOptions?: LoadOptions | null;
	}
): void {
	const sets: string[] = [];
	const values: unknown[] = [];

	if (patch.baseUrl !== undefined) {
		sets.push('base_url = ?');
		values.push(patch.baseUrl);
	}
	if (patch.imageBaseUrl !== undefined) {
		// Blank is stored as NULL, so "same base as chat" has one representation
		// rather than two that the proxy would have to test for separately.
		sets.push('image_base_url = ?');
		values.push(patch.imageBaseUrl?.trim() || null);
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
	if (patch.loadOptions !== undefined) {
		// Filtered on the way in as well as on the way out: the column is the only
		// copy, so a field that should not be there is a field that gets sent to
		// Ollama on every turn until somebody notices. An empty set is stored as
		// NULL so "nothing configured" has one representation rather than two.
		const kept = parseLoadOptions(patch.loadOptions);
		sets.push('load_options = ?');
		values.push(Object.keys(kept).length ? JSON.stringify(kept) : null);
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

/** What each of this connection's models costs, keyed by the real model id. */
export function getModelPricing(serverId: string): Record<string, ModelPrice> {
	const rows = getDb()
		.prepare(
			'SELECT model_name, unit, input, output, rate, currency FROM model_pricing WHERE server_id = ?'
		)
		.all(serverId) as {
		model_name: string;
		unit: string | null;
		input: number | null;
		output: number | null;
		rate: number | null;
		currency: string | null;
	}[];

	return Object.fromEntries(
		rows.map((row) => [
			row.model_name,
			{
				// NULL is the token unit, which is what every row written before units
				// existed is. Left absent rather than filled in, so the shape the client
				// gets back is the shape it sent.
				unit: (row.unit as ModelPrice['unit']) ?? undefined,
				input: row.input ?? undefined,
				output: row.output ?? undefined,
				rate: row.rate ?? undefined,
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
 * Which field carries the figure depends on the unit, so `hasPriceFigure`
 * answers rather than a test on `input` that only ever knew about tokens.
 */
export function setModelPricing(serverId: string, pricing: Record<string, ModelPrice>): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM model_pricing WHERE server_id = ?').run(serverId);
		const insert = db.prepare(
			`INSERT INTO model_pricing (server_id, model_name, unit, input, output, rate, currency)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		);
		for (const [name, price] of Object.entries(pricing)) {
			// A unit with no figure is still an answer worth keeping: it is how an
			// administrator records that a model is billed per minute before they
			// have looked up the rate. It is not a price, and nothing counts it.
			if (!hasPriceFigure(price) && !(price?.unit && price.unit !== 'token')) continue;
			insert.run(
				serverId,
				name,
				price.unit ?? null,
				price.input ?? null,
				price.output ?? null,
				price.rate ?? null,
				price.currency ?? null
			);
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

/**
 * What each of this connection's models is for, keyed by the real model id.
 *
 * Sparse: only the ones somebody corrected. Everything else is answered by
 * `modelKind()` reading the name, on whichever side is asking.
 */
export function getModelKinds(serverId: string): Record<string, ModelKind> {
	const rows = getDb()
		.prepare('SELECT model_name, kind FROM model_kinds WHERE server_id = ?')
		.all(serverId) as { model_name: string; kind: string }[];

	return Object.fromEntries(
		rows
			.filter((row) => MODEL_KINDS.includes(row.kind as ModelKind))
			.map((row) => [row.model_name, row.kind as ModelKind])
	);
}

/**
 * Keep what a provider said about its own models, without touching what a person
 * said about them.
 *
 * A guess read from a name is the app's answer of last resort, and for some
 * models it is simply wrong with no way to be right: nothing about
 * `fish-audio/s1` reveals that it talks, and nothing about
 * `fish-audio/transcribe-1` reveals that it listens, yet the provider will say
 * both outright when asked. Once it has, that answer should survive the request
 * that learned it, because the next thing to need it is the server checking that
 * the model somebody chose can do what they are asking of it.
 *
 * Written on read, which is the one place it can be: the answer arrives with the
 * catalogue. Kept honest by two rules. A row that already exists is never
 * touched, so a correction made in Models and prices always wins. And a
 * declaration the guess would have reached anyway is not written at all, so the
 * table stays a list of what is *not* obvious.
 */
export function rememberModelKinds(serverId: string, kinds: Record<string, ModelKind>): void {
	const entries = Object.entries(kinds).filter(
		([name, kind]) => MODEL_KINDS.includes(kind) && kind !== guessModelKind(name)
	);
	if (!entries.length) return;

	const insert = getDb().prepare(
		'INSERT OR IGNORE INTO model_kinds (server_id, model_name, kind) VALUES (?, ?, ?)'
	);
	for (const [name, kind] of entries) insert.run(serverId, name, kind);
}

/**
 * Replaces the whole set, keeping only what the guess would not already say.
 *
 * A row that agrees with `guessModelKind` is a row that says nothing, and it
 * would go stale the day the heuristic improves. Storing only the corrections
 * means the table stays small and the guess keeps getting better underneath it.
 */
export function setModelKinds(serverId: string, kinds: Record<string, ModelKind>): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM model_kinds WHERE server_id = ?').run(serverId);
		const insert = db.prepare(
			'INSERT INTO model_kinds (server_id, model_name, kind) VALUES (?, ?, ?)'
		);
		for (const [name, kind] of Object.entries(kinds)) {
			if (!MODEL_KINDS.includes(kind)) continue;
			if (kind === guessModelKind(name)) continue;
			insert.run(serverId, name, kind);
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
 * A row that only records a unit does not count as priced here: the join asks for
 * a figure, not for a row, because a unit is what somebody wrote down on the way
 * to a price rather than the price itself.
 *
 * The hole a credit limit has if this is not checked: a model with no price is
 * not counted, so a limit that is in force everywhere else is simply absent on
 * that one, and it is absent for everybody, silently, because it was an
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
			  AND (p.input IS NOT NULL OR p.output IS NOT NULL OR p.rate IS NOT NULL)
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
 * The currencies this instance's spending can be counted in.
 *
 * One is the answer a figure can be labelled with; several is the answer that
 * has to be admitted to, since nothing is converted anywhere. Empty means there
 * is genuinely nothing to label, and then no figure is worth a unit.
 *
 * Two sources, because there are now two ways a call gets a cost. The table is
 * the older one, and it used to be the only one, which is why this function used
 * to read nothing else. Then a connection that reports its own costs stopped
 * needing any prices at all, and an instance whose only connection is one of
 * those has an empty table by design. Reading the table alone would answer
 * "no currency" and render a twenty pound ceiling as a bare `20`, which is worse
 * than no figure: a ceiling whose unit is a guess cannot be acted on.
 *
 * Only enabled system connections count towards the second source. A disabled one
 * bills nothing, and a personal one is somebody's own key and own bill, neither
 * counted here nor limited.
 */
export function spendCurrencies(): string[] {
	const db = getDb();

	const priced = db
		.prepare(
			`SELECT DISTINCT COALESCE(p.currency, 'USD') AS currency
			 FROM model_pricing p JOIN servers s ON s.id = p.server_id
			 WHERE s.owner_user_id IS NULL
			   AND (p.input IS NOT NULL OR p.output IS NOT NULL OR p.rate IS NOT NULL)`
		)
		.all() as { currency: string }[];

	const reporting = db
		.prepare(
			`SELECT DISTINCT connection_type FROM servers
			 WHERE owner_user_id IS NULL AND is_enabled = 1`
		)
		.all() as { connection_type: string }[];

	const found = new Set(priced.map((row) => row.currency));
	for (const row of reporting) {
		const currency = reportedCurrency(row.connection_type as ConnectionType);
		if (currency) found.add(currency);
	}

	return [...found].sort();
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

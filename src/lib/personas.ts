import { get } from 'svelte/store';

import { personasStore, sessionsStore } from '$lib/localStorage';
import { saveSession, type Session, type SessionSummary } from '$lib/sessions';
import type { Model } from '$lib/settings';
import { generateRandomId } from '$lib/utils';

export interface PersonaParams {
	temperature?: number;
	stop?: string[];
}

/**
 * Where a persona came from, for the ones nobody here wrote.
 *
 * One notion rather than three. There used to be `installedFrom` for an admin's
 * shared persona and nothing at all for a file someone dropped on the page, which
 * meant the answer to "is this mine?" was spelled differently depending on how it
 * had arrived. The catalogue makes that a third case, and three spellings of the
 * same question is where it stops being answerable.
 *
 * A persona without a source is one you wrote.
 */
export interface PersonaSource {
	origin: 'official' | 'community' | 'admin' | 'file';
	/** Its id where it came from: a catalogue id, or the shared persona's id. */
	id?: string;
	/** The revision installed, so a newer one can be noticed later. */
	revision?: number;
	/**
	 * What it said when it was installed, from `personaDigest`.
	 *
	 * Two comparisons rather than one, and they answer different questions.
	 * Against the persona as it stands now: have *you* changed it. Against the
	 * store's current listing: has the *store* changed it. Without this one, a new
	 * revision upstream would make an untouched persona look edited, which is the
	 * wrong thing to tell someone and the wrong thing to offer them.
	 */
	digest?: string;
}

/**
 * The catalogue or shared id a persona was installed from, whichever field says so.
 *
 * `installedFrom` is what personas installed before `source` existed carry, and
 * they are already in people's stores. Read in one place so nothing else has to
 * know there were ever two fields.
 */
export function personaOrigin(persona: Persona): string | undefined {
	return persona.source?.id ?? persona.installedFrom;
}

/**
 * A reusable "character": a named bundle of a system prompt (its soul), a base
 * model, an avatar and a few capabilities. Created in the Library, chatted with
 * as an ongoing relationship. A persona is a *template* — when a chat starts its
 * values are snapshotted into the session, so the persona never acts as a live
 * resolution layer (which would fight the per-session/per-model/global resolver).
 */
export interface Persona {
	id: string;
	name: string;
	/** Short, human one-liner shown under the name (OpenWebUI `meta.description`). */
	tagline: string;
	/** Accent colour for the initials avatar; stable per persona. */
	avatarColor: string;
	/** Optional image avatar as a data URI (OpenWebUI `meta.profile_image_url`). */
	avatarImage?: string;
	/** Id of a glyph the app draws itself, tinted with `avatarColor`. See `personaGlyphs`. */
	avatarGlyph?: string;
	/** The "soul": the full system prompt (OpenWebUI `params.system`). */
	systemPrompt: string;
	/** Opening line, shown as the first assistant bubble when the chat starts. */
	greeting?: string;
	/** Model name; resolved to a concrete server when a chat is created. */
	modelName: string;
	params?: PersonaParams;
	webSearch?: boolean;
	suggestions?: string[];
	tags?: string[];
	knowledgeIds?: string[];
	/** Admin-shared with users (server mode). */
	shared?: boolean;
	/** Where this persona came from, when it was not written here. */
	source?: PersonaSource;
	/**
	 * Superseded by `source`, read for personas installed before it existed.
	 *
	 * @deprecated Use `source.id`.
	 */
	installedFrom?: string;
	/** The single ongoing conversation bound to this persona. */
	sessionId?: string;
	/** Reserved for future auto-summarised long-term memory. */
	memory?: string;
	createdAt: string;
	updatedAt: string;
}

/** Theme-safe mid-tone accents for the initials avatar. */
export const PERSONA_AVATAR_COLORS = [
	'#7F77DD',
	'#1D9E75',
	'#D85A30',
	'#D4537E',
	'#378ADD',
	'#BA7517',
	'#5DCAA5',
	'#888780'
];

/** Pick a stable colour from a seed (the persona id), so avatars don't reshuffle. */
export function pickAvatarColor(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
	return PERSONA_AVATAR_COLORS[hash % PERSONA_AVATAR_COLORS.length];
}

/** Up-to-two-letter initials for the fallback avatar. */
export function personaInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function newPersona(id: string = generateRandomId()): Persona {
	const now = new Date().toISOString();
	return {
		id,
		name: '',
		tagline: '',
		avatarColor: pickAvatarColor(id),
		systemPrompt: '',
		modelName: '',
		createdAt: now,
		updatedAt: now
	};
}

export const loadPersona = (id: string): Persona => {
	const existing = get(personasStore)?.find((p) => p.id === id);
	return existing ?? newPersona(id);
};

export const savePersona = (persona: Persona): void => {
	personasStore.upsert({ ...persona, updatedAt: new Date().toISOString() });
};

export const deletePersona = (id: string): void => {
	personasStore.remove(id);
};

/**
 * Open the persona's single ongoing conversation, creating it (seeded from the
 * persona) the first time. The persona is a template: its values are snapshotted
 * into the session here, so the chat stays self-contained afterwards. Returns the
 * session id for the caller to navigate to.
 */
export function launchPersona(persona: Persona, models: Model[]): string {
	const sessions = get(sessionsStore) || [];
	if (persona.sessionId && sessions.some((s) => s.id === persona.sessionId)) {
		return persona.sessionId;
	}

	const id = generateRandomId();
	const model = models.find((m) => m.name === persona.modelName);
	const session: Session = {
		id,
		messages: persona.greeting?.trim() ? [{ role: 'assistant', content: persona.greeting }] : [],
		systemPrompt: { role: 'system', content: persona.systemPrompt },
		systemPromptEdited: true, // fixed by the persona — don't auto-resolve over it
		options: persona.params?.temperature != null ? { temperature: persona.params.temperature } : {},
		model,
		title: persona.name,
		personaId: persona.id,
		updatedAt: new Date().toISOString()
	};

	saveSession(session);
	savePersona({ ...persona, sessionId: id });
	return id;
}

/**
 * Personas you've actually talked to — i.e. whose bound conversation still
 * exists — most recent first. Drives both the sidebar launchers and the home
 * "recent personas" row. A persona leaves this list when its conversation is
 * deleted (see `unbindPersonaSession`).
 */
export function conversedPersonas(personas: Persona[], sessions: SessionSummary[]): Persona[] {
	const updatedAt: Record<string, string> = {};
	for (const s of sessions) updatedAt[s.id] = s.updatedAt ?? '';
	return personas
		.filter((p) => p.sessionId && p.sessionId in updatedAt)
		.sort((a, b) => (updatedAt[b.sessionId!] > updatedAt[a.sessionId!] ? 1 : -1));
}

/** Detach a persona from a conversation that was just deleted, so it leaves the launchers. */
export function unbindPersonaSession(sessionId: string): void {
	const persona = (get(personasStore) || []).find((p) => p.sessionId === sessionId);
	if (persona) savePersona({ ...persona, sessionId: undefined });
}

/** Install a shared persona as an editable personal copy (the "Install" action). */
export function installPersona(persona: Persona): Persona {
	const copy = fromNative({ ...persona, shared: false });
	copy.source = { origin: 'admin', id: persona.id };
	savePersona(copy);
	return copy;
}

// --- Import / export -------------------------------------------------------
// We read our own native format *and* OpenWebUI model exports, so the wide
// ecosystem of existing personas can be imported. Native export stays clean.

interface OpenWebUIModelMeta {
	description?: string;
	profile_image_url?: string;
	suggestion_prompts?: { content?: string }[];
	tags?: { name?: string }[];
	capabilities?: Record<string, boolean | undefined>;
}

interface OpenWebUIModel {
	id?: string;
	name?: string;
	base_model_id?: string;
	meta?: OpenWebUIModelMeta;
	params?: { system?: string; temperature?: number; stop?: string[] | null };
}

function isOpenWebUIModel(o: Record<string, unknown>): boolean {
	return 'base_model_id' in o || 'params' in o || 'meta' in o;
}

function fromOpenWebUI(m: OpenWebUIModel): Persona {
	const id = generateRandomId();
	const now = new Date().toISOString();
	const stop = Array.isArray(m.params?.stop) ? m.params?.stop : undefined;
	const params: PersonaParams = {};
	if (typeof m.params?.temperature === 'number') params.temperature = m.params.temperature;
	if (stop && stop.length) params.stop = stop;

	return {
		id,
		name: m.name?.trim() || 'Imported persona',
		tagline: m.meta?.description?.trim() || '',
		avatarColor: pickAvatarColor(id),
		avatarImage: m.meta?.profile_image_url || undefined,
		systemPrompt: m.params?.system ?? '',
		modelName: m.base_model_id?.trim() || '',
		params: Object.keys(params).length ? params : undefined,
		webSearch: m.meta?.capabilities?.web_search || undefined,
		suggestions: (m.meta?.suggestion_prompts ?? [])
			.map((s) => s.content?.trim() || '')
			.filter(Boolean),
		tags: (m.meta?.tags ?? []).map((t) => t.name?.trim() || '').filter(Boolean),
		createdAt: now,
		updatedAt: now
	};
}

function fromNative(p: Partial<Persona>): Persona {
	const base = newPersona();
	return {
		...base,
		...p,
		id: base.id, // fresh id so imports never collide with existing personas
		sessionId: undefined, // don't carry a stale conversation binding
		source: undefined, // whoever installs it says where it came from
		installedFrom: undefined,
		avatarColor: p.avatarColor || base.avatarColor,
		createdAt: base.createdAt,
		updatedAt: base.updatedAt
	};
}

/** Parse a pasted/dropped JSON value into personas (native or OpenWebUI). */
export function parsePersonasImport(json: unknown): Persona[] {
	const items = Array.isArray(json) ? json : [json];
	const personas: Persona[] = [];
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		if ('systemPrompt' in o || 'modelName' in o) personas.push(fromNative(o as Partial<Persona>));
		else if (isOpenWebUIModel(o)) personas.push(fromOpenWebUI(o as OpenWebUIModel));
	}
	for (const persona of personas) persona.source = { origin: 'file' };
	return personas;
}

import { get } from 'svelte/store';

import { effectivePrompts } from '$lib/appPrompts';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { repository } from '$lib/data';
import { resolvePrompt } from '$lib/defaultPrompts';
import { LANGUAGE_LABELS } from '$lib/i18n';
import { personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
import { saveSession, type Session, type SessionSummary } from '$lib/sessions';
import type { Model } from '$lib/settings';
import { generateRandomId } from '$lib/utils';

export interface PersonaParams {
	temperature?: number;
	stop?: string[];
}

/**
 * Where a persona came from, for the ones nobody here wrote. One notion rather
 * than three: `installedFrom` for an admin's share and nothing at all for a
 * dropped file meant "is this mine?" was spelled differently per arrival route.
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
	 * What it said when installed, from `personaDigest`. Two comparisons: against
	 * the persona now, have *you* changed it; against the store's listing, has the
	 * *store*. Without this, a new revision upstream makes an untouched persona look
	 * edited.
	 */
	digest?: string;
}

/** `installedFrom` is what personas installed before `source` existed carry. Read in one place, so nothing else knows there were two fields. */
export function personaOrigin(persona: Persona): string | undefined {
	return persona.source?.id ?? persona.installedFrom;
}

/**
 * A named bundle of a system prompt, a base model, an avatar and a few
 * capabilities. A *template*: its values are snapshotted into the session when a
 * chat starts, so it never acts as a live resolution layer.
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
	/** Model name; resolved to a concrete server when a chat is created. Empty = your default. */
	modelName: string;
	/**
	 * The language it answers in, whatever language it was written in. Free text
	 * rather than a list: the locales the app is translated into have nothing to do
	 * with the languages a model speaks.
	 *
	 * Empty means the interface's language, resolved when a conversation starts.
	 */
	language?: string;
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
 * The language a persona answers in, and the line that says so.
 *
 * Written into the system prompt rather than left to the model to infer, since
 * inferring is what goes wrong: a prompt written in English makes an English
 * answer feel right even when everything around it is French.
 *
 * Resolved when the conversation starts, like everything else a persona
 * contributes, so it is a snapshot and not a live setting.
 */
export function languageInstruction(persona: Persona): string {
	const settings = get(settingsStore);
	const language =
		persona.language?.trim() ||
		LANGUAGE_LABELS[settings.userLanguage as keyof typeof LANGUAGE_LABELS] ||
		'English';
	return resolvePrompt('personaLanguage', get(effectivePrompts), { language });
}

/**
 * Open a persona's conversation, creating it the first time.
 *
 * Async because the conversation has to exist where the next line looks for it:
 * with the write still queued, the page read back empty, started a blank
 * conversation on the same id, and overwrote the prompt, greeting and binding.
 */
export async function launchPersona(persona: Persona, models: Model[]): Promise<string> {
	const sessions = get(sessionsStore) || [];
	if (persona.sessionId && sessions.some((s) => s.id === persona.sessionId)) {
		return persona.sessionId;
	}

	const id = generateRandomId();
	// A persona names a model, or leaves it empty to mean "whichever is mine". The
	// fallback has to happen here: a conversation opened directly resolves nothing,
	// so an empty one arrived with no model at all.
	const defaultModel = get(chatDefaultsConfig).defaultModel.value;
	const model =
		models.find((m) => m.name === persona.modelName) ??
		(defaultModel ? models.find((m) => m.name === defaultModel) : undefined);
	const session: Session = {
		id,
		messages: persona.greeting?.trim() ? [{ role: 'assistant', content: persona.greeting }] : [],
		systemPrompt: {
			role: 'system',
			content: [persona.systemPrompt.trim(), languageInstruction(persona)]
				.filter(Boolean)
				.join('\n\n')
		},
		systemPromptEdited: true, // fixed by the persona: don't auto-resolve over it
		options: persona.params?.temperature != null ? { temperature: persona.params.temperature } : {},
		model,
		title: persona.name,
		personaId: persona.id,
		updatedAt: new Date().toISOString()
	};

	saveSession(session);
	savePersona({ ...persona, sessionId: id });
	// Nothing is navigated to until it is really there.
	await repository.flush?.();
	return id;
}

/** Personas whose bound conversation still exists, most recent first. One leaves this list when its conversation is deleted, see `unbindPersonaSession`. */
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
// Reads our own native format and OpenWebUI model exports. Native export stays clean.

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

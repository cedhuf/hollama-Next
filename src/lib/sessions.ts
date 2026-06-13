import { get } from 'svelte/store';

import type { OllamaOptions } from '$lib/chat/ollama';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { sessionsStore, settingsStore, sortStore } from '$lib/localStorage';

import type { AskChoices } from './askChoice';
import { getLastUsedModels } from './chat';
import type { Knowledge } from './knowledge';
import type { Model } from './settings';
import { formatTimestampToNow } from './utils';

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	knowledge?: Knowledge;
	context?: number[];
	reasoning?: string;
	images?: { data: string; filename: string }[]; // Store image data and filename
	webSearch?: { query: string; resultCount: number }; // Set when web search context was injected
	choices?: AskChoices; // Set when the assistant asked for a quick choice (interactive buttons)
}

export interface Session {
	id: string;
	messages: Message[];
	systemPrompt: Message;
	options: Partial<OllamaOptions>;
	model?: Model;
	updatedAt?: string;
	title?: string;
	/** True once the user edits the system prompt by hand — stops auto-resolution. */
	systemPromptEdited?: boolean;
	/** Set when this conversation belongs to a persona (Library). */
	personaId?: string;
	/** Pinned to the top of the sidebar, regardless of recency. */
	pinned?: boolean;
}

export interface Editor {
	prompt: string;
	view: 'messages' | 'controls';
	messageIndexToEdit: number | null;
	isCodeEditor: boolean;
	isCompletionInProgress: boolean;
	isNewSession: boolean;
	shouldFocusTextarea: boolean;
	webSearch?: boolean;
	isSearching?: boolean; // True while a web search is running (live status)
	searchQuery?: string; // The query being searched, shown live while isSearching
	webSearchInfo?: { query: string; resultCount: number }; // Live result info for the streaming article
	attachments?: { type: 'image'; id: string; name: string; dataUrl: string }[];
	completion?: string;
	reasoning?: string;
	promptTextarea?: HTMLTextAreaElement;
	abortController?: AbortController;
}

export const loadSession = (id: string): Session => {
	let session: Session | null = null;

	// Retrieve the current sessions
	const currentSessions = get(sessionsStore);

	const defaultSystemPrompt: Message = {
		role: 'system',
		content: ''
	};

	// Find the session with the given id
	if (currentSessions) {
		const existingSession = currentSessions.find((s) => s.id === id);
		if (existingSession) {
			session = {
				...existingSession,
				// NOTE: `options` and `systemPrompt` are required fields but `existingSessions`
				// created before this feature was implemented need to be set to the defaults.
				// Over time we can probably remove them.
				options: existingSession.options || {},
				systemPrompt: existingSession.systemPrompt || defaultSystemPrompt
			};
		}
	}

	if (!session) {
		// Use the default model (resolved: an admin-shared default may apply), or
		// fall back to the last used.
		const settings = get(settingsStore);
		const defaultModelName = get(chatDefaultsConfig).defaultModel.value || settings.defaultModel;
		const model = defaultModelName
			? settings.models?.find((m) => m.name === defaultModelName)
			: undefined;
		const fallbackModel = model || getLastUsedModels()[0];

		// Create a new session
		session = {
			id,
			model: fallbackModel,
			systemPrompt: defaultSystemPrompt,
			updatedAt: new Date().toISOString(),
			messages: [],
			options: {}
		};
	}

	return session;
};

export const saveSession = (session: Session): void => {
	// Retrieve the current sessions
	const currentSessions = get(sessionsStore) || [];

	// Find the index of the session with the same id, if it exists
	const existingIndex = currentSessions.findIndex((k) => k.id === session.id);

	if (existingIndex !== -1) {
		// Update the existing session
		currentSessions[existingIndex] = session;
	} else {
		// Add the new session if it doesn't exist
		currentSessions.push(session);
	}

	// Sort the sessions by updatedAt in descending order (most recent first)
	const sortedSessions = sortStore(currentSessions);

	// Update the store with the sorted sessions
	sessionsStore.set(sortedSessions);

	// Update the last used models
	const lastUsedModels = getLastUsedModels();
	settingsStore.update((settings) => ({ ...settings, lastUsedModels }));
};

export function formatSessionMetadata(session: Session) {
	const subtitles: string[] = [];
	if (session.updatedAt) subtitles.push(formatTimestampToNow(session.updatedAt));
	if (session.model) subtitles.push(session.model.name);
	return subtitles.join(' • ');
}

/** Toggle a session's pinned state (pinned sessions sort to the top). */
export function toggleSessionPin(id: string): void {
	const sessions = get(sessionsStore) || [];
	const session = sessions.find((s) => s.id === id);
	if (!session) return;
	session.pinned = !session.pinned;
	sessionsStore.set([...sessions]);
}

export interface SessionGroup {
	label: string;
	sessions: Session[];
}

/**
 * Bucket sessions for the sidebar: a leading "Pinned" group, then by recency
 * (Today / Yesterday / Previous 7 days / …). Input is assumed already sorted by
 * `updatedAt` descending (as `sortStore` keeps it).
 */
export function groupSessions(sessions: Session[]): SessionGroup[] {
	const pinned = sessions.filter((s) => s.pinned);
	const rest = sessions.filter((s) => !s.pinned);

	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const day = 86_400_000;

	const buckets = { today: [], yesterday: [], week: [], month: [], older: [] } as Record<
		string,
		Session[]
	>;
	for (const s of rest) {
		const t = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
		if (t >= startOfToday) buckets.today.push(s);
		else if (t >= startOfToday - day) buckets.yesterday.push(s);
		else if (t >= startOfToday - 7 * day) buckets.week.push(s);
		else if (t >= startOfToday - 30 * day) buckets.month.push(s);
		else buckets.older.push(s);
	}

	const groups: SessionGroup[] = [];
	if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned });
	if (buckets.today.length) groups.push({ label: 'Today', sessions: buckets.today });
	if (buckets.yesterday.length) groups.push({ label: 'Yesterday', sessions: buckets.yesterday });
	if (buckets.week.length) groups.push({ label: 'Previous 7 days', sessions: buckets.week });
	if (buckets.month.length) groups.push({ label: 'Previous 30 days', sessions: buckets.month });
	if (buckets.older.length) groups.push({ label: 'Older', sessions: buckets.older });
	return groups;
}

export function getSessionTitle(session: Session) {
	if (session.title) return session.title;

	const firstUserMessage = session.messages.find(
		(m) => m.role === 'user' && m.content && !m.knowledge
	);

	if (firstUserMessage?.content) {
		const MAX_TITLE_LENGTH = 56;
		return firstUserMessage.content.slice(0, MAX_TITLE_LENGTH);
	}

	return '';
}

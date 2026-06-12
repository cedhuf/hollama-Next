import { get } from 'svelte/store';

import type { OllamaOptions } from '$lib/chat/ollama';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { sessionsStore, settingsStore, sortStore } from '$lib/localStorage';

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

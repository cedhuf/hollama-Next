import { get } from 'svelte/store';

import type { OllamaOptions } from '$lib/chat/ollama';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { modelLabel, type Server } from '$lib/connections';
import { repository } from '$lib/data';
import { sessionsStore, settingsStore } from '$lib/localStorage';

import type { AskChoices } from './askChoice';
import { getLastUsedModels } from './chat';
import type { Knowledge } from './knowledge';
import type { Model } from './settings';
import { formatTimestampToNow } from './utils';

/** A single cited web source (title + url; snippets are dropped to keep storage small). */
export interface SearchSource {
	title: string;
	url: string;
}

/** What we keep about a web search: the query, how many results, and the cited sources. */
export interface WebSearchInfo {
	query: string;
	resultCount: number;
	sources?: SearchSource[];
}

/**
 * One step of what the turn did before writing its answer.
 *
 * A turn can take two rounds: the model thinks, asks to read some results with a
 * `<read>` block, and thinks again with the pages in hand. Shown as a single
 * timeline — searching, thinking, reading, thinking — rather than as separate
 * widgets appearing and replacing each other while it works.
 *
 * Holds every step but the last round of thinking, which stays in `reasoning`:
 * that one is still streaming while the rest is already history.
 */
export interface ReasoningStep {
	type: 'search' | 'reasoning' | 'read';
	/** The thinking, for a `reasoning` step. */
	content?: string;
	/** What was searched, for a `search` step. */
	query?: string;
	resultCount?: number;
	/** The pages that were opened, for a `read` step. Empty when none could be. */
	pages?: SearchSource[];
}

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	knowledge?: Knowledge;
	context?: number[];
	reasoning?: string;
	/** Set only on multi-round turns; `reasoning` remains the final round's. */
	reasoningTrace?: ReasoningStep[];
	images?: { data: string; filename: string }[]; // Store image data and filename
	webSearch?: WebSearchInfo; // Set when web search context was injected
	choices?: AskChoices; // Set when the assistant asked for a quick choice (interactive buttons)
	isReasoningVisible?: boolean;
	/** ISO timestamp. Absent on messages written before this was recorded. */
	createdAt?: string;
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

/**
 * A conversation as the lists know it: everything but what was said.
 *
 * The sidebar, the home page and the model history need a title, a date, a model
 * and a couple of flags. They never needed the messages — but the store held
 * them anyway, so every boot and every refresh shipped the whole history to the
 * browser and kept it in memory. A distinct type rather than a `Session` with an
 * empty `messages`: that shape would be indistinguishable from a conversation
 * whose messages were genuinely lost, and saving one would destroy the real one.
 * Here it cannot be saved as a session at all.
 */
export interface SessionSummary {
	id: string;
	/** Already resolved: an explicit title, or the fallback below. */
	title: string;
	updatedAt?: string;
	model?: Model;
	pinned?: boolean;
	personaId?: string;
}

/** Longest title derived from a first message. */
export const MAX_TITLE_LENGTH = 56;

/** The title a conversation shows in a list: its own, or its first words. */
export function resolveSessionTitle(session: { title?: string; messages?: Message[] }): string {
	if (session.title) return session.title;
	const firstUserMessage = session.messages?.find(
		(m) => m.role === 'user' && m.content && !m.knowledge
	);
	return (firstUserMessage?.content ?? '').slice(0, MAX_TITLE_LENGTH);
}

export function summarizeSession(session: Session): SessionSummary {
	return {
		id: session.id,
		title: resolveSessionTitle(session),
		updatedAt: session.updatedAt,
		model: session.model,
		pinned: session.pinned,
		personaId: session.personaId
	};
}

export interface Editor {
	prompt: string;
	view: 'messages' | 'controls';
	messageIndexToEdit: number | null;
	isExpanded: boolean;
	isCompletionInProgress: boolean;
	isNewSession: boolean;
	shouldFocusTextarea: boolean;
	webSearch?: boolean;
	/** Read the pages the message links to, in full, instead of searching around them. */
	webFetch?: boolean;
	/** Per-conversation tool toggles, seeded from the global settings each time a session loads. */
	interactiveChoices?: boolean;
	sendCurrentDate?: boolean;
	/** Allow native model reasoning (Ollama). Default on (auto-detected); off never requests it. */
	thinking?: boolean;
	isSearching?: boolean; // True while a web search is running (live status)
	/** Which of the two the live status is about — they read very differently. */
	searchActivity?: 'search' | 'read';
	searchQuery?: string; // The query being searched, shown live while isSearching
	webSearchInfo?: WebSearchInfo; // Live result info for the streaming article
	attachments?: { type: 'image'; id: string; name: string; dataUrl: string }[];
	completion?: string;
	reasoning?: string;
	/** Earlier rounds of the turn in progress, shown above the live reasoning. */
	reasoningTrace?: ReasoningStep[];
	/** Live reasoning-panel toggle on the streaming article; stamped onto the message at completion. */
	streamingReasoningExpanded?: boolean;
	promptTextarea?: HTMLTextAreaElement;
	abortController?: AbortController;
}

const defaultSystemPrompt = (): Message => ({ role: 'system', content: '' });

/**
 * A conversation that doesn't exist yet.
 *
 * Opening an unknown id is how a new chat starts, so this is the normal path,
 * not an error one. Kept synchronous: it reads the settings already in memory
 * and nothing else.
 */
export const newSession = (id: string): Session => {
	// Use the default model (resolved: an admin-shared default may apply), or
	// fall back to the last used.
	const settings = get(settingsStore);
	const defaultModelName = get(chatDefaultsConfig).defaultModel.value || settings.defaultModel;
	const model = defaultModelName
		? settings.models?.find((m) => m.name === defaultModelName)
		: undefined;

	return {
		id,
		model: model || getLastUsedModels()[0],
		systemPrompt: defaultSystemPrompt(),
		updatedAt: new Date().toISOString(),
		messages: [],
		options: {}
	};
};

/**
 * Fill in fields that conversations written before they existed don't carry.
 * Applied on the way out of storage, so the rest of the app can assume them.
 */
export const normalizeSession = (session: Session): Session => ({
	...session,
	options: session.options || {},
	systemPrompt: session.systemPrompt || defaultSystemPrompt()
});

export const saveSession = (session: Session): void => {
	// The store keeps the summary, the repository stores the conversation.
	sessionsStore.upsert(session);

	// Update the last used models
	const lastUsedModels = getLastUsedModels();
	settingsStore.update((settings) => ({ ...settings, lastUsedModels }));
};

/**
 * Sidebar subtitle: when it ran, and on what.
 *
 * `servers` is passed in rather than read from the store so the caller's template
 * re-renders when a connection's display names change.
 */
export function formatSessionMetadata(session: SessionSummary, servers: Server[] = []) {
	const subtitles: string[] = [];
	if (session.updatedAt) subtitles.push(formatTimestampToNow(session.updatedAt));
	if (session.model) {
		const server = servers.find((s) => s.id === session.model?.serverId);
		subtitles.push(modelLabel(server, session.model.name));
	}
	return subtitles.join(' • ');
}

/**
 * Toggle a session's pinned state (pinned sessions sort to the top).
 *
 * Asynchronous because the list only holds summaries: pinning changes the
 * conversation, so the conversation is what has to be read and written back —
 * saving the summary would be saving a conversation with no messages.
 */
export async function toggleSessionPin(id: string): Promise<void> {
	const summary = (get(sessionsStore) || []).find((s) => s.id === id);
	if (!summary) return;

	const session = await repository.loadSession(id);
	if (!session) return;

	saveSession({ ...session, pinned: !summary.pinned });
}

export type SessionGroupKey =
	| 'pinned'
	| 'today'
	| 'yesterday'
	| 'previous7Days'
	| 'previous30Days'
	| 'older';

export interface SessionGroup {
	/** i18n key — the component resolves it via $LL (e.g. groupToday). */
	key: SessionGroupKey;
	sessions: SessionSummary[];
}

/**
 * Bucket sessions for the sidebar: a leading "Pinned" group, then by recency
 * (Today / Yesterday / Previous 7 days / …). Input is assumed already sorted by
 * `updatedAt` descending (as `sortStore` keeps it).
 */
export function groupSessions(sessions: SessionSummary[]): SessionGroup[] {
	const pinned = sessions.filter((s) => s.pinned);
	const rest = sessions.filter((s) => !s.pinned);

	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const day = 86_400_000;

	const buckets = { today: [], yesterday: [], week: [], month: [], older: [] } as Record<
		string,
		SessionSummary[]
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
	if (pinned.length) groups.push({ key: 'pinned', sessions: pinned });
	if (buckets.today.length) groups.push({ key: 'today', sessions: buckets.today });
	if (buckets.yesterday.length) groups.push({ key: 'yesterday', sessions: buckets.yesterday });
	if (buckets.week.length) groups.push({ key: 'previous7Days', sessions: buckets.week });
	if (buckets.month.length) groups.push({ key: 'previous30Days', sessions: buckets.month });
	if (buckets.older.length) groups.push({ key: 'older', sessions: buckets.older });
	return groups;
}

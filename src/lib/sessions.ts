import { get } from 'svelte/store';

import type { OllamaOptions } from '$lib/chat/ollama';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { modelLabel, type Server } from '$lib/connections';
import { repository } from '$lib/data';
import { sessionsStore, settingsStore } from '$lib/localStorage';

import type { AskChoices } from './askChoice';
import { getLastUsedModels } from './chat';
import type { Knowledge } from './knowledge';
import { defaultSystemPrompt, type SessionSummary } from './sessionShape';
import type { Model } from './settings';
import { formatTimestampToNow } from './utils';

// Re-exported so the components that already import these from here keep
// working. `sessionShape` deliberately depends on nothing, which is what stops
// the store layer and this module from initialising each other.
export type { SessionSummary };
export { normalizeSession, resolveSessionTitle, summarizeSession } from './sessionShape';

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
	/**
	 * Set on a message carrying an attached document: the file it was read from.
	 *
	 * The text itself is in `content`, where the model reads it. This is only what
	 * the conversation shows in its place, so a hundred pages of Markdown do not
	 * unroll in the middle of the thread.
	 */
	document?: { name: string; pages?: number };
	webSearch?: WebSearchInfo; // Set when web search context was injected
	choices?: AskChoices; // Set when the assistant asked for a quick choice (interactive buttons)
	isReasoningVisible?: boolean;
	/** ISO timestamp. Absent on messages written before this was recorded. */
	createdAt?: string;
	/**
	 * Set on a compaction marker: a `system` message holding a summary of the
	 * messages before it, which is what the model receives in their place.
	 *
	 * Nothing is deleted — the marker only moves where the sent context starts —
	 * so removing it restores the full history. That is what makes `/compact`
	 * reversible, and why compaction is a marker rather than a rewrite.
	 */
	compaction?: {
		/** ISO timestamp of when the summary was written. */
		generatedAt: string;
		/** How many messages it stands in for. */
		replacedCount: number;
		/** The model that wrote it, for the divider's tooltip. */
		model?: string;
		/** True when the app compacted on its own, at the configured threshold. */
		automatic?: boolean;
	};
	/**
	 * Set on a clear marker: a `system` message with nothing in it, marking where
	 * the conversation starts again as far as the model is concerned.
	 *
	 * The sibling of `compaction`, and the difference is the whole point.
	 * Compaction hands the model a summary of what came before; clearing hands it
	 * nothing. Both are markers rather than rewrites, so neither destroys
	 * anything: the messages are still there, still yours, still searchable, and
	 * removing the marker gives the model all of it back.
	 *
	 * What clearing does take away is the reading: everything before it folds
	 * under the marker, because a conversation you have deliberately set aside is
	 * not what you want to scroll past to reach the one you are having.
	 */
	cleared?: {
		/** ISO timestamp of when the line was drawn. */
		generatedAt: string;
		/** How many messages are behind it. */
		replacedCount: number;
	};
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
	/**
	 * Out of the list, but not gone.
	 *
	 * The middle answer between keeping a conversation in the way and deleting it,
	 * which is the only thing on offer for something you are finished with and do
	 * not want to lose. Archived conversations keep everything and are reachable
	 * from the foot of the list.
	 */
	archived?: boolean;
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

/** Out of the list, or back into it. Reads and writes the conversation, like pinning. */
export async function toggleSessionArchive(id: string): Promise<void> {
	const session = await repository.loadSession(id);
	if (!session) return;
	saveSession({ ...session, archived: !session.archived, pinned: false });
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
	// Archived conversations are not a group at the bottom: they are not in the
	// list at all, which is the whole of what archiving is for.
	const active = sessions.filter((s) => !s.archived);
	const pinned = active.filter((s) => s.pinned);
	const rest = active.filter((s) => !s.pinned);

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

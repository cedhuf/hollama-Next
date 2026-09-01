import { get } from 'svelte/store';

import type { ConversationNote } from '$lib/chat/notes';
import type { OllamaOptions } from '$lib/chat/ollama';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { modelLabel, type Server } from '$lib/connections';
import { repository } from '$lib/data';
import { sessionsStore, settingsStore } from '$lib/localStorage';
import type { McpApprovalRequest } from '$lib/mcp';

import type { AskChoices } from './askChoice';
import { getLastUsedModels } from './chat';
import type { Knowledge } from './knowledge';
import { defaultSystemPrompt, type SessionSummary } from './sessionShape';
import type { Model } from './settings';
import { formatTimestampToNow } from './utils';

// Re-exported so existing imports keep working. `sessionShape` depends on
// nothing, which is what stops it and the store layer initialising each other.
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
 * One step of what the turn did before writing its answer, shown as a single
 * timeline rather than as widgets replacing each other.
 *
 * Holds every step but the last round of thinking, which stays in `reasoning`:
 * that one is still streaming while the rest is already history.
 */
export interface ReasoningStep {
	type: 'search' | 'reasoning' | 'read' | 'memory' | 'mcp';
	/** The thinking, for a `reasoning` step. */
	content?: string;
	/** What was searched, for a `search` step. */
	query?: string;
	resultCount?: number;
	/** The pages that were opened, for a `read` step. Empty when none could be. */
	pages?: SearchSource[];
	/** Traced like a search: something happened on the user's behalf that they did not ask for and would otherwise never see. */
	memory?: { action: 'profile' | 'write' | 'forget' | 'read'; title?: string; refused?: boolean };
	/**
	 * The server is named, not only the tool: a result from a machine the instance
	 * does not own is a different thing from one the app produced. An empty `tool`
	 * is the server itself having failed, before any call.
	 */
	mcp?: {
		server: string;
		tool: string;
		/** The call was made and went wrong. */
		failed?: boolean;
		/** The call was never made: the person did not allow it. Not the same thing. */
		refused?: boolean;
		error?: string;
	};
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
	/** The text is in `content`, where the model reads it. This is what the conversation shows in its place, so a hundred pages do not unroll in the thread. */
	document?: { name: string; pages?: number };
	webSearch?: WebSearchInfo; // Set when web search context was injected
	choices?: AskChoices; // Set when the assistant asked for a quick choice (interactive buttons)
	isReasoningVisible?: boolean;
	/** ISO timestamp. Absent on messages written before this was recorded. */
	createdAt?: string;
	/**
	 * Set on a reply written by a persona called in with `@`.
	 *
	 * Two fields: the id draws the avatar and re-runs the right persona on a retry,
	 * the name is what later turns send and has to survive the persona being renamed
	 * or deleted.
	 */
	personaId?: string;
	personaName?: string;
	/**
	 * Not a turn in the conversation but something that happened to it: a
	 * compaction, a clear, and whatever comes next.
	 *
	 * One field with the kind inside it, so adding a kind is an entry in the table
	 * in `chat/notes` rather than an edit to the context builder, the search, the
	 * SQL and the renderer.
	 *
	 * Nothing is ever deleted by one: a note only moves where the sent context
	 * starts, which is what makes `/compact` and `/clear` reversible.
	 */
	note?: ConversationNote;
}

export interface Session {
	id: string;
	messages: Message[];
	systemPrompt: Message;
	options: Partial<OllamaOptions>;
	model?: Model;
	updatedAt?: string;
	title?: string;
	/** True once the user edits the system prompt by hand: stops auto-resolution. */
	systemPromptEdited?: boolean;
	/**
	 * Ids rather than a copy, unlike what a persona contributes: a persona must not
	 * change under a conversation already under way, while a playbook is a procedure
	 * you maintain, and fixing a step should fix it everywhere it is switched on.
	 */
	playbookIds?: string[];
	/** Stops anything writing over it: nothing else distinguished a name the model wrote from a name a person chose. */
	titleEdited?: boolean;
	/** Set once the conversation has been named again, so it happens once and not on a loop. */
	titleRegenerated?: boolean;
	/** Set when this conversation belongs to a persona (Library). */
	personaId?: string;
	/** Pinned to the top of the sidebar, regardless of recency. */
	pinned?: boolean;
	/** The middle answer between keeping a conversation in the way and deleting it. Archived ones keep everything and are reachable from the foot of the list. */
	archived?: boolean;
}

export interface Editor {
	prompt: string;
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
	/** Off does not refuse the calls, it stops sending the catalogues: a conversation with no use for forty tools should not carry their definitions. */
	mcp?: boolean;
	isSearching?: boolean; // True while a web search is running (live status)
	/** Which of the two the live status is about. They read very differently. */
	searchActivity?: 'search' | 'read' | 'tool';
	searchQuery?: string; // The query being searched, shown live while isSearching
	webSearchInfo?: WebSearchInfo; // Live result info for the streaming article
	/** A turn can hand the floor to several personas in a row, so the streaming bubble has to say whose it is. Set by the `speaker` event and cleared by the next. */
	speakerPersonaId?: string;
	speakerName?: string;
	attachments?: { type: 'image'; id: string; name: string; dataUrl: string }[];
	completion?: string;
	reasoning?: string;
	/** Earlier rounds of the turn in progress, shown above the live reasoning. */
	reasoningTrace?: ReasoningStep[];
	/** Live reasoning-panel toggle on the streaming article; stamped onto the message at completion. */
	streamingReasoningExpanded?: boolean;
	/** On the editor rather than on a message: it is a question about a turn in flight, not part of the conversation. Set from the run's events, so a reload finds it again. */
	pendingApproval?: McpApprovalRequest;
	promptTextarea?: HTMLTextAreaElement;
	abortController?: AbortController;
}

/** Opening an unknown id is how a new chat starts, so this is the normal path. Synchronous: it reads the settings already in memory. */
export const newSession = (id: string): Session => {
	// The default model (an admin-shared one may apply), or the last used.
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

/** `servers` is passed in rather than read from the store, so the caller's template re-renders when a connection is renamed. */
export function formatSessionMetadata(session: SessionSummary, servers: Server[] = []) {
	const subtitles: string[] = [];
	if (session.updatedAt) subtitles.push(formatTimestampToNow(session.updatedAt));
	if (session.model) {
		const server = servers.find((s) => s.id === session.model?.serverId);
		subtitles.push(modelLabel(server, session.model.name));
	}
	return subtitles.join(' • ');
}

/** Asynchronous because the list only holds summaries: pinning changes the conversation, and saving a summary would save a conversation with no messages. */
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
	'pinned' | 'today' | 'yesterday' | 'previous7Days' | 'previous30Days' | 'older';

export interface SessionGroup {
	/** i18n key: the component resolves it via $LL (e.g. groupToday). */
	key: SessionGroupKey;
	sessions: SessionSummary[];
}

/**
 * A leading "Pinned" group, then by recency. Input is assumed already sorted by
 * `updatedAt` descending, as `sortStore` keeps it.
 */
export function groupSessions(sessions: SessionSummary[]): SessionGroup[] {
	// Archived conversations are not a group at the bottom: they are not in the
	// list at all, which is what archiving is for.
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

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
 * timeline (searching, thinking, reading, thinking) rather than as separate
 * widgets appearing and replacing each other while it works.
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
	/**
	 * What was done to the persona's memory, for a `memory` step.
	 *
	 * Traced like a search is traced, and for the same reason: something happened
	 * on the user's behalf that they did not ask for and would otherwise never
	 * see. A memory written in silence is the version of this feature nobody
	 * should ship.
	 */
	memory?: { action: 'profile' | 'write' | 'forget' | 'read'; title?: string; refused?: boolean };
	/**
	 * Which external tool answered, for an `mcp` step.
	 *
	 * The server is named rather than only the tool, and that is the whole reason
	 * this step exists: a result from a machine the instance does not own is a
	 * different thing from a result the app produced, and a reader has to be able
	 * to tell which they are looking at. An empty `tool` is the server itself
	 * having failed, before any call was made.
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
	 * Set on a reply written by a persona called into the conversation with `@`.
	 *
	 * Two fields rather than one, and the name is not a convenience. The id is how
	 * the avatar is drawn and how a retry re-runs the right persona; the name is
	 * what is sent to the model on later turns, and it has to survive the persona
	 * being renamed or deleted. Attribution that stops working when somebody tidies
	 * their library is attribution nobody can rely on.
	 */
	personaId?: string;
	personaName?: string;
	/**
	 * Set when this is not a turn in the conversation but something that happened
	 * to it: a compaction, a clear, and whatever comes next.
	 *
	 * One field with the kind inside it rather than one field per kind. What the
	 * app has to know about a note (does the model read it, does it move where the
	 * conversation starts) lives in `chat/notes`, so adding a kind is an entry in
	 * a table rather than an edit to the context builder, the search, the SQL and
	 * the renderer. See that module for the whole of the reasoning.
	 *
	 * Nothing is ever deleted by one: a note only moves where the sent context
	 * starts, so removing it gives the full history back. That is what makes
	 * `/compact` and `/clear` reversible.
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
	 * The playbooks switched on for this conversation, in the order they were.
	 *
	 * Ids rather than a copy, unlike everything a persona contributes, which is
	 * snapshotted when the conversation starts. A persona is who you are talking
	 * to and must not change under a conversation already under way; a playbook is
	 * a procedure you maintain, and fixing a step in it should fix it everywhere it
	 * is switched on. Deleting one simply removes it from the next request.
	 */
	playbookIds?: string[];
	/**
	 * True once someone typed the title themselves.
	 *
	 * Which stops anything from writing over it. Nothing distinguished a name the
	 * model wrote from a name a person chose, so renaming a conversation and then
	 * letting it be named again would have silently thrown the choice away.
	 */
	titleEdited?: boolean;
	/** Set once the conversation has been named again, so it happens once and not on a loop. */
	titleRegenerated?: boolean;
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
	/**
	 * Whether this conversation offers the account's MCP tools. Default on.
	 *
	 * Off does not refuse the calls, it stops sending the catalogues: a
	 * conversation that has no use for somebody's forty tools should not carry
	 * their definitions in every request it makes.
	 */
	mcp?: boolean;
	isSearching?: boolean; // True while a web search is running (live status)
	/** Which of the two the live status is about. They read very differently. */
	searchActivity?: 'search' | 'read' | 'tool';
	searchQuery?: string; // The query being searched, shown live while isSearching
	webSearchInfo?: WebSearchInfo; // Live result info for the streaming article
	/**
	 * Who is writing the answer being streamed, when it is not the assistant.
	 *
	 * A turn can hand the floor to several personas in a row, so the bubble on
	 * screen has to say whose it is while it fills. Set by the `speaker` event and
	 * cleared by the next one, which means a replay arrives at the same place as
	 * having watched it.
	 */
	speakerPersonaId?: string;
	speakerName?: string;
	attachments?: { type: 'image'; id: string; name: string; dataUrl: string }[];
	completion?: string;
	reasoning?: string;
	/** Earlier rounds of the turn in progress, shown above the live reasoning. */
	reasoningTrace?: ReasoningStep[];
	/** Live reasoning-panel toggle on the streaming article; stamped onto the message at completion. */
	streamingReasoningExpanded?: boolean;
	/**
	 * The MCP call this turn is stopped on, waiting to be allowed or refused.
	 *
	 * Lives on the editor rather than on a message, because it is not part of the
	 * conversation: it is a question about a turn in flight, and it disappears
	 * whichever way it is answered. Set from the run's own events, so a tab that
	 * reloads mid-question finds it again.
	 */
	pendingApproval?: McpApprovalRequest;
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
 * conversation, so the conversation is what has to be read and written back:
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
	'pinned' | 'today' | 'yesterday' | 'previous7Days' | 'previous30Days' | 'older';

export interface SessionGroup {
	/** i18n key: the component resolves it via $LL (e.g. groupToday). */
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

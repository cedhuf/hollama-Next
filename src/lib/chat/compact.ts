import { get } from 'svelte/store';

import { chatDefaultsConfig } from '$lib/chatDefaults';
import { ConnectionType } from '$lib/connections';
import { resolvePrompt } from '$lib/defaultPrompts';
import { serversStore, settingsStore } from '$lib/localStorage';
import type { Message, Session } from '$lib/sessions';

import { messagesInContext } from './context';
import type { ChatStrategy } from './index';
import { OllamaStrategy } from './ollama';
import { OpenAIStrategy } from './openai';

/**
 * Compaction: replace the earlier part of a conversation with a summary of it,
 * so the conversation can keep going without outgrowing the model's context.
 *
 * The result is a marker message appended to the transcript, not a rewrite —
 * `messagesInContext` starts the sent context at the last marker, and deleting
 * the marker restores everything. Nothing is destroyed, so a bad compaction
 * costs one request and is undone by removing one message.
 */

/** How a message is rendered into the transcript handed to the summariser. */
function transcribe(message: Message): string {
	const role =
		message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System';
	const parts = [message.content?.trim()].filter(Boolean);
	if (message.images?.length) parts.push(`[${message.images.length} image(s) attached]`);
	if (message.knowledge?.content) parts.push(`[Knowledge: ${message.knowledge.name}]`);
	// Reasoning is deliberately dropped: it is the bulkiest part of a heavy
	// conversation and the least worth carrying — what the model concluded is in
	// the answer, and a summary of scratch thinking is noise in the next turn.
	return `${role}: ${parts.join('\n')}`;
}

/**
 * The model that writes the summary.
 *
 * Defaults to the conversation's own model: it already has the right window, the
 * user already trusts it here, and it needs no configuration. A dedicated model
 * can be set in Settings (or shared by an admin) when a cheaper or longer-window
 * one is preferred — the title model is deliberately NOT reused, since a model
 * picked to write six words will quietly drop facts over fifty thousand tokens.
 */
function resolveCompactModel(session: Session): { name: string; serverId: string } | null {
	const settings = get(settingsStore);
	const config = get(chatDefaultsConfig).compact;

	if (config.compactModel) {
		const known = settings.models.find((m) => m.name === config.compactModel);
		if (known) return { name: known.name, serverId: known.serverId };
		// The model may live on a system server the user cannot list (an admin's
		// shared compaction model) — the proxy authorizes by server, so use the id
		// the server handed us.
		if (config.compactServerId) {
			return { name: config.compactModel, serverId: config.compactServerId };
		}
	}

	if (session.model?.name && session.model.serverId) {
		return { name: session.model.name, serverId: session.model.serverId };
	}
	return null;
}

export interface CompactionOutcome {
	/** The marker message to append to the conversation. */
	marker: Message;
	/** How many messages it stands in for. */
	replacedCount: number;
}

/**
 * Summarise everything currently in context and return the marker to append.
 *
 * Throws on failure rather than returning null: unlike a title, a compaction the
 * user asked for must not fail silently — they need to know the context was not
 * shortened, so the caller can say so.
 */
export async function compactSession(
	session: Session,
	options: { signal?: AbortSignal; automatic?: boolean } = {}
): Promise<CompactionOutcome> {
	const model = resolveCompactModel(session);
	if (!model) throw new Error('No model available to compact with');

	const server = get(serversStore).find((s) => s.id === model.serverId);
	if (!server) throw new Error('Server not found');

	const active = messagesInContext(session.messages);
	if (!active.length) throw new Error('Nothing to compact');

	const overrides = get(settingsStore).promptOverrides;
	// An earlier summary is part of what gets summarised: compacting twice must
	// carry the first summary's facts forward, not drop them for being old.
	const transcript = active.map(transcribe).join('\n\n');

	const strategy: ChatStrategy =
		server.connectionType === ConnectionType.Ollama
			? new OllamaStrategy(server)
			: new OpenAIStrategy(server);

	let result = '';
	const controller = new AbortController();
	options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

	await strategy.chat(
		{
			model: model.name,
			messages: [
				{ role: 'system', content: resolvePrompt('compact', overrides) },
				{ role: 'user', content: transcript }
			],
			// A summary does not need reasoning, and asking for it doubles the wait on
			// what is already the longest single request the conversation will make.
			think: false
		},
		controller.signal,
		(part) => {
			result += part.content ?? '';
		}
	);

	const summary = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
	if (!summary) throw new Error('The model returned an empty summary');

	return {
		marker: {
			role: 'system',
			// The bare summary, without the instructions that frame it for the model —
			// those are added at send time. Storing them here would put a paragraph of
			// prompt engineering in front of the user every time they unfold the
			// divider, and would freeze the wording of an overridable prompt into the
			// conversation forever.
			content: summary,
			createdAt: new Date().toISOString(),
			compaction: {
				generatedAt: new Date().toISOString(),
				replacedCount: active.length,
				model: model.name,
				automatic: options.automatic
			}
		},
		replacedCount: active.length
	};
}

/**
 * The transcript a summariser is handed, from messages alone.
 *
 * Exported because a turn running server-side compacts too, and it must produce
 * the same text: a summary written from a different rendering of the same
 * conversation is a different summary, and which one you got would depend on
 * where the turn happened to run.
 */
export function compactTranscript(messages: Message[]): string {
	const active = messagesInContext(messages);
	if (!active.length) return '';
	// An earlier summary is part of what gets summarised: compacting twice must
	// carry the first summary's facts forward, not drop them for being old.
	return active.map(transcribe).join('\n\n');
}

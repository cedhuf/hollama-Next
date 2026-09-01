import { get } from 'svelte/store';

import { effectivePrompts } from '$lib/appPrompts';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { ConnectionType } from '$lib/connections';
import { resolvePrompt } from '$lib/defaultPrompts';
import { serversStore, settingsStore } from '$lib/localStorage';
import type { Message, Session } from '$lib/sessions';

import type { ChatStrategy } from './index';
import { messagesInContext } from './notes';
import { OllamaStrategy } from './ollama';
import { OpenAIStrategy } from './openai';

/**
 * Compaction: replace the earlier part of a conversation with a summary, so it
 * can keep going without outgrowing the model's context.
 *
 * A marker appended to the transcript, not a rewrite: `messagesInContext` starts
 * at the last marker, and deleting it restores everything. A bad compaction
 * costs one request and is undone by removing one message.
 */

/** How a message is rendered into the transcript handed to the summariser. */
function transcribe(message: Message): string {
	const role =
		message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System';
	const parts = [message.content?.trim()].filter(Boolean);
	if (message.images?.length) parts.push(`[${message.images.length} image(s) attached]`);
	if (message.knowledge?.content) parts.push(`[Knowledge: ${message.knowledge.name}]`);
	// Reasoning is dropped: the bulkiest part of a heavy conversation and the least
	// worth carrying, since what the model concluded is in the answer.
	return `${role}: ${parts.join('\n')}`;
}

/**
 * Defaults to the conversation's own model: right window, already trusted here,
 * no configuration. A dedicated one can be set for a cheaper or longer window.
 * The title model is deliberately not reused: a model picked to write six words
 * will quietly drop facts over fifty thousand tokens.
 */
function resolveCompactModel(session: Session): { name: string; serverId: string } | null {
	const settings = get(settingsStore);
	const config = get(chatDefaultsConfig).compact;

	if (config.compactModel) {
		const known = settings.models.find((m) => m.name === config.compactModel);
		if (known) return { name: known.name, serverId: known.serverId };
		// The model may live on a system server the user cannot list, so use the id the
		// server handed us: the proxy authorises by server.
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

/** Throws rather than returning null: unlike a title, a compaction the user asked for must not fail silently. */
export async function compactSession(
	session: Session,
	options: { signal?: AbortSignal; automatic?: boolean; instruction?: string } = {}
): Promise<CompactionOutcome> {
	const model = resolveCompactModel(session);
	if (!model) throw new Error('No model available to compact with');

	const server = get(serversStore).find((s) => s.id === model.serverId);
	if (!server) throw new Error('Server not found');

	const active = messagesInContext(session.messages);
	if (!active.length) throw new Error('Nothing to compact');

	const overrides = get(effectivePrompts);
	const instruction = options.instruction?.trim()
		? resolvePrompt('compactInstruction', overrides, { instruction: options.instruction.trim() })
		: '';
	// An earlier summary is part of what gets summarised: compacting twice carries
	// the first summary's facts forward.
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
				{
					role: 'system',
					// Anything typed after `/compact` goes last and outranks what is above it.
					//
					// It was written the other way round first, ending "this does not licence a
					// shorter summary", which is the model being told to ignore the user. A request
					// that cannot lose is not a request.
					//
					// What guards against a summary that throws the conversation away is not a
					// prompt refusing to obey: it is that compaction is reversible.
					content: [resolvePrompt('compact', overrides), instruction].filter(Boolean).join('\n\n')
				},
				{ role: 'user', content: transcript }
			],
			// A summary does not need reasoning, and asking doubles the wait on the longest
			// single request the conversation will make.
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
			// The bare summary, without the instructions that frame it: those are added at
			// send time. Storing them would put prompt engineering in front of the user
			// every time they unfold the divider, and freeze an overridable prompt forever.
			content: summary,
			createdAt: new Date().toISOString(),
			note: {
				kind: 'compaction',
				generatedAt: new Date().toISOString(),
				replacedCount: active.length,
				model: model.name,
				automatic: options.automatic,
				// Kept as the user typed it, not as it was wrapped: the divider says what was
				// asked for, and the framing around it is ours.
				instruction: options.instruction?.trim() || undefined
			}
		},
		replacedCount: active.length
	};
}

/** Exported because a turn running server-side compacts too and must produce the same text: a summary from a different rendering of the same conversation is a different summary. */
export function compactTranscript(messages: Message[]): string {
	const active = messagesInContext(messages);
	if (!active.length) return '';
	// An earlier summary is part of what gets summarised.
	return active.map(transcribe).join('\n\n');
}

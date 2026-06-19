import { get } from 'svelte/store';

import { chatDefaultsConfig } from '$lib/chatDefaults';
import { ConnectionType } from '$lib/connections';
import { serversStore, settingsStore } from '$lib/localStorage';

import type { ChatStrategy } from './index';
import { OllamaStrategy } from './ollama';
import { OpenAIStrategy } from './openai';

const TITLE_SYSTEM_PROMPT =
	'Generate a short, descriptive title (3 to 6 words) for a conversation that starts with the ' +
	'following message. Reply with only the title — no quotes, no markdown, no trailing punctuation.';

/**
 * Generates a concise session title from the first user message using the
 * model selected in settings (`titleModel`). Returns `null` if titling is
 * not configured or if anything goes wrong — title generation is best-effort
 * and must never break the chat flow.
 */
export async function generateTitle(firstUserMessage: string): Promise<string | null> {
	const settings = get(settingsStore);
	const titleConfig = get(chatDefaultsConfig).title;
	const modelName = titleConfig.titleModel;
	if (!modelName) return null;

	// The model may live on a system server the user can't list (an admin shared
	// title model) — the proxy authorizes by server, so we use the shared serverId.
	const model =
		settings.models.find((m) => m.name === modelName) ??
		(titleConfig.titleServerId
			? { name: modelName, serverId: titleConfig.titleServerId }
			: undefined);
	if (!model) return null;

	const server = get(serversStore).find((s) => s.id === model.serverId);
	if (!server) return null;

	const strategy: ChatStrategy =
		server.connectionType === ConnectionType.Ollama
			? new OllamaStrategy(server)
			: new OpenAIStrategy(server);

	try {
		let result = '';
		const controller = new AbortController();
		await strategy.chat(
			{
				model: modelName,
				messages: [
					{ role: 'system', content: TITLE_SYSTEM_PROMPT },
					{ role: 'user', content: firstUserMessage }
				],
				think: false // Titles are a quick one-shot — never spend reasoning on them.
			},
			controller.signal,
			(part) => {
				result += part.content ?? '';
			}
		);

		const title = result
			.replace(/<think>[\s\S]*?<\/think>/g, '') // drop reasoning blocks if any
			.trim()
			.replace(/^["']|["']$/g, '')
			.replace(/[.\s]+$/, '')
			.slice(0, 80);

		return title || null;
	} catch (error) {
		console.error('Title generation failed:', error);
		return null;
	}
}

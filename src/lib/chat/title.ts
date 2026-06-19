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
 * Session titles render as plain text, so any markdown the model returns despite
 * the instruction (e.g. `**Bold**`, `# Heading`, `` `code` ``) would show as raw
 * markup. Strip the common inline/block markers while keeping the text, then tidy
 * surrounding quotes, trailing punctuation and whitespace.
 */
function stripTitleMarkdown(raw: string): string {
	return raw
		.trim()
		.replace(/^title\s*[:\-—]\s*/i, '') // drop a "Title:" prefix some models add
		.replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+[.)]\s+)/, '') // leading heading/quote/list marker
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
		.replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
		.replace(/(\*|_)(.*?)\1/g, '$2') // italic
		.replace(/`+([^`]*)`+/g, '$1') // inline code
		.replace(/^["'“”']+|["'“”']+$/g, '') // surrounding quotes
		.replace(/[.\s]+$/, '') // trailing dots / whitespace
		.replace(/\s+/g, ' ') // collapse internal whitespace / newlines
		.trim();
}

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

		const title = stripTitleMarkdown(
			result.replace(/<think>[\s\S]*?<\/think>/g, '') // drop reasoning blocks if any
		).slice(0, 80);

		return title || null;
	} catch (error) {
		console.error('Title generation failed:', error);
		return null;
	}
}

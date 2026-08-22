import { get } from 'svelte/store';

import { effectivePrompts } from '$lib/appPrompts';
import { stripThinkTags, type ChatStrategy } from '$lib/chat/index';
import { OllamaStrategy } from '$lib/chat/ollama';
import { OpenAIStrategy } from '$lib/chat/openai';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { ConnectionType } from '$lib/connections';
import { resolvePrompt } from '$lib/defaultPrompts';
import { serversStore, settingsStore } from '$lib/localStorage';

/**
 * Turning what somebody typed into something an image model can draw.
 *
 * A text model doing one small job, on the same path a conversation title takes,
 * for the same reason: it is one question with one answer and no history.
 *
 * What it returns is never sent anywhere on its own. The caller puts it in a
 * field the person can read and edit before a single request is made — which is
 * the whole difference between a helper and a thing that quietly rewrites your
 * words. That is also why the instruction behind it can afford to be opinionated:
 * being overruled costs one keystroke.
 */
export async function writeImagePrompt(description: string): Promise<string | null> {
	const defaults = get(chatDefaultsConfig);
	if (!defaults.images.imagePromptWriter || !description.trim()) return null;

	// Blank means the model you normally use, which is what blank means in every
	// other model field in the app. Turning the writer off is what the switch is
	// for; an empty field was never meant to be a second way of saying it.
	const modelName = defaults.images.imagePromptModel || defaults.defaultModel.value;
	if (!modelName) return null;

	const model = get(settingsStore).models?.find((m) => m.name === modelName);
	if (!model) return null;

	const server = get(serversStore).find((s) => s.id === model.serverId);
	if (!server) return null;

	const strategy: ChatStrategy =
		server.connectionType === ConnectionType.Ollama
			? new OllamaStrategy(server)
			: new OpenAIStrategy(server);

	let result = '';
	const controller = new AbortController();
	await strategy.chat(
		{
			model: modelName,
			messages: [
				{ role: 'system', content: resolvePrompt('imagePrompt', get(effectivePrompts)) },
				{ role: 'user', content: description.trim() }
			],
			// A one-shot rewrite, like a title. Nothing here is worth reasoning about,
			// and a model that thinks out loud would put its thinking in the prompt.
			think: false
		},
		controller.signal,
		(part) => {
			result += part.content ?? '';
		}
	);

	// Models like to introduce themselves, and a leading "Sure, here is" would be
	// drawn as part of the picture. Quotes go for the same reason.
	const text = stripThinkTags(result)
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.trim();

	return text || null;
}

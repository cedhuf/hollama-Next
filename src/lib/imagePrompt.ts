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
 * Turning what somebody typed into something an image model can draw. A text
 * model doing one small job, on the same path a conversation title takes.
 *
 * What it returns is never sent on its own: the caller puts it in a field the
 * person can read and edit before a request is made, which is the difference
 * between a helper and a thing that quietly rewrites your words. Which is also
 * why the instruction can afford to be opinionated.
 */
export async function writeImagePrompt(
	description: string,
	onText?: (text: string) => void
): Promise<string | null> {
	const defaults = get(chatDefaultsConfig);
	if (!defaults.images.imagePromptWriter || !description.trim()) return null;
	return ask('imagePrompt', description, 400, onText);
}

/**
 * A few words naming a picture. Its own switch and not the writer's, because the
 * trades differ: a rewrite changes what gets drawn and costs a request nobody
 * asked for, while a title costs a dozen tokens beside an image billed by the
 * minute. Best-effort: a picture with no title is shown by its prompt.
 */
export async function writeImageTitle(prompt: string): Promise<string | null> {
	if (!get(settingsStore).imageAutoTitle) return null;
	try {
		return await ask('imageTitle', prompt, 60);
	} catch {
		return null;
	}
}

/**
 * Applied to every fragment as well as the finished answer, so the field filling
 * in is the same text as the field that settles. An unclosed `<think>` returns
 * nothing: `think: false` is requested, but a model that ignores it should leave
 * the field waiting rather than show reasoning in it.
 */
function readable(raw: string): string {
	if (/<think>(?![\s\S]*<\/think>)/.test(raw)) return '';
	return stripThinkTags(raw)
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.trim();
}

/** One question, one answer, no history. The shape both of the above share. */
async function ask(
	instruction: 'imagePrompt' | 'imageTitle',
	input: string,
	limit: number,
	onText?: (text: string) => void
): Promise<string | null> {
	const defaults = get(chatDefaultsConfig);
	if (!input.trim()) return null;

	// Blank means the model you normally use, as in every other model field. Turning
	// the writer off is what the switch is for.
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
				{ role: 'system', content: resolvePrompt(instruction, get(effectivePrompts)) },
				{ role: 'user', content: input.trim() }
			],
			// A one-shot rewrite, like a title: a model that thinks out loud would put its
			// thinking in the prompt.
			think: false
		},
		controller.signal,
		(part) => {
			result += part.content ?? '';
			// Reported as it arrives, cleaned the same way the final answer is, so a caller
			// can show the words landing instead of a spinner and a jump.
			onText?.(readable(result).slice(0, limit));
		}
	);

	// Models like to introduce themselves, and a leading "Sure, here is" would be
	// drawn as part of the picture. Quotes go for the same reason.
	const text = readable(result);

	return text ? text.slice(0, limit) : null;
}

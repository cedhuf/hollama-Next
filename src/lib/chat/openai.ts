import OpenAI from 'openai';
import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam,
	ChatCompletionTool
} from 'openai/resources/index.mjs';

import { supportsThinkingRequest, type Server } from '$lib/connections';
import type { Model } from '$lib/settings';

import { openaiClientConfig, type EndpointOptions } from './endpoint';
import {
	stripThinkTags,
	type ChatChunk,
	type ChatRequest,
	type ChatStrategy,
	type Message
} from './index';
import type { OllamaOptions } from './ollama';

/**
 * An id for a tool call the provider did not give one.
 *
 * Nine alphanumeric characters, which is not an arbitrary shape: OpenAI accepts
 * any string, and Mistral validates this exact one and refuses everything else.
 * The narrower rule is therefore the only one worth generating, and the old
 * `call_0` satisfied neither its length nor its alphabet.
 *
 * It only has to be unique inside one turn, since that is the whole life of the
 * pairing between a call and its answer, so there is nothing to keep and nothing
 * to collide with later.
 */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function newToolCallId(): string {
	// `crypto` rather than `Math.random`: uniqueness here only has to hold inside
	// one turn, so either would do, but an identifier generator built on the
	// non-cryptographic one is the sort of thing that gets copied somewhere it
	// matters. Present in both the browser and Node.
	const bytes = crypto.getRandomValues(new Uint8Array(9));
	return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

/**
 * Whether a refusal is about the thinking field rather than about the request.
 *
 * Providers word it differently and none of them give a code for it, so the name
 * of the field is the only thing they reliably have in common. Read across the
 * whole error rather than one property, because where the detail lands differs
 * between the SDK's own shape and a body passed straight through by a proxy.
 */
function mentionsThinkingField(error: unknown): boolean {
	// Guarded, because this runs inside a `catch`: a circular reference would make
	// `JSON.stringify` throw and replace the real failure with an unrelated one,
	// which is the worst thing a diagnostic can do.
	const text = (value: unknown): string => {
		if (value === undefined || value === null) return '';
		if (typeof value === 'string') return value;
		try {
			return JSON.stringify(value) ?? '';
		} catch {
			return '';
		}
	};

	const parts = [
		text((error as { message?: string })?.message),
		text((error as { error?: unknown })?.error),
		text((error as { body?: unknown })?.body)
	];
	return parts.some((part) => /chat_template_kwargs|enable_thinking/i.test(part));
}

/**
 * Endpoints that have already refused `chat_template_kwargs`, per model.
 *
 * Asked once and remembered, because the alternative is asking every turn: the
 * refusal is a 400, and a 400 is a whole round trip spent to be told something
 * that was already true last time. That is exactly what made one provider look
 * slow, and it was invisible until the fallback started saying so.
 *
 * In memory rather than stored. It costs one refusal per session, and it heals
 * itself the day the endpoint learns the field, which a saved answer would not.
 * Keyed by connection as well as model: the same name is served by different
 * builds in different places.
 */
const refusedThinking = new Set<string>();

const thinkingKey = (serverId: string, model: string) => `${serverId}:${model}`;

/**
 * Run a request that carries `chat_template_kwargs`, and learn from a refusal.
 *
 * Shared by both paths on purpose. `chat()` asks for reasoning and `complete()`
 * asks for it to be off, but they send the same field, so an endpoint that
 * refuses it refuses both, and one of them finding out is enough for the other.
 * They used to discover it separately, and `complete()` did so in silence, which
 * meant every internal errand (naming a session, routing a search) quietly paid a
 * failed round trip on top of the visible one.
 *
 * The refusal is recorded only once the same request has succeeded without the
 * field. Recorded any earlier, a 400 that had nothing to do with thinking would
 * switch reasoning off for the session on a model that reasons perfectly well.
 */
async function withThinkingField<T>(
	serverId: string,
	model: string,
	run: (extraBody: Record<string, unknown> | undefined) => Promise<T>,
	extraBody: Record<string, unknown> | undefined
): Promise<T> {
	if (!extraBody || refusedThinking.has(thinkingKey(serverId, model))) return run(undefined);

	try {
		return await run(extraBody);
	} catch (error) {
		const status = (error as { status?: number } | null)?.status;
		if (status !== 400) throw error;

		console.info(
			`[${model}] 400 with chat_template_kwargs${
				mentionsThinkingField(error) ? ' (the endpoint named the field)' : ' (field not named)'
			}; retrying without it, and not asking again this session`
		);
		const result = await run(undefined);
		refusedThinking.add(thinkingKey(serverId, model));
		return result;
	}
}

/**
 * The sampling settings a conversation carries, in the words this API uses.
 *
 * These are stored under Ollama's names because that is the vocabulary the app
 * grew up with, and they used to reach Ollama and nowhere else: every other
 * provider was handed a request with no sampling at all, so a temperature set on
 * a conversation, or carried by a persona, silently did nothing the moment the
 * model was not local. That was an omission rather than a decision.
 *
 * Only what this API actually defines. `top_k`, `min_p`, `tfs_z`, `typical_p`,
 * `repeat_penalty` and the mirostat trio are llama.cpp's, and an endpoint that
 * does not know a field answers 400 rather than ignoring it, which is a whole
 * turn lost to a setting nobody asked to be strict about.
 *
 * `undefined` is the only absent value: zero is a real temperature and a real
 * seed, so nothing here may be tested for truthiness.
 */
function samplingFrom(options: Partial<OllamaOptions> | undefined) {
	if (!options) return {};
	const set = <T>(value: T | undefined) => value !== undefined && value !== null;

	return {
		...(set(options.temperature) ? { temperature: options.temperature } : {}),
		...(set(options.top_p) ? { top_p: options.top_p } : {}),
		...(set(options.seed) ? { seed: options.seed } : {}),
		...(set(options.presence_penalty) ? { presence_penalty: options.presence_penalty } : {}),
		...(set(options.frequency_penalty) ? { frequency_penalty: options.frequency_penalty } : {}),
		...(options.stop?.length ? { stop: options.stop } : {}),
		// Ollama's name for the same ceiling, and its "no limit" is -1 where this API
		// wants the field left out entirely.
		...(set(options.num_predict) && options.num_predict! > 0
			? { max_tokens: options.num_predict }
			: {})
	};
}

export class OpenAIStrategy implements ChatStrategy {
	private openai: OpenAI;

	constructor(
		private server: Server,
		options: EndpointOptions = {}
	) {
		const config = openaiClientConfig(this.server, options);
		this.openai = new OpenAI({
			baseURL: config.baseURL,
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
			defaultHeaders: config.defaultHeaders
		});
	}

	private formatMessages(messages: Message[]): ChatCompletionMessageParam[] {
		return messages.map((message: Message): ChatCompletionMessageParam => {
			// An answer from a tool, paired to its call by id. Sent back verbatim: this
			// is the record of what the tool returned, and the model reads it as such.
			if (message.role === 'tool') {
				return {
					role: 'tool',
					// A last resort, and it cannot put back a pairing that was lost: an id
					// invented here matches no call. It only makes the refusal legible,
					// where an empty string is malformed as well as unmatched. Normally
					// this is set when the call was assembled, and stays set.
					tool_call_id: message.toolCallId || newToolCallId(),
					content: message.content
				};
			}

			// The turn where the model asked. It has to be replayed with the calls
			// attached, not just its text: a `tool` message answering a call the
			// conversation no longer contains is rejected by every provider.
			if (message.role === 'assistant' && message.toolCalls?.length) {
				return {
					role: 'assistant',
					content: message.content || null,
					tool_calls: message.toolCalls.map((call) => ({
						id: call.id,
						type: 'function' as const,
						function: { name: call.name, arguments: call.arguments }
					}))
				};
			}

			if (message.images && message.images.length > 0) {
				const content: ChatCompletionContentPart[] = [{ type: 'text', text: message.content }];
				message.images.forEach((img) => {
					let mimeType = 'image/jpeg';
					let base64Data = img;
					const dataUrlMatch = img.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
					if (dataUrlMatch) {
						mimeType = dataUrlMatch[1];
						base64Data = dataUrlMatch[2];
					}
					content.push({
						type: 'image_url',
						image_url: {
							url: `data:${mimeType};base64,${base64Data}`
						}
					});
				});
				// Vision API only supports user role for images currently
				// Cast role explicitly to satisfy TypeScript
				return { role: 'user' as const, content };
			} else {
				// Explicitly cast roles for non-image messages too
				if (message.role === 'user') {
					return { role: 'user', content: message.content };
				} else if (message.role === 'assistant') {
					return { role: 'assistant', content: message.content };
				} else {
					return { role: 'system', content: message.content };
				}
			}
		});
	}

	async chat(
		payload: ChatRequest,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const formattedMessages = this.formatMessages(payload.messages);

		// Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, SGLang, …) and
		// Infomaniak gate the model's chain-of-thought behind a chat-template flag that
		// has to be passed per request: the server-side default isn't always applied.
		// Real OpenAI / Claude reject unknown body fields, so this is scoped to the
		// endpoints that accept it, and retried once without it if rejected.
		const wantThink = payload.think !== false;
		const thinkBody =
			wantThink && supportsThinkingRequest(this.server.connectionType)
				? { chat_template_kwargs: { enable_thinking: true } }
				: undefined;

		const tools = payload.tools?.length
			? payload.tools.map((tool) => ({
					type: 'function' as const,
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.parameters
					}
				}))
			: undefined;

		await withThinkingField(
			this.server.id,
			payload.model,
			(extraBody) =>
				this.streamChat(
					payload.model,
					formattedMessages,
					extraBody,
					tools,
					payload.toolChoice,
					samplingFrom(payload.options),
					abortSignal,
					onChunk
				),
			thinkBody
		);
	}

	private async streamChat(
		model: string,
		messages: ChatCompletionMessageParam[],
		extraBody: Record<string, unknown> | undefined,
		tools: ChatCompletionTool[] | undefined,
		toolChoice: 'auto' | 'none' | undefined,
		sampling: Record<string, unknown>,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const response = await this.openai.chat.completions.create({
			model,
			messages,
			stream: true,
			// Without this a streamed answer carries no `usage` block at all, so every
			// turn (which is every turn) would go uncounted. Servers that do not know
			// the field ignore it.
			stream_options: { include_usage: true },
			...sampling,
			...(tools ? { tools } : {}),
			// Sent only when it is `none`, which is the only value that says anything:
			// `auto` is every provider's default, and a field nobody needs is a field
			// an endpoint can refuse.
			...(tools && toolChoice === 'none' ? { tool_choice: 'none' as const } : {}),
			...extraBody
		});

		// Tool calls stream in fragments keyed by position: one delta carries the id
		// and name, the next few carry slices of the argument JSON. Nothing is usable
		// until the stream ends, so they are assembled here and emitted once.
		const pending = new Map<number, { id: string; name: string; arguments: string }>();

		for await (const chunk of response) {
			if (abortSignal.aborted) break;
			// Reasoning over OpenAI-compatible endpoints arrives in a non-standard delta
			// field: `reasoning_content` (DeepSeek, vLLM, llama.cpp, SGLang) or
			// `reasoning` (OpenRouter and some vLLM builds). Surface either into the
			// separate reasoning panel; inline <think> tags in `content` are still split
			// out downstream by the FSM processor.
			const delta = chunk.choices?.[0]?.delta as
				| {
						content?: string | null;
						reasoning_content?: string;
						reasoning?: string;
						tool_calls?: {
							index: number;
							id?: string;
							function?: { name?: string; arguments?: string };
						}[];
				  }
				| undefined;
			const thinking = delta?.reasoning_content ?? delta?.reasoning;
			if (thinking) onChunk({ thinking });
			if (delta?.content) onChunk({ content: delta.content });

			// The last chunk of a stream carries the totals and no delta. Forwarded as
			// it is: whoever is counting decides what to do with it.
			const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
				.usage;
			if (usage?.prompt_tokens || usage?.completion_tokens) {
				onChunk({
					usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 }
				});
			}

			for (const fragment of delta?.tool_calls ?? []) {
				const slot = pending.get(fragment.index) ?? { id: '', name: '', arguments: '' };
				if (fragment.id) slot.id = fragment.id;
				if (fragment.function?.name) slot.name = fragment.function.name;
				if (fragment.function?.arguments) slot.arguments += fragment.function.arguments;
				pending.set(fragment.index, slot);
			}
		}

		// An aborted stream leaves half-written arguments behind: acting on those is
		// worse than dropping the call the user just cancelled.
		if (abortSignal.aborted || !pending.size) return;

		const toolCalls = [...pending.entries()]
			.sort(([a], [b]) => a - b)
			.map(([, slot]) => ({
				// Some OpenAI-compatible servers omit the id entirely; the pairing still
				// has to be unambiguous when the answer goes back.
				id: slot.id || newToolCallId(),
				name: slot.name,
				arguments: slot.arguments
			}))
			.filter((call) => call.name);

		if (toolCalls.length) onChunk({ toolCalls });
	}

	async complete(payload: ChatRequest): Promise<string> {
		const messages = this.formatMessages(payload.messages);

		// `complete()` serves the short internal errands (routing a search, naming a
		// session) where the answer is a handful of words and reasoning is pure cost:
		// a round trip spent deliberating, and a reply the caller then has to dig the
		// answer out of. Ask for it to be off, with the same scoping and the same
		// retry-on-400 as `chat()`, since the field is not universally understood.
		const noThinkBody = supportsThinkingRequest(this.server.connectionType)
			? { chat_template_kwargs: { enable_thinking: false } }
			: undefined;

		const send = (extraBody: Record<string, unknown> | undefined) =>
			this.openai.chat.completions.create({
				model: payload.model,
				messages,
				temperature: payload.options?.temperature,
				stream: false,
				...extraBody
			});

		const response = await withThinkingField(this.server.id, payload.model, send, noThinkBody);

		// Belt and braces: the flag is a request, not a guarantee, and a model that
		// reasons anyway does it inline in the content.
		return stripThinkTags(response.choices?.[0]?.message?.content ?? '');
	}

	async getModels(): Promise<Model[]> {
		const response = await this.openai.models.list();
		return response.data
			?.filter((model) => model.id.startsWith(this.server.modelFilter || ''))
			.map((model) => ({
				serverId: this.server.id,
				name: model.id
			}));
	}

	async verifyServer(): Promise<boolean> {
		try {
			await this.getModels();
			return true;
		} catch (error) {
			console.error('OpenAI verification failed:', error);
			return false;
		}
	}
}

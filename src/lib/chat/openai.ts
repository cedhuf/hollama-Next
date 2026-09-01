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
 * An id for a tool call the provider did not give one. Nine alphanumeric
 * characters, which Mistral validates exactly and OpenAI accepts. Unique only
 * inside one turn, which is the whole life of the pairing.
 */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function newToolCallId(): string {
	// `crypto` rather than `Math.random`: either would do here, but an identifier
	// generator built on the non-cryptographic one gets copied somewhere it matters.
	const bytes = crypto.getRandomValues(new Uint8Array(9));
	return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

/** Providers word it differently and none give a code, so the field name is the only thing they have in common. Read across the whole error, since the detail lands differently behind a proxy. */
function mentionsThinkingField(error: unknown): boolean {
	// Guarded, because this runs inside a `catch`: a circular reference would make
	// `JSON.stringify` throw and replace the real failure with an unrelated one.
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
 * The refusal is a 400, so asking every turn is a round trip spent to be told
 * what was true last time. In memory rather than stored: it costs one refusal
 * per session and heals itself the day the endpoint learns the field. Keyed by
 * connection as well, since the same name is served by different builds.
 */
const refusedThinking = new Set<string>();

const thinkingKey = (serverId: string, model: string) => `${serverId}:${model}`;

/**
 * Run a request carrying `chat_template_kwargs`, and learn from a refusal.
 *
 * Shared by both paths: `chat()` asks for reasoning and `complete()` asks for it
 * to be off, but an endpoint that refuses the field refuses both, so one of them
 * finding out is enough.
 *
 * Recorded only once the same request has succeeded without the field, or a 400
 * about something else would switch reasoning off for the session.
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
 * The sampling a conversation carries, in this API's words. Stored under
 * Ollama's names, which is the vocabulary the app grew up with, and used to
 * reach Ollama alone: a temperature set on a conversation did nothing the moment
 * the model was not local.
 *
 * Only what this API defines. `top_k`, `min_p` and the mirostat trio are
 * llama.cpp's, and an endpoint that does not know a field answers 400.
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
		// wants the field left out.
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
			// An answer from a tool, paired to its call by id. Sent back verbatim.
			if (message.role === 'tool') {
				return {
					role: 'tool',
					// A last resort that cannot put back a lost pairing: an id invented here
					// matches no call. It only makes the refusal legible, where an empty string is
					// malformed as well as unmatched.
					tool_call_id: message.toolCallId || newToolCallId(),
					content: message.content
				};
			}

			// The turn where the model asked, replayed with the calls attached: a `tool`
			// message answering a call the conversation no longer contains is rejected by
			// every provider.
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
				// The vision API only takes the user role for images.
				return { role: 'user' as const, content };
			} else {
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

		// Self-hosted OpenAI-compatible servers and Infomaniak gate the model's
		// chain-of-thought behind a chat-template flag passed per request. Real OpenAI
		// and Claude reject unknown body fields, so this is scoped to the endpoints that
		// accept it, and retried once without it if rejected.
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
			// Without this a streamed answer carries no `usage` block, so every turn goes
			// uncounted. Servers that do not know the field ignore it.
			stream_options: { include_usage: true },
			...sampling,
			...(tools ? { tools } : {}),
			// Sent only when it is `none`, the one value that says anything: `auto` is
			// every provider's default, and a field nobody needs is one that can be refused.
			...(tools && toolChoice === 'none' ? { tool_choice: 'none' as const } : {}),
			...extraBody
		});

		// Tool calls stream in fragments keyed by position: one delta carries the id
		// and name, the next few slices of the argument JSON. Assembled here and
		// emitted once, since nothing is usable until the stream ends.
		const pending = new Map<number, { id: string; name: string; arguments: string }>();

		for await (const chunk of response) {
			if (abortSignal.aborted) break;
			// Reasoning over OpenAI-compatible endpoints arrives in a non-standard delta
			// field: `reasoning_content` or `reasoning`, depending on the build. Inline
			// <think> tags in `content` are still split out downstream by the FSM.
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

			// The last chunk carries the totals and no delta. Forwarded as it is.
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

		// An aborted stream leaves half-written arguments behind, and acting on those
		// is worse than dropping the call the user just cancelled.
		if (abortSignal.aborted || !pending.size) return;

		const toolCalls = [...pending.entries()]
			.sort(([a], [b]) => a - b)
			.map(([, slot]) => ({
				// Some servers omit the id entirely; the pairing still has to be unambiguous.
				id: slot.id || newToolCallId(),
				name: slot.name,
				arguments: slot.arguments
			}))
			.filter((call) => call.name);

		if (toolCalls.length) onChunk({ toolCalls });
	}

	async complete(payload: ChatRequest): Promise<string> {
		const messages = this.formatMessages(payload.messages);

		// `complete()` serves the short internal errands, where reasoning is pure cost:
		// a round trip spent deliberating and a reply the caller has to dig the answer
		// out of. Same scoping and same retry-on-400 as `chat()`.
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

		// Belt and braces: the flag is a request, and a model that reasons anyway does
		// it inline in the content.
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

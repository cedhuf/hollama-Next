import type {
	ChatResponse,
	ErrorResponse,
	ListResponse,
	ProgressResponse,
	PullRequest,
	StatusResponse
} from 'ollama/browser';

import type { Server } from '$lib/connections';
import type { Model } from '$lib/settings';

import { ollamaBaseUrl, type EndpointOptions } from './endpoint';
import {
	stripThinkTags,
	type ChatRequest as AppChatRequest,
	type ChatChunk,
	type ChatStrategy
} from './index';
import { withLoadOptions } from './options';

export interface OllamaOptions {
	numa: boolean;
	num_ctx: number;
	num_batch: number;
	num_gpu: number;
	main_gpu: number;
	low_vram: boolean;
	f16_kv: boolean;
	// logits_all: boolean; // REF https://github.com/ollama/ollama-js/issues/145
	vocab_only: boolean;
	use_mmap: boolean;
	use_mlock: boolean;
	// embedding_only: boolean; // REF https://github.com/ollama/ollama-js/issues/145
	num_thread: number;

	// Runtime options
	num_keep: number;
	seed: number;
	num_predict: number;
	top_k: number;
	top_p: number;
	min_p: number; // REF https://github.com/ollama/ollama-js/issues/145
	typical_p: number;
	repeat_last_n: number;
	temperature: number;
	repeat_penalty: number;
	presence_penalty: number;
	frequency_penalty: number;
	mirostat: number;
	mirostat_tau: number;
	mirostat_eta: number;
	penalize_newline: boolean;
	stop: string[];
}

/** Ollama's shape for a call it wants made. */
interface OllamaToolCall {
	function?: { name?: string; arguments?: Record<string, unknown> };
}

/** A call whose JSON does not parse cannot be made. Throwing would take the whole request down over one malformed argument list, which small models produce routinely; an empty object lets the tool report a useless call. */
function safeParseArguments(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export class OllamaStrategy implements ChatStrategy {
	private base: string;

	/** Per-(server, model) cache of whether the model advertises the `thinking` capability. */
	private static thinkingSupport = new Map<string, boolean>();

	/** The same, for `tools`. */
	private static toolSupport = new Map<string, boolean>();

	constructor(
		private server: Server,
		options: EndpointOptions = {}
	) {
		this.base = ollamaBaseUrl(server, options);
	}

	/**
	 * The opposite default to `supportsThinking`: unknown means no. Thinking has a
	 * runtime fallback, tool calling has none: a model offered tools it cannot call
	 * improvises, and the user gets a JSON blob or a promise to search that never
	 * happened.
	 */
	async supportsTools(model: string): Promise<boolean> {
		const key = `${this.base}::${model}`;
		const cached = OllamaStrategy.toolSupport.get(key);
		if (cached !== undefined) return cached;

		try {
			const response = await fetch(`${this.base}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model })
			});
			if (!response.ok) return false;
			const data = await response.json();
			const supported = Array.isArray(data?.capabilities)
				? data.capabilities.includes('tools')
				: false; // capabilities absent (older Ollama) → assume not
			OllamaStrategy.toolSupport.set(key, supported);
			return supported;
		} catch {
			return false;
		}
	}

	/** Passing `think: true` to a model without the capability makes recent Ollama answer 400. Unknown is assumed yes, with the runtime fallback in `chat()` to catch a wrong guess. */
	private async supportsThinking(model: string): Promise<boolean> {
		const key = `${this.base}::${model}`;
		const cached = OllamaStrategy.thinkingSupport.get(key);
		if (cached !== undefined) return cached;

		try {
			const response = await fetch(`${this.base}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model })
			});
			if (!response.ok) return true; // unknown → assume yes, rely on fallback
			const data = await response.json();
			const supported = Array.isArray(data?.capabilities)
				? data.capabilities.includes('thinking')
				: true; // capabilities absent (older Ollama) → assume yes, rely on fallback
			OllamaStrategy.thinkingSupport.set(key, supported);
			return supported;
		} catch {
			return true; // network/parse issue → assume yes, rely on fallback
		}
	}

	/** Merged here rather than by each caller, because there are four of them and a merge written per call site is one missing from the fifth. */
	private optionsFor(payload: AppChatRequest) {
		return withLoadOptions(payload.options, this.server.loadOptions);
	}

	async chat(
		payload: AppChatRequest,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const wantThink = payload.think !== false;
		const useThink = wantThink && (await this.supportsThinking(payload.model));

		try {
			await this.streamChat(payload, useThink, abortSignal, onChunk);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// A model rejected thinking despite the capability check: remember it and retry
			// once without, so the chat still completes.
			if (useThink && /does not support thinking/i.test(message)) {
				OllamaStrategy.thinkingSupport.set(`${this.base}::${payload.model}`, false);
				await this.streamChat(payload, false, abortSignal, onChunk);
				return;
			}
			throw error;
		}
	}

	private async streamChat(
		payload: AppChatRequest,
		think: boolean,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		// `think: false` is always safe, and `think: true` only reaches models already
		// verified.
		//
		// `toolChoice` is dropped rather than forwarded: Ollama has no such field. Its
		// one meaningful value is honoured below by withholding the tools, which is the
		// only way to say "not this turn" to an endpoint with no parameter for it.
		const { toolChoice, ...rest } = payload;
		const offerTools = toolChoice !== 'none' && !!payload.tools?.length;

		const body = {
			...rest,
			options: this.optionsFor(payload),
			think,
			// Ollama takes the same shape as everyone else, one level deeper.
			...(offerTools
				? {
						tools: payload.tools!.map((tool) => ({
							type: 'function',
							function: {
								name: tool.name,
								description: tool.description,
								parameters: tool.parameters
							}
						}))
					}
				: {}),
			messages: payload.messages.map((message) => ({
				role: message.role,
				content: message.content,
				...(message.images ? { images: message.images } : {}),
				...(message.toolName ? { tool_name: message.toolName } : {}),
				...(message.toolCalls?.length
					? {
							tool_calls: message.toolCalls.map((call) => ({
								function: {
									name: call.name,
									// Ollama wants an object here, not the JSON text the model wrote.
									arguments: safeParseArguments(call.arguments)
								}
							}))
						}
					: {})
			}))
		};

		const response = await fetch(`${this.base}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'text/event-stream' },
			body: JSON.stringify(body),
			signal: abortSignal
		});

		if (!response.body) throw new Error('Ollama response is missing body');

		const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

		while (true) {
			const { value, done } = await reader.read();

			if (done) break;

			if (!response.ok && value) throw new Error(JSON.parse(value).error);
			if (!value) continue;

			const chatResponses = value.split('\n').filter((line) => line);

			for (const chatResponse of chatResponses) {
				const parsed = JSON.parse(chatResponse) as ChatResponse & {
					prompt_eval_count?: number;
					eval_count?: number;
				};
				const { message } = parsed;

				// Ollama puts its counts on the final object, unasked. Forwarded as it is.
				if (parsed.prompt_eval_count || parsed.eval_count) {
					onChunk({
						usage: {
							input: parsed.prompt_eval_count ?? 0,
							output: parsed.eval_count ?? 0
						}
					});
				}
				// Reasoning models stream `thinking` separately from `content`.
				if (message.thinking) onChunk({ thinking: message.thinking });
				if (message.content) onChunk({ content: message.content });

				// Whole, in one message, with the arguments already parsed: none of the
				// fragment reassembly the OpenAI path needs. No call id either, so one is minted.
				const calls = (message as { tool_calls?: OllamaToolCall[] }).tool_calls;
				if (calls?.length && !abortSignal.aborted) {
					onChunk({
						toolCalls: calls.map((call, index) => ({
							id: `call_${index}_${Date.now()}`,
							name: call.function?.name ?? '',
							arguments: JSON.stringify(call.function?.arguments ?? {})
						}))
					});
				}
			}
		}
	}

	async complete(payload: AppChatRequest): Promise<string> {
		const response = await fetch(`${this.base}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: payload.model,
				messages: payload.messages.map((m) => ({ role: m.role, content: m.content })),
				options: this.optionsFor(payload),
				stream: false,
				// The short internal errands do not want reasoning: it costs a round trip and
				// buries the one line the caller is after. `false` is accepted by every model.
				think: false
			})
		});
		if (!response.ok) return '';
		const data = await response.json();
		// Ollama returns reasoning in `message.thinking`, but a model that ignores
		// `think: false` falls back to inline tags.
		return stripThinkTags(data?.message?.content ?? '');
	}

	async getModels(): Promise<Model[]> {
		const response = await fetch(`${this.base}/api/tags`);
		if (!response.ok) throw new Error('Failed to fetch Ollama tags');

		const data: ListResponse | undefined = await response.json();
		if (!data || !Array.isArray(data.models)) {
			throw new Error('Failed to parse Ollama tags', { cause: data });
		}

		return data.models
			?.filter((model) => model.name.startsWith(this.server.modelFilter || ''))
			.map((model) => ({
				...model,
				serverId: this.server.id,
				parameterSize: model.details.parameter_size,
				modifiedAt: new Date(model.modified_at)
			}));
	}

	async pull(
		payload: PullRequest,
		onChunk: (progress: ProgressResponse | StatusResponse | ErrorResponse) => void
	): Promise<void> {
		const response = await fetch(`${this.base}/api/pull`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!response.body) throw new Error('Ollama response is missing body');

		const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

		while (true) {
			const { value, done } = await reader.read();

			if (done) break;

			if (!response.ok && value) throw new Error(JSON.parse(value).error);
			if (!value) continue;

			const progressUpdates = value.split('\n').filter((line) => line);

			for (const update of progressUpdates) {
				const progressResponse = JSON.parse(update) as ProgressResponse;
				onChunk(progressResponse);
			}
		}
	}

	async verifyServer(): Promise<boolean> {
		try {
			await this.getModels();
			return true;
		} catch (error) {
			console.error('Ollama verification failed:', error);
			return false;
		}
	}
}

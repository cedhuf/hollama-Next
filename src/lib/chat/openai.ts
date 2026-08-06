import OpenAI from 'openai';
import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam,
	ChatCompletionTool
} from 'openai/resources/index.mjs';

import { supportsThinkingRequest, type Server } from '$lib/connections';
import type { Model } from '$lib/settings';

import { openaiClientConfig } from './endpoint';
import {
	stripThinkTags,
	type ChatChunk,
	type ChatRequest,
	type ChatStrategy,
	type Message
} from './index';

export class OpenAIStrategy implements ChatStrategy {
	private openai: OpenAI;

	constructor(private server: Server) {
		const config = openaiClientConfig(this.server);
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
					tool_call_id: message.toolCallId ?? '',
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
		// has to be passed per request — the server-side default isn't always applied.
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

		try {
			await this.streamChat(
				payload.model,
				formattedMessages,
				thinkBody,
				tools,
				abortSignal,
				onChunk
			);
		} catch (error) {
			// A server that doesn't understand `chat_template_kwargs` answers 400 — drop
			// the extra field and retry so the chat still completes (without reasoning).
			const status = (error as { status?: number } | null)?.status;
			if (thinkBody && status === 400) {
				await this.streamChat(
					payload.model,
					formattedMessages,
					undefined,
					tools,
					abortSignal,
					onChunk
				);
				return;
			}
			throw error;
		}
	}

	private async streamChat(
		model: string,
		messages: ChatCompletionMessageParam[],
		extraBody: Record<string, unknown> | undefined,
		tools: ChatCompletionTool[] | undefined,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const response = await this.openai.chat.completions.create({
			model,
			messages,
			stream: true,
			...(tools ? { tools } : {}),
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
			.map(([index, slot]) => ({
				// Some OpenAI-compatible servers omit the id entirely; the pairing still
				// has to be unambiguous when the answer goes back.
				id: slot.id || `call_${index}`,
				name: slot.name,
				arguments: slot.arguments
			}))
			.filter((call) => call.name);

		if (toolCalls.length) onChunk({ toolCalls });
	}

	async complete(payload: ChatRequest): Promise<string> {
		const messages = this.formatMessages(payload.messages);

		// `complete()` serves the short internal errands — routing a search, naming a
		// session — where the answer is a handful of words and reasoning is pure cost:
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

		let response;
		try {
			response = await send(noThinkBody);
		} catch (error) {
			const status = (error as { status?: number } | null)?.status;
			if (!noThinkBody || status !== 400) throw error;
			response = await send(undefined);
		}

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

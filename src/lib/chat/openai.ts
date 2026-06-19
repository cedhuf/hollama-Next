import OpenAI from 'openai';
import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam
} from 'openai/resources/index.mjs';

import { ConnectionType, type Server } from '$lib/connections';
import type { Model } from '$lib/settings';

import { openaiClientConfig } from './endpoint';
import type { ChatChunk, ChatRequest, ChatStrategy, Message } from './index';

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

		// Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, SGLang, …) gate the
		// model's chain-of-thought behind a chat-template flag that has to be passed
		// per request — the server-side default isn't always applied. Real OpenAI /
		// Claude reject unknown body fields, so only send it to generic
		// OpenAI-compatible endpoints, and retry once without it if rejected.
		const wantThink = payload.think !== false;
		const thinkBody =
			wantThink && this.server.connectionType === ConnectionType.OpenAICompatible
				? { chat_template_kwargs: { enable_thinking: true } }
				: undefined;

		try {
			await this.streamChat(payload.model, formattedMessages, thinkBody, abortSignal, onChunk);
		} catch (error) {
			// A server that doesn't understand `chat_template_kwargs` answers 400 — drop
			// the extra field and retry so the chat still completes (without reasoning).
			const status = (error as { status?: number } | null)?.status;
			if (thinkBody && status === 400) {
				await this.streamChat(payload.model, formattedMessages, undefined, abortSignal, onChunk);
				return;
			}
			throw error;
		}
	}

	private async streamChat(
		model: string,
		messages: ChatCompletionMessageParam[],
		extraBody: Record<string, unknown> | undefined,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const response = await this.openai.chat.completions.create({
			model,
			messages,
			stream: true,
			...extraBody
		});

		for await (const chunk of response) {
			if (abortSignal.aborted) break;
			// Reasoning over OpenAI-compatible endpoints arrives in a non-standard delta
			// field: `reasoning_content` (DeepSeek, vLLM, llama.cpp, SGLang) or
			// `reasoning` (OpenRouter and some vLLM builds). Surface either into the
			// separate reasoning panel; inline <think> tags in `content` are still split
			// out downstream by the FSM processor.
			const delta = chunk.choices?.[0]?.delta as
				| { content?: string | null; reasoning_content?: string; reasoning?: string }
				| undefined;
			const thinking = delta?.reasoning_content ?? delta?.reasoning;
			if (thinking) onChunk({ thinking });
			if (delta?.content) onChunk({ content: delta.content });
		}
	}

	async complete(payload: ChatRequest): Promise<string> {
		const response = await this.openai.chat.completions.create({
			model: payload.model,
			messages: payload.messages.map((m) => ({ role: m.role, content: m.content })),
			temperature: payload.options?.temperature,
			stream: false
		});
		return response.choices?.[0]?.message?.content ?? '';
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

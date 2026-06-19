import type {
	ChatRequest,
	ChatResponse,
	ErrorResponse,
	ListResponse,
	ProgressResponse,
	PullRequest,
	StatusResponse
} from 'ollama/browser';

import type { Server } from '$lib/connections';
import type { Model } from '$lib/settings';

import { ollamaBaseUrl } from './endpoint';
import type { ChatRequest as AppChatRequest, ChatChunk, ChatStrategy } from './index';

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
	tfs_z: number;
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

export class OllamaStrategy implements ChatStrategy {
	private base: string;

	/** Per-(server, model) cache of whether the model advertises the `thinking` capability. */
	private static thinkingSupport = new Map<string, boolean>();

	constructor(private server: Server) {
		this.base = ollamaBaseUrl(server);
	}

	/**
	 * Ask `/api/show` whether a model supports thinking. Passing `think: true` to a
	 * model without the capability makes recent Ollama return HTTP 400, so we gate on
	 * this. When the answer is unknown (old Ollama, network error) we optimistically
	 * assume yes and rely on the runtime fallback in `chat()`.
	 */
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

	async chat(
		payload: ChatRequest,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		const wantThink = (payload as AppChatRequest).think !== false;
		const useThink = wantThink && (await this.supportsThinking(payload.model));

		try {
			await this.streamChat(payload, useThink, abortSignal, onChunk);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Belt-and-suspenders: a model rejected thinking despite our capability check.
			// Remember it and retry once without thinking so the chat still completes.
			if (useThink && /does not support thinking/i.test(message)) {
				OllamaStrategy.thinkingSupport.set(`${this.base}::${payload.model}`, false);
				await this.streamChat(payload, false, abortSignal, onChunk);
				return;
			}
			throw error;
		}
	}

	private async streamChat(
		payload: ChatRequest,
		think: boolean,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void> {
		// Forward the resolved boolean: `think: false` is always safe, and `think: true`
		// only reaches models we already verified support it.
		const body = { ...payload, think };

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
				const { message } = JSON.parse(chatResponse) as ChatResponse;
				// Reasoning models stream `thinking` separately from `content`.
				if (message.thinking) onChunk({ thinking: message.thinking });
				if (message.content) onChunk({ content: message.content });
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
				options: payload.options,
				stream: false
			})
		});
		if (!response.ok) return '';
		const data = await response.json();
		return data?.message?.content ?? '';
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

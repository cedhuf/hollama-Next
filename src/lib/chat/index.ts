import type { ErrorResponse, ProgressResponse, PullRequest, StatusResponse } from 'ollama/browser';
import { get } from 'svelte/store';

import { sessionsStore, settingsStore } from '$lib/localStorage';
import type { Model } from '$lib/settings';

import { type OllamaOptions } from './ollama';

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	images?: string[]; // Optional array of base64 image strings
}

export interface ChatRequest {
	model: string;
	messages: Message[];
	stream?: boolean;
	options?: Partial<OllamaOptions>;
	/**
	 * Whether the user allows the model to reason ("auto"). Defaults to true.
	 * Ollama only enables thinking when the model actually supports it; set to
	 * false to never request it (e.g. title generation, or a per-session toggle).
	 */
	think?: boolean;
}

/** A single streamed delta: regular `content` and/or separate reasoning `thinking`. */
export type ChatChunk = { content?: string; thinking?: string };

/**
 * The answer without the model's chain-of-thought.
 *
 * Providers that expose reasoning in a field of its own (Ollama's `thinking`,
 * `reasoning_content` over OpenAI-compatible endpoints) are already separated for
 * us. The rest emit `<think>…</think>` inline in the content, which the streaming
 * path splits out downstream — but `complete()` returns the raw string, so every
 * one-shot caller has to do it here or read the model's deliberation as if it were
 * the answer. A router that replies `<think>Hmm, is this real?…</think>NONE` is
 * indistinguishable from one that replies nothing at all.
 *
 * An unclosed block counts as thinking to the end: a truncated reply is all
 * deliberation and no answer.
 */
export function stripThinkTags(raw: string): string {
	return raw
		.replace(/<think>[\s\S]*?<\/think>/gi, '')
		.replace(/<think>[\s\S]*$/i, '')
		.trim();
}

export interface ChatStrategy {
	chat(
		payload: ChatRequest,
		abortSignal: AbortSignal,
		onChunk: (part: ChatChunk) => void
	): Promise<void>;

	getModels(): Promise<Model[]>;

	/** A single non-streaming completion (used to let the model decide on search). */
	complete?(payload: ChatRequest): Promise<string>;

	pull?(
		payload: PullRequest,
		onChunk: (progress: ProgressResponse | StatusResponse | ErrorResponse) => void
	): Promise<void>;
}

export function getLastUsedModels(): Model[] {
	const currentSessions = get(sessionsStore);
	const models = get(settingsStore)?.models;
	if (!models) return [];

	const lastUsedModels: Model[] = [];

	for (const session of currentSessions) {
		if (lastUsedModels.find((m) => m.name === session.model?.name)) continue;

		const model = models.find((model) => model.name === session.model?.name);
		if (!model) continue;
		lastUsedModels.push(model);

		if (lastUsedModels.length >= 5) break;
	}

	return lastUsedModels;
}

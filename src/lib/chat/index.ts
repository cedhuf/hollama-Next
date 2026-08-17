import type { ErrorResponse, ProgressResponse, PullRequest, StatusResponse } from 'ollama/browser';
import { get } from 'svelte/store';

import { sessionsStore, settingsStore } from '$lib/localStorage';
import type { Model } from '$lib/settings';
import type { TokenCount } from '$lib/usageCounts';

import { type OllamaOptions } from './ollama';

/**
 * A tool the model may call, in the shape every provider agreed on: a name, a
 * sentence telling the model when to reach for it, and a JSON Schema for its
 * arguments.
 */
export interface ToolSpec {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, unknown>;
		required?: string[];
	};
}

/** A call the model asked for. */
export interface ToolCall {
	/** The provider's id for this call, echoed back on the answer so they pair up. */
	id: string;
	name: string;
	/**
	 * The arguments exactly as the model wrote them, still JSON text.
	 *
	 * Not parsed here on purpose: this layer does not know any tool's schema, and a
	 * small model writing malformed JSON is a routine event that the caller has to
	 * handle as a failed call rather than as a crashed request.
	 */
	arguments: string;
}

export interface Message {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	images?: string[]; // Optional array of base64 image strings
	/** Set on an assistant turn that asked for one or more tools. */
	toolCalls?: ToolCall[];
	/** Set on a `tool` message: the id of the call it answers. */
	toolCallId?: string;
	/** Set on a `tool` message: the tool that produced it. Ollama pairs on the name. */
	toolName?: string;
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
	/** Tools the model may call this turn. Absent means none are offered. */
	tools?: ToolSpec[];
}

/**
 * A single streamed delta: regular `content`, separate reasoning `thinking`,
 * and/or the tool calls the turn ended on.
 *
 * Tool calls arrive whole. Providers stream them in fragments — OpenAI sends the
 * name and then the arguments a few characters at a time, keyed by an index that
 * has to be reassembled — and every caller doing that reassembly itself would be
 * the same bug written three times. Each strategy accumulates internally and
 * emits the finished calls once, at the end of the stream.
 */
export type ChatChunk = {
	content?: string;
	thinking?: string;
	toolCalls?: ToolCall[];
	/**
	 * What the provider says the turn consumed, on the chunk that carries it.
	 *
	 * Only ever the provider's own figure. Our character-count estimate colours a
	 * ring; it has no business deciding what somebody spent. Absent on every
	 * chunk but the last, and absent entirely from providers that do not report.
	 */
	usage?: TokenCount;
};

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

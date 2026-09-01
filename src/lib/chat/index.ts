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
	/** Not parsed here: this layer knows no tool's schema, and a small model writing malformed JSON is routine and has to reach the caller as a failed call. */
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
	/** Whether the model may reason ("auto"). Ollama only enables it where the model supports it; false never requests it, for a title or a per-session toggle. */
	think?: boolean;
	/** Tools the model may call this turn. Absent means none are offered. */
	tools?: ToolSpec[];
	/**
	 * Whether the model may reach for those tools this turn.
	 *
	 * `none` keeps the definitions in the request and forbids calling them.
	 * Withdrawing the `tools` array does the same by accident and costs twice: it
	 * changes the request's prefix, so the prompt cache misses where the
	 * conversation is longest, and nothing says why the model may no longer call
	 * what it could a moment ago.
	 *
	 * Absent means `auto`, every provider's default.
	 */
	toolChoice?: 'auto' | 'none';
}

/**
 * A single streamed delta: `content`, separate `thinking`, and the tool calls
 * the turn ended on.
 *
 * Tool calls arrive whole. Providers stream them in fragments keyed by an index
 * that has to be reassembled, and every caller doing that itself would be the
 * same bug written three times, so each strategy accumulates internally.
 */
export type ChatChunk = {
	content?: string;
	thinking?: string;
	toolCalls?: ToolCall[];
	/** Only ever the provider's own figure: the character-count estimate colours a ring and has no business deciding what somebody spent. */
	usage?: TokenCount;
};

/**
 * The answer without the model's chain-of-thought.
 *
 * Providers with a field of their own are already separated for us. The rest
 * emit `<think>…</think>` inline, which the streaming path splits out
 * downstream, but `complete()` returns the raw string: a router replying
 * `<think>Hmm…</think>NONE` is otherwise indistinguishable from one replying
 * nothing.
 *
 * An unclosed block counts as thinking to the end.
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

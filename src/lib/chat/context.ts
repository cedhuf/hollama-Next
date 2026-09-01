import { get } from 'svelte/store';

import { personaMemoryStore } from '$lib/localStorage';
import { indexLine } from '$lib/personaMemory';
import { personasConfig } from '$lib/personasConfig';
import type { Message, Session } from '$lib/sessions';

import { conversationBoundary, messagesInContext, type ContextNote } from './notes';
import type { SamplingOptions } from './options';
import { formatSourceIndex, recallSearches } from './sourceIndex';

/**
 * How heavy a conversation is, and how much of the model's context it uses.
 *
 * There is no tokenizer in the browser: shipping one would mean a megabyte of
 * vocabulary per model family for a number that only has to colour an icon and
 * decide when to compact. Estimated from character counts, and labelled as an
 * estimate everywhere it is shown.
 */

/**
 * Characters per token: ~4 for English, ~3 for French and other accented
 * languages. 3.7 overestimates a little on English prose, which is the safe
 * direction: compacting early costs one summary, late costs a refused request.
 */
const CHARS_PER_TOKEN = 3.7;

/** Role framing, separators and the message envelope every provider adds. */
const TOKENS_PER_MESSAGE = 4;

/** Vision models bill images by tile, not by byte, so the base64 length says nothing. ~1100 is the common cost of one full-resolution tile grid. */
const TOKENS_PER_IMAGE = 1100;

export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: Message): number {
	let tokens = TOKENS_PER_MESSAGE + estimateTokens(message.content ?? '');
	// Reasoning is sent back on some providers and is what makes a conversation
	// heavy: leaving it out reports a reassuring number about a full context.
	tokens += estimateTokens(message.reasoning ?? '');
	tokens += (message.images?.length ?? 0) * TOKENS_PER_IMAGE;
	if (message.knowledge?.content) tokens += estimateTokens(message.knowledge.content);
	return tokens;
}

/** Only the list itself: the prompt around it is a fixed cost shared with every other injected instruction, none of which this estimate counts either. */
export function estimateSourceIndexTokens(messages: Message[]): number {
	const searches = recallSearches(messages);
	if (!searches.length) return 0;
	return estimateTokens(formatSourceIndex(searches));
}

export interface CompactionSavings {
	/** Estimated tokens the replaced stretch of conversation was worth. */
	before: number;
	/** What the summary standing in for it costs. */
	after: number;
	/** `before - after`, negative when the summary is the more expensive of the two. */
	saved: number;
	/** Share of the original weight removed, 0 to 1. */
	ratio: number;
}

/** Computed from the messages rather than stored on the marker, which is possible because nothing is deleted: the stretch a marker replaced is still above it. So older summaries report their figures too. */
export function compactionSavings(messages: Message[], markerIndex: number): CompactionSavings {
	const marker = messages[markerIndex];
	if (marker?.note?.kind !== 'compaction') return { before: 0, after: 0, saved: 0, ratio: 0 };

	// Back to the previous marker, inclusive: an earlier summary was part of what
	// this compaction was handed.
	let start = 0;
	for (let i = markerIndex - 1; i >= 0; i--) {
		if (messages[i].note?.kind === 'compaction') {
			start = i;
			break;
		}
	}

	let before = 0;
	for (let i = start; i < markerIndex; i++) before += estimateMessageTokens(messages[i]);
	const after = estimateMessageTokens(marker);

	return {
		before,
		after,
		saved: before - after,
		ratio: before > 0 ? Math.max(0, (before - after) / before) : 0
	};
}

export type ContextLevel = 'ok' | 'warn' | 'high';

export interface ContextUsage {
	/** Estimated tokens in what would be sent right now. */
	tokens: number;
	/** The ceiling used for the ratio. */
	limit: number;
	/** Where the ceiling comes from: the tooltip words itself differently for each. */
	limitSource: 'model' | 'threshold';
	/** `tokens / limit`, clamped to 1. */
	ratio: number;
	level: ContextLevel;
	/** Messages currently in context (excluding the system prompt). */
	messageCount: number;
	/** Messages already summarised away by earlier compactions. */
	compactedCount: number;
}

/**
 * `num_ctx` is the only context size the app knows: Ollama takes it per request,
 * so where the user set it, it is the truth. Every other provider keeps its
 * window to itself, so the fallback is the threshold from Settings, which is why
 * that is configurable rather than derived.
 */
export function resolveContextLimit(
	session: Session,
	threshold: number,
	/** The conversation's own options over the account's; its own alone when omitted. */
	options: SamplingOptions = session.options
): { limit: number; limitSource: 'model' | 'threshold' } {
	const numCtx = options?.num_ctx;
	if (typeof numCtx === 'number' && numCtx > 0) return { limit: numCtx, limitSource: 'model' };
	return { limit: threshold, limitSource: 'threshold' };
}

export function contextUsage(
	session: Session,
	threshold: number,
	options: SamplingOptions = session.options
): ContextUsage {
	const boundary = conversationBoundary(session.messages);
	const compacted = boundary.note?.kind === 'compaction' ? boundary.index : -1;
	const active = messagesInContext(session.messages);

	let tokens = estimateTokens(session.systemPrompt?.content ?? '');
	for (const message of active) tokens += estimateMessageTokens(message);
	// The index of earlier sources is built at send time, so it is in the request
	// without being in the messages. Left out, the gauge would read low on exactly
	// the conversations that carry the most of it.
	tokens += estimateSourceIndexTokens(active);

	const { limit, limitSource } = resolveContextLimit(session, threshold, options);
	const ratio = limit > 0 ? Math.min(tokens / limit, 1) : 0;

	return {
		tokens,
		limit,
		limitSource,
		ratio,
		level: ratio >= 0.85 ? 'high' : ratio >= 0.6 ? 'warn' : 'ok',
		messageCount: active.length - (compacted === -1 ? 0 : 1),
		compactedCount: compacted === -1 ? 0 : compacted
	};
}

/** `12 400` → `12.4k`. Compact enough to sit next to the icon without wrapping. */
export function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${Math.round(tokens / 1000)}k`;
}

/** A document's name rather than its text: a message carrying a PDF holds the whole of it in `content`, and its first line says nothing about which file it is. */
function preview(message: Message): string {
	if (message.document?.name) return message.document.name;
	const text = (message.content ?? '').trim().replace(/\s+/g, ' ');
	return text.length > 80 ? `${text.slice(0, 79)}\u2026` : text;
}

/**
 * Freeze what the context holds right now, for `/context`.
 *
 * The totals come from `contextUsage`, the same function the ring reads, so the
 * two can never disagree. What is added is the breakdown, and which single
 * message carries the most: "why is my context full" usually has one answer.
 */
export function contextSnapshot(session: Session, threshold: number): ContextNote {
	const usage = contextUsage(session, threshold);
	const active = messagesInContext(session.messages);

	const systemTokens = estimateTokens(session.systemPrompt?.content ?? '');
	const sourceTokens = estimateSourceIndexTokens(active);

	// Only the part paid on every message: the profile and one line per note. A
	// note's body is paid when it is opened.
	const remembered = session.personaId
		? get(personaMemoryStore).find((memory) => memory.id === session.personaId)
		: undefined;
	const memoryTokens =
		remembered && get(personasConfig).memoryEnabled
			? estimateTokens([remembered.profile, ...remembered.notes.map(indexLine)].join('\n'))
			: 0;

	let messageTokens = 0;
	let heaviest: ContextNote['heaviest'];
	for (const message of active) {
		const tokens = estimateMessageTokens(message);
		messageTokens += tokens;
		if (!heaviest || tokens > heaviest.tokens) {
			heaviest = { role: message.role, tokens, preview: preview(message) };
		}
	}

	return {
		kind: 'context',
		generatedAt: new Date().toISOString(),
		tokens: usage.tokens,
		limit: usage.limit,
		limitSource: usage.limitSource,
		systemTokens,
		messageTokens,
		sourceTokens,
		memoryTokens,
		messageCount: usage.messageCount,
		totalCount: session.messages.filter((message) => !message.note).length,
		heaviest: heaviest?.preview ? heaviest : undefined,
		model: session.model?.name
	};
}

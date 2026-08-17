import type { Message, Session } from '$lib/sessions';

import { conversationBoundary, messagesInContext } from './notes';
import { formatSourceIndex, recallSearches } from './sourceIndex';

/**
 * How heavy a conversation is, and how much of the model's context it uses.
 *
 * There is no tokenizer in the browser — shipping one would mean a megabyte of
 * vocabulary per model family, for a number that only has to be right enough to
 * colour an icon and to decide when to compact. So this estimates from character
 * counts and says so everywhere it is shown: the tooltip labels the figure as an
 * estimate rather than presenting it as what the provider will bill.
 */

/**
 * Characters per token.
 *
 * ~4 for English, ~3 for French and other accented languages (accents and
 * agglutinated words split more). 3.7 sits between the two: it overestimates a
 * little on English prose, which is the safe direction — compacting slightly
 * early costs one summary, compacting late costs a refused request.
 */
const CHARS_PER_TOKEN = 3.7;

/** Role framing, separators and the message envelope every provider adds. */
const TOKENS_PER_MESSAGE = 4;

/**
 * An attached image, flat.
 *
 * Vision models bill images by tile, not by byte, so the base64 length says
 * nothing useful. ~1100 is the common cost of one full-resolution tile-grid
 * image across OpenAI-compatible providers.
 */
const TOKENS_PER_IMAGE = 1100;

export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: Message): number {
	let tokens = TOKENS_PER_MESSAGE + estimateTokens(message.content ?? '');
	// Reasoning is sent back on some providers and, more to the point, it is what
	// makes a conversation heavy — leaving it out would report a reassuring number
	// about a context that is nearly full.
	tokens += estimateTokens(message.reasoning ?? '');
	tokens += (message.images?.length ?? 0) * TOKENS_PER_IMAGE;
	if (message.knowledge?.content) tokens += estimateTokens(message.knowledge.content);
	return tokens;
}

/**
 * What the index of earlier sources adds to a request.
 *
 * Only the list itself: the prompt wrapped around it is a fixed cost shared with
 * every other injected instruction, none of which this estimate counts either.
 */
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

/**
 * What a given compaction actually bought, computed from the messages rather
 * than stored on the marker.
 *
 * It can be computed because nothing is deleted: the stretch a marker replaced
 * is still sitting above it. Which also means summaries written before this was
 * shown report their figures too, instead of only new ones.
 */
export function compactionSavings(messages: Message[], markerIndex: number): CompactionSavings {
	const marker = messages[markerIndex];
	if (marker?.note?.kind !== 'compaction') return { before: 0, after: 0, saved: 0, ratio: 0 };

	// Back to the previous marker, inclusive: an earlier summary was part of what
	// this compaction was handed, so it is part of what this one replaced.
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
	/** Where the ceiling comes from — the tooltip words itself differently for each. */
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
 * The ceiling to measure against.
 *
 * `num_ctx` is the only context size the app actually knows: Ollama takes it per
 * request, so when the user set it, it is the truth. Every other provider keeps
 * its window to itself — some (Infomaniak today) do not even publish it — so the
 * fallback is the user's own threshold from Settings. That is the whole reason
 * the threshold is configurable rather than derived.
 */
export function resolveContextLimit(
	session: Session,
	threshold: number
): { limit: number; limitSource: 'model' | 'threshold' } {
	const numCtx = session.options?.num_ctx;
	if (typeof numCtx === 'number' && numCtx > 0) return { limit: numCtx, limitSource: 'model' };
	return { limit: threshold, limitSource: 'threshold' };
}

export function contextUsage(session: Session, threshold: number): ContextUsage {
	const boundary = conversationBoundary(session.messages);
	const compacted = boundary.note?.kind === 'compaction' ? boundary.index : -1;
	const active = messagesInContext(session.messages);

	let tokens = estimateTokens(session.systemPrompt?.content ?? '');
	for (const message of active) tokens += estimateMessageTokens(message);
	// The index of earlier sources is built at send time, so it is in the request
	// without being in the messages. Left out, the gauge would read low on exactly
	// the conversations that carry the most of it, and auto-compaction would fire
	// late — the failure the estimate exists to prevent.
	tokens += estimateSourceIndexTokens(active);

	const { limit, limitSource } = resolveContextLimit(session, threshold);
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

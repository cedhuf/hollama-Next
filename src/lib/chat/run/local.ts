import { get } from 'svelte/store';

import type { ChatRequest, ChatStrategy } from '$lib/chat';
import { compactSession } from '$lib/chat/compact';
import { contextUsage } from '$lib/chat/context';
import { OllamaStrategy } from '$lib/chat/ollama';
import { OpenAIStrategy } from '$lib/chat/openai';
import { generateTitle } from '$lib/chat/title';
import { canCarryTools, useNativeTools } from '$lib/chat/tools';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import { ConnectionType, type Server } from '$lib/connections';
import { serversStore } from '$lib/localStorage';
import { browserMemory } from '$lib/personaMemoryAccess';
import { buildSearchContext } from '$lib/search';
import type { Session } from '$lib/sessions';
import { buildPageContext } from '$lib/webFetch';

import { type RunDeps } from './orchestrator';
import { runSpeakers } from './speakers';
import type { RunEvent, RunInput } from './types';

/**
 * A turn run in the tab that asked for it.
 *
 * The fallback, and the only path when the run service is turned off. It is the
 * same orchestrator the server uses, wired to the browser's own capabilities:
 * the two differ in what they can reach, never in what they do.
 */

export function strategyFor(server: Server): ChatStrategy {
	return server.connectionType === ConnectionType.Ollama
		? new OllamaStrategy(server)
		: new OpenAIStrategy(server);
}

/** The capabilities the browser has, in the shape the orchestrator asks for. */
export function browserDeps(
	input: RunInput,
	server: Server,
	session: Session,
	wants: { title: boolean; compact: boolean }
): RunDeps {
	const strategy = strategyFor(server);

	return {
		strategy,

		async complete(request: ChatRequest) {
			// Every strategy that can decide on a search implements this; one that
			// cannot simply never gets asked, because the router is skipped when the
			// provider carries the tools itself.
			return (await strategy.complete?.(request)) ?? '';
		},

		useNativeTools: () => useNativeTools(server, input.model, input.flags.nativeTools),

		canCarryTools: () => canCarryTools(server, input.model, input.flags.nativeTools),

		async search(query, startNumber) {
			const found = await buildSearchContext(query, startNumber);
			if (!found) return null;
			return {
				context: found.context,
				query: found.query,
				resultCount: found.resultCount,
				results: found.results.map((r) => ({ title: r.title, url: r.url }))
			};
		},

		async readPages(urls, startNumber) {
			const read = await buildPageContext(urls, startNumber);
			if (!read) return null;
			return {
				context: read.context,
				pages: read.pages.map((p) => ({ title: p.title, url: p.url }))
			};
		},

		// The speaker's own persona when somebody was called in with @, and the
		// conversation's otherwise: a persona summoned into a chat remembers as
		// itself, not as whoever lives there.
		memory: browserMemory(input.speaker?.personaId ?? input.personaId),

		title: wants.title ? (first: string) => generateTitle(first) : undefined,

		compact: wants.compact
			? async () => {
					// Asked after the answer has landed rather than before it went out, so
					// the estimate includes the turn that may be the one to cross the line.
					// Only fires once per crossing: the marker it appends drops the estimate
					// back under the threshold, and the next check is quiet again.
					const threshold = get(chatDefaultsConfig).compact.compactThreshold;
					if (contextUsage(session, threshold).ratio < 1) return null;

					try {
						const { marker, replacedCount } = await compactSession(session, { automatic: true });
						return { marker, replacedCount };
					} catch {
						// Automatic compaction is best-effort: the answer has already landed,
						// and a summary that failed costs nothing but a longer next request.
						return null;
					}
				}
			: undefined
	};
}

/** Resolve the connection a run names, from what this browser knows. */
export function resolveServer(input: RunInput): Server | undefined {
	const named = input.server;
	if (named.kind === 'inline') return named.server;
	return get(serversStore).find((s) => s.id === named.id);
}

export async function runLocally(
	input: RunInput,
	session: Session,
	wants: { title: boolean; compact: boolean },
	emit: (event: RunEvent) => void,
	signal: AbortSignal
): Promise<void> {
	// Resolved per pass rather than once: each speaker brings its own server, so a
	// generalist model can hold the conversation and an expensive specialist can be
	// asked for one opinion inside it.
	await runSpeakers(
		input,
		(pass) => {
			const server = resolveServer(pass);
			if (!server) throw new Error('Server not found');
			return browserDeps(pass, server, session, wants);
		},
		emit,
		signal
	);
}

import type { Message } from '$lib/sessions';

import { runTurn, type Emit, type RunDeps } from './orchestrator';
import type { RunInput } from './types';

/**
 * A turn with more than one voice in it.
 *
 * `runTurn` conducts one answer and is unaware anybody else might speak. What is
 * here is the sequencing, which belongs above it.
 *
 * Above rather than inside, for a concrete reason: compaction, cancellation, the
 * run registry and reattachment all sit around the orchestrator, and none of
 * them has to learn that personas exist. An ordinary turn is a list of one.
 */

/** Resolves the transport for one pass, which differs when the speaker does. */
export type DepsFor = (input: RunInput) => RunDeps | Promise<RunDeps>;

export async function runSpeakers(
	input: RunInput,
	depsFor: DepsFor,
	emit: Emit,
	signal: AbortSignal
): Promise<void> {
	const speakers = input.speakers?.length ? input.speakers : [undefined];
	const sequential = input.sequential !== false;

	/** In sequence it grows, so the second reads the first's answer, which is what makes several people in one message a conversation rather than a poll. */
	let messages = input.messages;

	for (const [index, speaker] of speakers.entries()) {
		if (signal.aborted) return;
		const last = index === speakers.length - 1;

		const pass: RunInput = {
			...input,
			...(speaker
				? {
						serverId: speaker.serverId,
						model: speaker.model,
						options: speaker.options,
						think: speaker.think,
						systemPrompt: speaker.systemPrompt,
						flags: speaker.flags,
						capabilities: speaker.capabilities
					}
				: {}),
			messages,
			speaker: speaker ? { personaId: speaker.personaId, name: speaker.name } : undefined,
			// Naming the conversation and compacting it happen to the conversation, not to
			// a speaker: once, after the last one, or a three-voice turn would title itself
			// three times and compact into its own middle.
			title: last ? input.title : undefined,
			compact: last ? input.compact : undefined
		};

		emit({ type: 'speaker', personaId: speaker?.personaId, name: speaker?.name });

		const produced: Message[] = [];
		let failed = false;

		await runTurn(
			pass,
			await depsFor(pass),
			(event) => {
				if (event.type === 'message') produced.push(event.message);
				if (event.type === 'error') failed = true;
				// Only the last pass ends the turn: an earlier `done` would tell every client
				// the answer was complete while two speakers were still to come.
				if (event.type === 'done' && !last) return;
				emit(event);
			},
			signal
		);

		// One voice failing ends the turn rather than handing the next a conversation
		// with a hole in it. The error is already emitted, and it is the ending a
		// reattaching client reads.
		if (failed) return;

		if (sequential) messages = [...messages, ...produced];
	}
}

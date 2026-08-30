import type { Persona } from '$lib/personas';
import { getPersonas } from '$lib/server/db/collections';
import { claimSeen, hasSeen, sweepSeen, type IntegrationRecord } from '$lib/server/db/integrations';
import { defaultSystemPrompt, runTurnOnce } from '$lib/server/turn';

import type { IntegrationProvider, IntegrationRuntime, TestResult } from '../types';
import {
	activatingCause,
	ChattoClient,
	referenceOf,
	type ChattoMessageReference,
	type ChattoOccurrence
} from './client';
import { buildContext } from './context';
import { defuseMentions, split } from './text';

/**
 * The bot itself: watch, answer, post.
 *
 * A loop rather than a socket. Chatto's realtime channel is binary protobuf and
 * a moving target in the 0.x line; the notification list it feeds from is
 * ordinary JSON over the same API as everything else here, and a few seconds of
 * latency is not what makes an assistant useful or useless. The day that stops
 * being true, what changes is this file and nothing above it.
 */

/** How many occurrences to ask for each time. Comfortably more than a quiet room produces. */
const PAGE = 25;

/**
 * How old an activation can be and still be answered.
 *
 * A bot that has been off for a day and comes back should not open with twenty
 * late replies to conversations that have moved on. Belt to the braces of the
 * claim table, which already stops it answering the same thing twice.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * How often to say the bot is still writing.
 *
 * Chatto's typing indicator is live-only and expires on its own, so this is a
 * refresh rate rather than a duration. Comfortably under any plausible expiry,
 * and cheap: one small call while a model is spending seconds on an answer.
 */
const TYPING_REFRESH_MS = 3_000;

/** What the bot puts on a message to say it has been picked up. Chatto wants a shortcode. */
const ACK_EMOJI = 'eyes';

/** A ceiling on answers per hour, so a loop between two bots costs an hour and not a month. */
const MAX_REPLIES_PER_HOUR = 60;

class ChattoRuntime implements IntegrationRuntime {
	readonly #record: IntegrationRecord;
	readonly #client: ChattoClient;
	readonly #controller = new AbortController();

	/** Set once the first poll has drawn the line under what was already there. */
	#baselined = false;
	#selfId = '';
	#timer: ReturnType<typeof setTimeout> | null = null;
	#stopped = false;
	#replies: number[] = [];

	constructor(record: IntegrationRecord, token: string) {
		this.#record = record;
		this.#client = new ChattoClient(record.config.baseUrl, token);
	}

	start(): void {
		void this.#tick();
	}

	stop(): void {
		this.#stopped = true;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#controller.abort();
	}

	get #signal(): AbortSignal {
		return this.#controller.signal;
	}

	#schedule(seconds: number): void {
		if (this.#stopped) return;
		this.#timer = setTimeout(() => void this.#tick(), seconds * 1000);
	}

	async #tick(): Promise<void> {
		if (this.#stopped) return;
		let delay = this.#record.config.pollSeconds;

		try {
			await this.#poll();
		} catch (error) {
			if (this.#stopped) return;
			// A server that is down, a key that was rotated, a network that blinked:
			// all the same answer, which is to slow down rather than to give up. The
			// integration stays configured, and it picks up when the far end does.
			delay = Math.min(120, Math.max(delay * 4, 15));
			console.error(`[integration ${this.#record.id}] poll failed:`, describe(error));
		}

		this.#schedule(delay);
	}

	async #poll(): Promise<void> {
		if (!this.#selfId) {
			const viewer = await this.#client.getViewer(this.#signal);
			this.#selfId = viewer.user?.profile?.id ?? '';
		}

		const { occurrences } = await this.#client.listNotificationOccurrences(PAGE, this.#signal);
		const list = occurrences ?? [];

		// The first pass answers nothing. What is already in the list happened
		// before this bot was watching, and a bot that opens by replying to
		// yesterday is a bot somebody turns off.
		if (!this.#baselined) {
			for (const occurrence of list) this.#claim(occurrence);
			this.#baselined = true;
			sweepSeen(this.#record.id);
			this.#log(`watching as ${this.#selfId}, ${list.length} existing notifications ignored`);
			return;
		}

		// Oldest first, so a burst is answered in the order it was said.
		for (const occurrence of [...list].reverse()) {
			if (this.#stopped) return;
			await this.#consider(occurrence);
		}
	}

	/**
	 * Write down that this activation has been dealt with.
	 *
	 * Twice: once for the occurrence, once for the message it points at. Chatto
	 * says plainly that one message can raise several causes, and answering a
	 * mention and then the followed-thread notification for the same message is
	 * the ordinary way that happens.
	 */
	#claim(occurrence: ChattoOccurrence): boolean {
		const reference = referenceOf(occurrence);
		const first = claimSeen(this.#record.id, `occurrence:${occurrence.id}`);
		const second = reference ? claimSeen(this.#record.id, `event:${reference.eventId}`) : true;
		return first && second;
	}

	/**
	 * Whether this has already been dealt with, asked before anything else.
	 *
	 * The list is a current state rather than a queue, so everything in it comes
	 * back on every poll until it expires. Every other test below explains itself
	 * in the log, which is right the first time and is noise from then on: this is
	 * what makes each of them happen once.
	 */
	#handled(occurrence: ChattoOccurrence): boolean {
		if (hasSeen(this.#record.id, `occurrence:${occurrence.id}`)) return true;
		const reference = referenceOf(occurrence);
		return !!reference && hasSeen(this.#record.id, `event:${reference.eventId}`);
	}

	async #consider(occurrence: ChattoOccurrence): Promise<void> {
		if (this.#handled(occurrence)) return;

		// Claimed even when it turns out there is nothing to do with it: an
		// unclaimed notification is one the next poll will consider again.
		const cause = activatingCause(occurrence);
		if (!cause) {
			// Not one of the four causes a bot acts on. Ordinary, and only worth a
			// line while somebody is working out why nothing happens.
			this.#log(
				`ignoring ${Object.keys(occurrence.signal ?? {}).join(',') || 'a signal-less'} notification`
			);
			this.#claim(occurrence);
			return;
		}
		const reference = referenceOf(occurrence);
		if (!reference) {
			this.#log(`${cause} carried no message reference`);
			this.#claim(occurrence);
			return;
		}

		// Never itself, and never another bot. The second is what keeps two
		// assistants in one room from talking to each other until somebody notices.
		if (occurrence.actor?.id === this.#selfId || occurrence.actor?.isBot) {
			this.#log(`${cause} from a bot, skipped`);
			this.#claim(occurrence);
			return;
		}

		const age = occurrence.createdAt ? Date.now() - Date.parse(occurrence.createdAt) : 0;
		if (Number.isFinite(age) && age > MAX_AGE_MS) {
			this.#log(`${cause} is ${Math.round(age / 1000)}s old, too late to answer`);
			this.#claim(occurrence);
			return;
		}

		// Claimed before the work, not after: a turn takes seconds and the next
		// poll comes sooner than that. Claiming afterwards is how a slow answer
		// gets written twice.
		if (!this.#claim(occurrence)) return;
		this.#log(`answering ${cause} in room ${reference.roomId}`);

		// Seen, and said so before the thinking starts. The typing indicator says
		// "in progress" and vanishes with it; this stays, so a turn that fails
		// still leaves a trace that the bot was listening.
		void this.#client
			.addReaction(reference.roomId, reference.eventId, ACK_EMOJI, this.#signal)
			.catch(() => {
				// The bot may not have message.react, which is a permission and not a
				// fault. The answer is what matters.
			});

		if (!this.#allowance()) {
			console.warn(`[integration ${this.#record.id}] hourly reply limit reached, skipping`);
			return;
		}

		await this.#answer(occurrence);
		void this.#client.markNotificationRead(occurrence.id, this.#signal).catch(() => {
			// Housekeeping on the far end. Failing it changes nothing here.
		});
	}

	#log(message: string): void {
		console.log(`[integration ${this.#record.id}] ${message}`);
	}

	/** True when there is room under the hourly ceiling, and counts the reply if so. */
	#allowance(): boolean {
		const cutoff = Date.now() - 3_600_000;
		this.#replies = this.#replies.filter((at) => at > cutoff);
		if (this.#replies.length >= MAX_REPLIES_PER_HOUR) return false;
		this.#replies.push(Date.now());
		return true;
	}

	/**
	 * Show that the bot is writing, for as long as it is.
	 *
	 * Without it a mention lands in silence for however long the model takes, and
	 * the room has no way to tell a slow answer from a bot that is not listening.
	 * Returns the way to stop it, so the caller cannot forget which timer it
	 * started.
	 */
	#typing(reference: ChattoMessageReference): () => void {
		const thread = threadFor(this.#record.config.placement, reference);
		const ping = () =>
			void this.#client.updateTypingIndicator(reference.roomId, thread, this.#signal).catch(() => {
				// Decoration. A room that never sees it still gets the answer.
			});

		ping();
		const timer = setInterval(ping, TYPING_REFRESH_MS);
		return () => clearInterval(timer);
	}

	async #answer(occurrence: ChattoOccurrence): Promise<void> {
		const reference = referenceOf(occurrence)!;
		const config = this.#record.config;
		let stopTyping = () => {};

		try {
			const messages = await buildContext(
				this.#client,
				config,
				reference,
				this.#selfId,
				this.#signal
			);
			if (!messages.length) {
				this.#log('nothing readable around the call, staying quiet');
				return;
			}

			stopTyping = this.#typing(reference);

			const { text } = await runTurnOnce({
				userId: this.#record.ownerUserId,
				serverId: config.serverId,
				model: config.model,
				systemPrompt: instructionsFor(this.#record),
				messages,
				tools: config.tools,
				signal: this.#signal
			});
			if (!text) {
				this.#log('the model answered with nothing');
				return;
			}

			await this.#post(reference, text);
			this.#log(`answered with ${text.length} characters`);
		} catch (error) {
			if (this.#stopped) return;
			// Said in the log, not in the room. A bot that posts its own stack traces
			// into a family channel is worse than a bot that stays quiet.
			console.error(`[integration ${this.#record.id}] could not answer:`, describe(error));
		} finally {
			// Before the message lands rather than after, so the room never shows a
			// bot still typing underneath an answer it has already read.
			stopTyping();
		}
	}

	async #post(reference: ChattoMessageReference, text: string): Promise<void> {
		const threadRootEventId = threadFor(this.#record.config.placement, reference);

		// Defused here rather than at the model: what is unsafe is posting it, and
		// this is the only place that posts.
		for (const [index, chunk] of split(defuseMentions(text)).entries()) {
			await this.#client.createMessage(
				{
					roomId: reference.roomId,
					body: chunk,
					threadRootEventId,
					// Only the first part carries the attribution: repeating it on every
					// chunk would draw the same reply arrow three times.
					inReplyTo: index === 0 && !threadRootEventId ? reference.eventId : undefined
				},
				this.#signal
			);
		}
	}
}

/**
 * Which thread the bot speaks into, if any.
 *
 * `auto` answers where it was asked. `thread` takes a question asked at room
 * level and roots a thread on it, which is what keeps a busy channel readable.
 * `room` does the opposite and always answers in the open.
 *
 * Shared by the answer and by the typing indicator, so the room cannot show the
 * bot writing in one place and then hear from it in another.
 */
function threadFor(
	placement: IntegrationRecord['config']['placement'],
	reference: ChattoMessageReference
): string | undefined {
	if (placement === 'thread') return reference.threadRootEventId ?? reference.eventId;
	if (placement === 'auto') return reference.threadRootEventId;
	return undefined;
}

/**
 * What the bot has been told to be.
 *
 * The default is what a conversation started by this account would get, which
 * is also what somebody who configured nothing is entitled to expect. The other
 * two replace it: a persona is a whole character, and instructions written here
 * are written knowing they are the whole of it.
 */
function instructionsFor(record: IntegrationRecord): string {
	const { instructionsMode, personaId, instructions } = record.config;

	if (instructionsMode === 'custom') return instructions;

	if (instructionsMode === 'persona' && personaId) {
		const persona = getPersonas(record.ownerUserId).find((p: Persona) => p.id === personaId);
		// A persona that has since been deleted falls back to the account's usual
		// prompt rather than to nothing: a bot that suddenly has no character at
		// all is a stranger, and silence would not explain why.
		if (persona?.systemPrompt?.trim()) return persona.systemPrompt.trim();
	}

	return defaultSystemPrompt(record.ownerUserId, record.config.model);
}

/** Long answers, cut on paragraph boundaries where there is one to cut on. */
function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const chattoProvider: IntegrationProvider = {
	kind: 'chatto',

	start(record, token) {
		const runtime = new ChattoRuntime(record, token);
		runtime.start();
		return runtime;
	},

	async test(record, token): Promise<TestResult> {
		if (!token) return { ok: false, error: 'No API key stored' };

		try {
			const viewer = await new ChattoClient(record.config.baseUrl, token).getViewer();
			const profile = viewer.user?.profile;
			if (!profile?.id) return { ok: false, error: 'The server did not identify this key' };
			if (!profile.isBot) {
				// Worth refusing rather than warning: a human key would run the
				// integration as that person, answering their own mentions as them.
				return { ok: false, error: 'This key belongs to a person, not to a bot account' };
			}
			return { ok: true, detail: profile.displayName || profile.login || profile.id };
		} catch (error) {
			return { ok: false, error: describe(error) };
		}
	}
};

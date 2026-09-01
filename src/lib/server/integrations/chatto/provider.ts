import type { Persona } from '$lib/personas';
import { getPersonas } from '$lib/server/db/collections';
import { botRepliesPerHour } from '$lib/server/db/config';
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
 * a moving target in the 0.x line, the notification list is ordinary JSON, and
 * a few seconds of latency is not what makes an assistant useful.
 */

/** How many occurrences to ask for each time. Comfortably more than a quiet room produces. */
const PAGE = 25;

/** A bot that has been off for a day should not open with twenty late replies. Belt to the braces of the claim table. */
const MAX_AGE_MS = 10 * 60 * 1000;

/** Chatto's typing indicator is live-only and expires on its own, so this is a refresh rate rather than a duration. */
const TYPING_REFRESH_MS = 3_000;

/** What the bot puts on a message to say it has been picked up. Chatto wants a shortcode. */
const ACK_EMOJI = 'eyes';

/**
 * When each account's bots last answered, for the hourly ceiling. Per account
 * rather than per bot, which a second bot walked straight around: what is
 * protected is the account's bill. The figure is read each time, so lowering it
 * takes effect without a restart.
 */
const repliesByOwner = new Map<string, number[]>();

class ChattoRuntime implements IntegrationRuntime {
	readonly #record: IntegrationRecord;
	readonly #client: ChattoClient;
	readonly #controller = new AbortController();

	/** Set once the first poll has drawn the line under what was already there. */
	#baselined = false;
	#selfId = '';
	#timer: ReturnType<typeof setTimeout> | null = null;
	#stopped = false;

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
			// A server down, a rotated key, a network blink: all the same answer, which is
			// to slow down rather than give up.
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

		// The first pass answers nothing: what is already in the list happened before
		// this bot was watching.
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

	/** Twice: once for the occurrence, once for the message it points at. One message can raise several causes, and a mention followed by the thread notification is the ordinary way. */
	#claim(occurrence: ChattoOccurrence): boolean {
		const reference = referenceOf(occurrence);
		const first = claimSeen(this.#record.id, `occurrence:${occurrence.id}`);
		const second = reference ? claimSeen(this.#record.id, `event:${reference.eventId}`) : true;
		return first && second;
	}

	/**
	 * Asked before anything else. The list is a current state rather than a queue,
	 * so everything comes back on every poll until it expires, and every test below
	 * logs itself, which is right once and noise from then on.
	 */
	#handled(occurrence: ChattoOccurrence): boolean {
		if (hasSeen(this.#record.id, `occurrence:${occurrence.id}`)) return true;
		const reference = referenceOf(occurrence);
		return !!reference && hasSeen(this.#record.id, `event:${reference.eventId}`);
	}

	async #consider(occurrence: ChattoOccurrence): Promise<void> {
		if (this.#handled(occurrence)) return;

		// Claimed even when there turns out to be nothing to do: an unclaimed
		// notification is one the next poll considers again.
		const cause = activatingCause(occurrence);
		if (!cause) {
			// Not one of the four causes a bot acts on. Only worth a line while somebody
			// is working out why nothing happens.
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

		// Never itself, and never another bot: the second keeps two assistants in one
		// room from talking to each other.
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

		// Claimed before the work, not after: a turn takes seconds and the next poll
		// comes sooner than that.
		if (!this.#claim(occurrence)) return;
		this.#log(`answering ${cause} in room ${reference.roomId}`);

		// Said before the thinking starts. The typing indicator vanishes with the turn;
		// this stays, so a turn that fails still shows the bot was listening.
		void this.#client
			.addReaction(reference.roomId, reference.eventId, ACK_EMOJI, this.#signal)
			.catch(() => {
				// The bot may not have message.react, which is a permission and not a fault.
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
		const owner = this.#record.ownerUserId;
		const cutoff = Date.now() - 3_600_000;
		const recent = (repliesByOwner.get(owner) ?? []).filter((at) => at > cutoff);

		if (recent.length >= botRepliesPerHour()) {
			repliesByOwner.set(owner, recent);
			return false;
		}
		recent.push(Date.now());
		repliesByOwner.set(owner, recent);
		return true;
	}

	/** Without it a mention lands in silence for however long the model takes. Returns the way to stop it, so the caller cannot forget which timer it started. */
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
			// Said in the log, not in the room: a bot that posts its own stack traces into
			// a family channel is worse than one that stays quiet.
			console.error(`[integration ${this.#record.id}] could not answer:`, describe(error));
		} finally {
			// Before the message lands, so the room never shows a bot still typing under an
			// answer it has already read.
			stopTyping();
		}
	}

	async #post(reference: ChattoMessageReference, text: string): Promise<void> {
		const threadRootEventId = threadFor(this.#record.config.placement, reference);

		// Defused here rather than at the model: what is unsafe is posting it, and this
		// is the only place that posts.
		for (const [index, chunk] of split(defuseMentions(text)).entries()) {
			await this.#client.createMessage(
				{
					roomId: reference.roomId,
					body: chunk,
					threadRootEventId,
					// Only the first part carries the attribution, or the same reply arrow is drawn
					// three times.
					inReplyTo: index === 0 && !threadRootEventId ? reference.eventId : undefined
				},
				this.#signal
			);
		}
	}
}

/**
 * `auto` answers where it was asked. `thread` roots a thread on a room-level
 * question, which keeps a busy channel readable. `room` always answers in the
 * open. Shared by the answer and the typing indicator, so the room cannot show
 * the bot writing in one place and hear from it in another.
 */
function threadFor(
	placement: IntegrationRecord['config']['placement'],
	reference: ChattoMessageReference
): string | undefined {
	if (placement === 'thread') return reference.threadRootEventId ?? reference.eventId;
	if (placement === 'auto') return reference.threadRootEventId;
	return undefined;
}

/** The default is what a conversation started by this account would get. The other two replace it: a persona is a whole character, and instructions written here are written knowing they are the whole of it. */
function instructionsFor(record: IntegrationRecord): string {
	const { instructionsMode, personaId, instructions } = record.config;

	if (instructionsMode === 'custom') return instructions;

	if (instructionsMode === 'persona' && personaId) {
		const persona = getPersonas(record.ownerUserId).find((p: Persona) => p.id === personaId);
		// A persona since deleted falls back to the account's usual prompt rather than
		// to nothing: a bot that suddenly has no character is a stranger.
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
				// Refused rather than warned: a human key would run the integration as that
				// person, answering their own mentions as them.
				return { ok: false, error: 'This key belongs to a person, not to a bot account' };
			}
			return { ok: true, detail: profile.displayName || profile.login || profile.id };
		} catch (error) {
			return { ok: false, error: describe(error) };
		}
	}
};

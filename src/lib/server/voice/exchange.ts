import { randomUUID } from 'node:crypto';

import { runTurn } from '$lib/chat/run/orchestrator';
import type { RunEvent, RunInput } from '$lib/chat/run/types';
import { getItem, upsertItem } from '$lib/server/db/collections';
import { isModelShared, PolicyError, reachableServer } from '$lib/server/llmPolicy';
import { serverDeps, type RunPrincipal } from '$lib/server/runDeps';
import { sessionWriter } from '$lib/server/runSession';
import { askWhatItCost, speak, SpeechError } from '$lib/server/speech';
import { transcribe, TranscriptionError } from '$lib/server/transcription';
import { defaultSystemPrompt } from '$lib/server/turn';
import { recordRunUsage, recordVoiceUsage, refuseForCredit } from '$lib/server/usageMeter';
import { durationMs, wavFromPcm } from '$lib/server/wav';
import type { Message, Session } from '$lib/sessions';
import { INPUT_SAMPLE_RATE, type ServerMessage, type VoiceState } from '$lib/voice/protocol';
import { split, spoken } from '$lib/voice/sentences';

import type { VoiceTarget } from './config';
import type { VoiceGrant } from './tickets';

/**
 * One spoken exchange, from the samples to the answer coming back as sound.
 *
 * The turn itself is `runTurn` with `serverDeps` and `sessionWriter`, exactly as
 * `/api/runs` runs it, so a spoken conversation is an ordinary conversation with
 * the same model policy, credit limit, accounting and transcript.
 *
 * What is new here is the two ends: turning samples into a question, and turning
 * the answer back into sound as it is written rather than once it is finished.
 */

/** Nothing shorter than this is a question. A knock on the table is not speech. */
const SHORTEST_UTTERANCE_MS = 250;

/** A ceiling on one utterance, so a stuck detector cannot upload a whole meeting. */
const LONGEST_UTTERANCE_MS = 60_000;

export interface ExchangeIO {
	/** Anything that is not audio. */
	say(message: ServerMessage): void;
	/** One piece of the answer, as the provider encoded it. */
	play(audio: Buffer): void;
}

export class VoiceExchange {
	#grant: VoiceGrant;
	#io: ExchangeIO;
	#state: VoiceState = 'idle';

	/** The utterance being collected, in the frames it arrived in. */
	#frames: Buffer[] = [];

	/**
	 * Which turn is current, bumped by anything that ends one early. A number
	 * rather than a flag: a turn is a chain of awaits, and each has to ask whether
	 * it is still the turn anybody wants when it resumes.
	 */
	#turn = 0;

	/** The conversation being held, made on the first question when there was none. */
	#sessionId: string | null;

	constructor(grant: VoiceGrant, io: ExchangeIO) {
		this.#grant = grant;
		this.#io = io;
		this.#sessionId = grant.sessionId;
	}

	get sessionId(): string | null {
		return this.#sessionId;
	}

	/** It changes what an interruption means: talking over an answer cuts the stored answer back, talking over a greeting must not, since that text is the persona's. */
	#greeting = false;

	/**
	 * The persona's opening line, read out on arrival. Only when the conversation is
	 * that line and nothing else: anything with a history is somebody coming back.
	 *
	 * Spoken without being announced, since the text is already stored and the
	 * screen read it on the way in. What is missing is the sound.
	 */
	async greet(): Promise<void> {
		if (!this.#sessionId) return;

		const stored = getItem<Session>('sessions', this.#grant.userId, this.#sessionId);
		const only = stored?.messages ?? [];
		if (only.length !== 1 || only[0].role !== 'assistant' || !only[0].content.trim()) return;

		const turn = ++this.#turn;
		this.#greeting = true;
		try {
			this.#at('speaking');
			const speech = new SpeechQueue(this.#grant, this.#io, () => this.#turn === turn, false);
			speech.feed(only[0].content);
			speech.flush();
			await speech.drain();
		} catch (cause) {
			if (this.#turn !== turn) return;
			this.#io.say({ type: 'error', message: reason(cause) });
		} finally {
			if (this.#turn === turn) {
				this.#greeting = false;
				this.#at('idle');
			}
		}
	}

	/** Samples from the microphone, while somebody is speaking. */
	push(frame: Buffer): void {
		// Only while listening. Frames arriving during an answer are a detector that
		// has not caught up, and would put the end of one question before the next.
		if (this.#state !== 'idle' && this.#state !== 'listening') return;

		// Through `#at`, not by assignment: setting the field directly left the screen
		// showing "idle" for the whole of a question.
		this.#at('listening');
		this.#frames.push(frame);

		if (durationMs(this.#frames, INPUT_SAMPLE_RATE) > LONGEST_UTTERANCE_MS) {
			void this.end();
		}
	}

	/** The person has stopped speaking. Everything follows from here. */
	async end(): Promise<void> {
		if (this.#state !== 'listening') return;

		const frames = this.#frames;
		this.#frames = [];

		// Too short to be a question. Silently back to idle: a press that landed on
		// nothing should cost nothing, least of all an explanation.
		if (durationMs(frames, INPUT_SAMPLE_RATE) < SHORTEST_UTTERANCE_MS) {
			this.#at('idle');
			return;
		}

		const turn = ++this.#turn;
		try {
			await this.#run(turn, frames);
		} catch (cause) {
			if (this.#turn !== turn) return;
			this.#io.say({ type: 'error', message: reason(cause) });
		} finally {
			if (this.#turn === turn) this.#at('idle');
		}
	}

	/**
	 * Somebody spoke over the answer. `heard` is the share that actually reached the
	 * room, which is why this is not simply "stop": storing the whole of an answer
	 * cut off after four words leaves a transcript nobody recognises.
	 */
	interrupt(heard: number): void {
		if (this.#state !== 'speaking') return;
		const greeting = this.#greeting;
		this.#stop();
		// Read before stopping, honoured after: a greeting is the persona's stored
		// text, so cutting it here would rewrite the character for every conversation.
		if (!greeting) this.#truncate(heard);
		this.#at('idle');
	}

	/** Stop, keep nothing, stay connected. */
	cancel(): void {
		this.#stop();
		this.#frames = [];
		this.#at('idle');
	}

	/** The socket is going away. */
	close(): void {
		this.#stop();
		this.#frames = [];
	}

	/** Both halves: bumping the counter makes every pending await give up, but the model keeps writing unless it is told, and that is paying for silence. */
	#stop(): void {
		this.#turn++;
		this.#greeting = false;
		this.#abort?.abort();
		this.#abort = null;
	}

	/** How the model is told, when there is a turn to tell. */
	#abort: AbortController | null = null;

	// --- the turn ------------------------------------------------------------

	async #run(turn: number, frames: Buffer[]): Promise<void> {
		this.#at('transcribing');
		const heard = await this.#listen(frames);
		if (this.#turn !== turn) return;

		// A recording of a quiet room. Nothing asked, nothing answered.
		if (!heard) return;
		this.#io.say({ type: 'heard', text: heard });

		this.#at('thinking');
		const sessionId = this.#session();
		await this.#think(turn, sessionId, heard);
	}

	/** What was said, as words, counted against the account like every other call. */
	async #listen(frames: Buffer[]): Promise<string> {
		const { listen } = this.#grant.config;
		const server = this.#reach(listen);

		const audio = wavFromPcm(frames, INPUT_SAMPLE_RATE);
		const file = new File([new Uint8Array(audio)], 'speech.wav', { type: 'audio/wav' });

		const { text, used } = await transcribe(server, listen.model, file, listen.language);
		recordVoiceUsage(this.#grant.userId, server, listen.model, used);
		return text.trim();
	}

	/** The same orchestrator, admin policy, credit refusal and accounting as a typed turn, written into the stored conversation as it arrives. */
	async #think(turn: number, sessionId: string, question: string): Promise<void> {
		const principal: RunPrincipal = {
			userId: this.#grant.userId,
			isAdmin: this.#grant.isAdmin
		};

		const asked: Message = {
			role: 'user',
			content: question,
			createdAt: new Date().toISOString()
		};

		const input = this.#input(sessionId, asked);
		// Resolved before anything starts, so a refusal is heard rather than a silence
		// to interpret. Also where the credit limit and the shared-model rule apply.
		const deps = serverDeps(input, principal);

		const write = sessionWriter(principal.userId, sessionId);
		// The question belongs in the transcript whether or not the answer arrives.
		write({ type: 'message', message: asked });

		const speech = new SpeechQueue(this.#grant, this.#io, () => this.#turn === turn);

		// Its own controller, so an interruption stops the model as well as the
		// speaker: otherwise the provider keeps writing an answer nobody will hear.
		const stop = new AbortController();
		this.#abort = stop;

		await runTurn(
			input,
			deps,
			(event: RunEvent) => {
				if (this.#turn !== turn) return;

				if (event.type === 'usage') {
					recordRunUsage(principal.userId, event.serverId, event.model, event.used);
				}

				// Cut where a reader would pause and synthesised piece by piece: the first
				// sentence is spoken while the model is still writing the second.
				if (event.type === 'content') {
					this.#at('speaking');
					speech.feed(event.text);
				}
				if (event.type === 'message') speech.flush();

				write(event);
			},
			stop.signal
		);

		if (this.#turn !== turn) return;
		await speech.drain();
	}

	/**
	 * What the turn is, assembled here because there is no browser to assemble it.
	 *
	 * The modest version: the conversation as stored, the persona's prompt, flags
	 * off. The typed path assembles playbooks, knowledge and the tool toggles, and
	 * does it in the page; lifting that out is its own piece of work.
	 */
	#input(sessionId: string, asked: Message): RunInput {
		const stored = getItem<Session>('sessions', this.#grant.userId, sessionId);
		const history = stored?.messages ?? [];
		const { think } = this.#grant.config;

		return {
			sessionId,
			serverId: think.serverId,
			model: think.model,
			think: false,
			systemPrompt:
				stored?.systemPrompt?.content?.trim() ||
				defaultSystemPrompt(this.#grant.userId, think.model),
			messages: [...history, asked],
			flags: {
				webSearch: false,
				webFetch: false,
				interactiveChoices: false,
				sendCurrentDate: true,
				nativeTools: 'auto',
				webSearchAuto: false,
				// A spoken turn has no way to ask, and every MCP call is put to the person.
				mcp: false
			},
			capabilities: { search: false, fetch: false }
		};
	}

	// --- the conversation ----------------------------------------------------

	/** Not before: arriving at the voice screen and leaving without saying anything should leave nothing behind. */
	#session(): string {
		if (this.#sessionId) return this.#sessionId;

		const id = randomUUID();
		const { think } = this.#grant.config;
		const session: Session = {
			id,
			messages: [],
			systemPrompt: {
				role: 'system',
				content: defaultSystemPrompt(this.#grant.userId, think.model)
			},
			options: {},
			model: { serverId: think.serverId, name: think.model },
			updatedAt: new Date().toISOString()
		};

		upsertItem('sessions', this.#grant.userId, session);
		this.#sessionId = id;
		this.#io.say({ type: 'ready', sessionId: id });
		return id;
	}

	/**
	 * Cut the stored answer back to what was heard. Proportional, because the
	 * browser reports a share of the sound and we hold text. A sentence cut a word
	 * early beats an answer whose ending nobody heard.
	 */
	#truncate(heard: number): void {
		const share = Math.max(0, Math.min(1, heard));
		if (!this.#sessionId || share >= 1) return;

		const session = getItem<Session>('sessions', this.#grant.userId, this.#sessionId);
		const last = session?.messages.at(-1);
		if (!session || last?.role !== 'assistant' || !last.content) return;

		const upto = Math.round(last.content.length * share);
		if (upto >= last.content.length) return;

		const messages = [...session.messages];
		messages[messages.length - 1] = { ...last, content: last.content.slice(0, upto).trimEnd() };

		const next: Session = { ...session, messages, updatedAt: new Date().toISOString() };
		upsertItem('sessions', this.#grant.userId, next);
	}

	// --- plumbing ------------------------------------------------------------

	/** The connection behind a target, re-asked rather than remembered. */
	#reach(target: VoiceTarget): ReturnType<typeof reachableServer> {
		const server = reachableServer(this.#grant.userId, target.serverId);
		if (!isModelShared(server, this.#grant.isAdmin, target.model)) {
			throw new PolicyError(403, `Model "${target.model}" is not shared on this server`);
		}
		const refused = refuseForCredit(this.#grant.userId, server, target.model);
		if (refused) throw new PolicyError(402, 'Over the credit limit');
		return server;
	}

	#at(state: VoiceState): void {
		if (this.#state === state) return;
		this.#state = state;
		this.#io.say({ type: 'state', value: state });
	}
}

/**
 * The answer, spoken while it is still being written: fragments are held back
 * until they end where a reader would pause.
 *
 * One request at a time. Two would not arrive sooner, since the provider is the
 * bottleneck, and anything synthesised ahead of the listener is paid for and
 * thrown away the moment they interrupt.
 */
class SpeechQueue {
	#grant: VoiceGrant;
	#io: ExchangeIO;
	#current: () => boolean;

	/**
	 * The answer so far, and how much of it has been spoken.
	 *
	 * Two fields rather than a shrinking buffer: pieces are cut from the *spoken*
	 * form, with the markdown taken out, so a piece cannot be found by position in
	 * the raw text. One bold word and every offset after it diverged.
	 */
	#raw = '';
	#spoken = 0;

	#work: Promise<void> = Promise.resolve();
	#announced = false;

	/** On for an answer, which the screen learns about only through these messages. Off for a greeting, which is already stored and on screen. */
	#echo: boolean;

	constructor(grant: VoiceGrant, io: ExchangeIO, current: () => boolean, echo = true) {
		this.#grant = grant;
		this.#io = io;
		this.#current = current;
		this.#echo = echo;
	}

	/** More of the answer. Whatever is now a whole piece leaves; the rest waits. */
	feed(text: string): void {
		this.#raw += text;
		const rest = this.#rest();
		if (!rest) return;

		// The first piece goes as soon as there is a sentence. `split` works to a
		// budget, which is right for everything after: a longer piece is one request
		// rather than three, and the seam is made while the piece before it plays. The
		// first piece is the only one whose wait anybody experiences.
		if (!this.#queued) {
			const early = firstSentence(rest);
			if (early) return this.#take(early);
		}

		// Everything but the last piece, which may still be a sentence in progress.
		const pieces = split(rest);
		if (pieces.length < 2) return;
		for (const piece of pieces.slice(0, -1)) this.#take(piece);
	}

	/** The answer is complete: say whatever is left, however it ends. */
	flush(): void {
		const rest = this.#rest();
		if (rest) for (const piece of split(rest)) this.#take(piece);
	}

	/** The part of the answer that has not been spoken yet, markdown removed. */
	#rest(): string {
		return spoken(this.#raw).slice(this.#spoken).trimStart();
	}

	/** The count advances by what the piece cost in the cleaned text, plus the whitespace `#rest` trimmed, so the next call resumes exactly here. */
	#take(piece: string): void {
		const cleaned = spoken(this.#raw);
		const at = cleaned.indexOf(piece, this.#spoken);
		this.#spoken = at >= 0 ? at + piece.length : this.#spoken + piece.length;
		this.#queue(piece);
	}

	/** Wait for everything queued to have been synthesised and sent. */
	async drain(): Promise<void> {
		await this.#work;
		if (this.#announced && this.#current()) this.#io.say({ type: 'speech-end' });
	}

	/** Whether anything has been handed to the synthesiser yet, for the early cut. */
	#queued = false;

	#queue(piece: string): void {
		this.#queued = true;
		this.#work = this.#work.then(() => this.#send(piece));
	}

	async #send(piece: string): Promise<void> {
		if (!this.#current()) return;

		const { speak: target } = this.#grant.config;
		const server = reachableServer(this.#grant.userId, target.serverId);
		if (!isModelShared(server, this.#grant.isAdmin, target.model)) return;
		if (refuseForCredit(this.#grant.userId, server, target.model)) return;

		const { audio, type, generationId } = await speak(server, target.model, target.voice, piece);
		if (!this.#current()) return;

		// Counted after the fact: a synthesis answers with sound, so its cost has to be
		// asked for separately, and waiting on that would delay the sentence.
		void (async () => {
			const reported = generationId ? await askWhatItCost(server, generationId) : undefined;
			recordVoiceUsage(this.#grant.userId, server, target.model, {
				input: 0,
				output: 0,
				cost: reported
			});
		})();

		if (!this.#announced) {
			this.#announced = true;
			this.#io.say({ type: 'speech-begin', mime: type });
		}
		if (this.#echo) this.#io.say({ type: 'answer', text: piece });
		this.#io.play(Buffer.from(audio));
	}
}

/**
 * The first thing worth saying out loud. Long enough not to spend a request on
 * "Yes."; short enough that an ordinary opening sentence is not glued to the one
 * after it. Two or three seconds of speech, and the first knob to reach for.
 */
const EARLIEST = 40;

function firstSentence(text: string): string | null {
	if (text.length < EARLIEST) return null;
	const end = text.slice(EARLIEST).search(/[.!?…](\s|$)/);
	if (end < 0) return null;
	return text.slice(0, EARLIEST + end + 1);
}

/** What went wrong, in a sentence somebody can act on. */
function reason(cause: unknown): string {
	if (cause instanceof PolicyError) return cause.message;
	if (cause instanceof TranscriptionError) return cause.message;
	if (cause instanceof SpeechError) return cause.message;
	return 'The turn could not be completed';
}

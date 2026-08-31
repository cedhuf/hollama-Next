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
 * The state machine behind a voice socket, and deliberately the same machine the
 * typed path uses for the part that matters: the turn itself is `runTurn` with
 * `serverDeps` and `sessionWriter`, exactly as `/api/runs` runs it. So a spoken
 * conversation is an ordinary conversation in the list, with the same model
 * policy, the same credit limit, the same accounting and the same transcript.
 *
 * What is genuinely new here is only the two ends: turning a run of samples into
 * a question, and turning a written answer back into sound as it is written
 * rather than once it is finished. The old screen waited for the whole answer
 * before synthesising a word of it, which is where most of its latency was.
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
	 * Which turn is current, bumped by anything that ends one early.
	 *
	 * The whole of the interruption machinery, and it has to be a number rather
	 * than a flag: a turn is a chain of awaits, and every one of them has to be
	 * able to ask "am I still the turn anybody wants" when it resumes. A boolean
	 * would answer that question wrong the moment a new turn started before the
	 * old one had finished unwinding.
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

	/** Samples from the microphone, while somebody is speaking. */
	push(frame: Buffer): void {
		// Only while listening. Frames that arrive during an answer are the tail of
		// a detector that has not caught up, and keeping them would put the end of
		// one question at the front of the next.
		if (this.#state !== 'idle' && this.#state !== 'listening') return;

		// Through `#at`, not by assignment. Setting the field directly is what kept
		// the screen showing "idle" for the whole of a question: the state changed
		// here and nobody was told.
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

		// Too short to be a question. Silently back to idle rather than an error: a
		// press that landed on nothing should cost nothing, least of all an
		// explanation.
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
	 * Somebody spoke over the answer.
	 *
	 * `heard` is the share of the answer that actually reached the room, and it is
	 * the reason this is not simply "stop": the conversation should remember what
	 * was heard, not what was generated. Storing the whole of an answer that was
	 * cut off after four words leaves a transcript that disagrees with everybody's
	 * memory of the exchange.
	 */
	interrupt(heard: number): void {
		if (this.#state !== 'speaking') return;
		this.#stop();
		this.#truncate(heard);
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

	/**
	 * End the turn in flight, wherever it had got to.
	 *
	 * Both halves, and the second is the one that costs money: bumping the counter
	 * makes every pending await give up, but the model keeps writing unless it is
	 * told. Cutting the sound and letting a provider finish an answer nobody will
	 * hear is paying for silence.
	 */
	#stop(): void {
		this.#turn++;
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

		// A recording of a quiet room. Nothing was asked, so nothing is answered,
		// and the loop comes round without a turn in the transcript.
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

	/**
	 * The turn, run exactly as a typed one is.
	 *
	 * `runTurn` with `serverDeps` and `sessionWriter`: the same orchestrator, the
	 * same admin policy, the same credit refusal, the same accounting, and the
	 * answer written into the stored conversation as it arrives rather than after.
	 * Nothing about a spoken turn is a different kind of turn.
	 */
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
		// Resolved before anything starts, so a refusal is an error the person hears
		// about rather than a silence they have to interpret. It is also where the
		// credit limit and the shared-model rule are applied to the answering model.
		const deps = serverDeps(input, principal);

		const write = sessionWriter(principal.userId, sessionId);
		// The question belongs in the transcript whether or not the answer arrives.
		write({ type: 'message', message: asked });

		const speech = new SpeechQueue(this.#grant, this.#io, () => this.#turn === turn);

		// Its own controller, so an interruption stops the model as well as the
		// speaker. Cutting the sound while a provider keeps writing is paying for an
		// answer nobody will ever hear.
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

				// The answer, cut where a reader would pause and synthesised piece by
				// piece. This is the whole latency story: the first sentence is spoken
				// while the model is still writing the second.
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
	 * Deliberately the modest version: the conversation as stored, the persona's
	 * prompt through the instance's own resolver, and the flags off. The typed
	 * path assembles more than this (playbooks, knowledge, the tool toggles), and
	 * it assembles it in the page. Bringing that here means lifting it out of the
	 * browser first, which is its own piece of work and not this one.
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
				// A spoken turn has no way to ask. Every MCP call is put to the person
				// before it is made, and a card nobody is looking at is not a question.
				mcp: false
			},
			capabilities: { search: false, fetch: false }
		};
	}

	// --- the conversation ----------------------------------------------------

	/**
	 * The conversation to write into, made on the first question if there was none.
	 *
	 * Not before, which is the same rule the old screen had: arriving at the voice
	 * screen and leaving without saying anything should leave nothing behind.
	 */
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
	 * Cut the stored answer back to what was actually heard.
	 *
	 * Proportional, because what the browser can report is a share of the sound and
	 * what we hold is text. Sound and characters do not line up exactly and nothing
	 * available here would make them, but the alternative is storing an answer
	 * whose ending nobody heard, which is worse than a sentence cut a word early.
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
 * The answer, spoken while it is still being written.
 *
 * Fed fragments as the model produces them, it holds back whatever does not yet
 * end somewhere a reader would pause, and sends each complete piece to be
 * synthesised. One request at a time: two would not arrive sooner, because the
 * provider is the bottleneck rather than the round trip, and every piece
 * synthesised ahead of where the listener actually is, is a piece paid for and
 * thrown away the moment they interrupt.
 */
class SpeechQueue {
	#grant: VoiceGrant;
	#io: ExchangeIO;
	#current: () => boolean;

	/**
	 * The answer so far, and how much of it has already been spoken.
	 *
	 * Two fields rather than a shrinking buffer, and the reason is a bug this
	 * replaces. The text is cut into pieces from its *spoken* form, which has the
	 * markdown taken out of it, so a piece taken from there cannot be found by
	 * position in the raw text: the moment an answer contained a bold word or a
	 * link, the offsets diverged and everything after the first piece was sliced in
	 * the wrong place. Counting characters of the cleaned text is the only measure
	 * that means the same thing at both ends.
	 */
	#raw = '';
	#spoken = 0;

	#work: Promise<void> = Promise.resolve();
	#announced = false;

	constructor(grant: VoiceGrant, io: ExchangeIO, current: () => boolean) {
		this.#grant = grant;
		this.#io = io;
		this.#current = current;
	}

	/** More of the answer. Whatever is now a whole piece leaves; the rest waits. */
	feed(text: string): void {
		this.#raw += text;
		const rest = this.#rest();
		if (!rest) return;

		// The first piece goes as soon as there is a sentence, and that is the whole
		// of the latency story. `split` works to a budget and cuts at the last
		// sentence end inside it, which is right for everything after: a longer piece
		// is one request rather than three, and nobody hears the seam because it is
		// made while the piece before it plays. But the first piece is the only one
		// whose wait anybody experiences, and holding it back for two hundred
		// characters of a model's output is a second of silence spent for nothing.
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

	/**
	 * Send one piece, and remember that much of the answer as said.
	 *
	 * The count advances by what the piece cost in the cleaned text, plus whatever
	 * whitespace `#rest` trimmed off its front, so the next call resumes exactly
	 * where this one stopped.
	 */
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

		// Counted like every other call, and after the fact for the same reason the
		// route gives: a synthesis answers with sound, so what it cost has to be
		// asked for separately, and waiting on that question would put a round trip
		// between somebody and a sentence they are listening for.
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
		this.#io.say({ type: 'answer', text: piece });
		this.#io.play(Buffer.from(audio));
	}
}

/**
 * The first thing worth saying out loud, once there is one.
 *
 * Long enough not to spend a request on a greeting: "Yes." synthesised on its
 * own costs a round trip and buys a syllable. Short enough that an ordinary
 * opening sentence goes on its own rather than being glued to the one after it,
 * which is what a higher threshold does and it costs a second of silence.
 *
 * Two or three seconds of speech. A tuning knob, and the one to reach for first
 * if answers start too slowly or if the seams become audible.
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

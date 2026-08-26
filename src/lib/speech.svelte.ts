import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { read, type Reading } from '$lib/audioReading';
import { settingsStore } from '$lib/localStorage';
import { toast } from '$lib/toast';

/**
 * Saying it back.
 *
 * The other half of `VoiceRecorder`, and deliberately its mirror: one object for
 * the whole app, three states a caller can draw, and nothing kept once it has
 * finished. What it holds is a queue of sentences and one `<audio>` element, and
 * both are dropped the moment it stops.
 *
 * It reads in pieces rather than in one go, and that is the whole design. A
 * spoken answer is judged on when it starts, not on when it ends: waiting for a
 * four-hundred-word reply to be synthesised whole means four seconds of silence
 * before the first word, where a first sentence is ready in well under one. So
 * the text is cut at sentence boundaries, the next piece is asked for while the
 * current one plays, and the person hears the answer begin almost as soon as it
 * exists.
 *
 * It never queues more than one request ahead. Two would not arrive sooner (the
 * bottleneck is the provider, not the round trip) and every piece fetched ahead
 * of where the listener actually is, is a piece paid for and thrown away the
 * moment they interrupt.
 */
export type SpeechState = 'idle' | 'loading' | 'speaking';

/**
 * The ceiling the server enforces, repeated here so a sentence is cut before it
 * is sent rather than refused after.
 */
const CHUNK_LIMIT = 2_000;

/**
 * Small enough to start fast, large enough not to chop a thought in half.
 *
 * The first piece is deliberately shorter than the rest: it is the only one whose
 * wait anybody experiences, since every other piece is made while the one before
 * it is still playing.
 */
const FIRST_CHUNK = 240;
const CHUNK = 700;

export class Speaker {
	state = $state<SpeechState>('idle');

	/** Bumped on every stop, so a request in flight knows it is no longer wanted. */
	#run = 0;

	#ctx: AudioContext | null = null;
	#gain: GainNode | null = null;
	#analyser: AnalyserNode | null = null;
	#spectrum = new Uint8Array(0);
	/**
	 * Every source still scheduled, so an interruption can silence all of them.
	 *
	 * A plain `Set` on purpose, and the lint rule that asks for `SvelteSet` is
	 * silenced rather than obeyed: nothing renders this. It is a bag of audio nodes
	 * held so `stop()` can reach them, and making it reactive would wake the page
	 * every time a sentence finished playing.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#playing = new Set<AudioBufferSourceNode>();
	/** When the next piece should begin, on the context's own clock. */
	#nextAt = 0;
	/** How a waiting `say` is let go when something stops it early. */
	#finish: (() => void) | null = null;

	/** Whether anything can be read at all: a model, a voice, and a connection. */
	static available(): boolean {
		return !!target();
	}

	/**
	 * Wake the audio hardware, from inside a gesture.
	 *
	 * Called from the button that starts a session, and not optional: a browser
	 * only lets sound out of a context that a person's own tap created or resumed,
	 * and iOS is strict about it. This is what a `new Audio()` per sentence could
	 * never satisfy, because the gesture was several sentences ago by then.
	 *
	 * Safe to call as often as you like. The context is made once and resumed
	 * whenever it has drifted back to suspended, which happens on its own after a
	 * spell of silence on some browsers.
	 */
	unlock(): void {
		this.#context();
	}

	/**
	 * What is coming out of the speaker right now.
	 *
	 * Pulled rather than pushed: whoever is drawing already has a frame loop, and
	 * publishing sixty readings a second into reactive state would wake every
	 * effect in the page to animate one shape. Zeroes when nothing is playing,
	 * which is a truthful reading rather than a missing one.
	 */
	reading(): Reading {
		return read(this.#analyser, this.#spectrum);
	}

	/**
	 * Read this out, from the beginning, interrupting whatever was being read.
	 *
	 * Resolves when the last piece has finished playing, or immediately when it is
	 * interrupted, so a caller driving a conversation can wait for the answer to be
	 * spoken before listening again.
	 */
	async say(text: string): Promise<void> {
		this.stop();
		const run = ++this.#run;

		const strings = get(LL);
		const where = target();
		if (!where) {
			toast.error(strings.speechNoModel());
			return;
		}

		const pieces = split(spoken(text));
		if (!pieces.length) return;

		const ctx = this.#context();
		if (!ctx) {
			toast.error(strings.speechFailed());
			return;
		}

		this.state = 'loading';
		// Everything from here is placed on the context's clock rather than played
		// when it arrives, so the seam between two sentences is whatever the decoder
		// leaves and nothing else.
		this.#nextAt = ctx.currentTime;

		// One piece ahead, never two: the fetch for the next starts as this one is
		// scheduled, so the wait between sentences is the round trip and not the
		// synthesis.
		let next: Promise<Blob> | null = this.#fetch(where, pieces[0]);
		let last: AudioBufferSourceNode | null = null;

		for (let i = 0; i < pieces.length; i++) {
			const current = next as Promise<Blob>;
			next = i + 1 < pieces.length ? this.#fetch(where, pieces[i + 1]) : null;

			let buffer: AudioBuffer;
			try {
				const blob = await current;
				if (this.#run !== run) return;
				buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
			} catch (cause) {
				// Swallowed for every piece after the first: an answer that was half read
				// is better left half read than interrupted by a toast, and the person
				// heard the part that mattered. The first piece failing is a setup
				// problem, and that is worth saying.
				if (this.#run !== run) return;
				this.stop();
				if (i === 0) {
					toast.error(strings.speechFailed(), {
						description: cause instanceof Error ? cause.message.slice(0, 200) : undefined
					});
				}
				return;
			}
			if (this.#run !== run) return;

			last = this.#schedule(ctx, buffer);
			this.state = 'speaking';
		}

		await this.#until(last);
		if (this.#run !== run) return;
		this.state = 'idle';
	}

	/** Stop reading and keep nothing. Also what a caller presses to interrupt. */
	stop(): void {
		this.#run++;
		for (const source of this.#playing) {
			// Cleared first: stopping fires `onended`, and a handler that removed its
			// own entry while this loop walks the set is a set mutated mid-iteration.
			source.onended = null;
			try {
				source.stop();
			} catch {
				// A source that never started, or already ended, is already stopped.
			}
		}
		this.#playing.clear();
		this.#nextAt = 0;
		this.state = 'idle';
		this.#finish?.();
	}

	/**
	 * The graph, made once.
	 *
	 * A gain in the middle so an interruption can duck rather than cut, the day
	 * that is wanted, and an analyser on the way out so whatever is drawing the
	 * voice is reading the voice rather than a timer approximating it.
	 */
	#context(): AudioContext | null {
		if (!this.#ctx) {
			try {
				this.#ctx = new AudioContext();
			} catch {
				return null;
			}
			this.#gain = this.#ctx.createGain();
			this.#analyser = this.#ctx.createAnalyser();
			this.#analyser.fftSize = 512;
			// Some smoothing in the node itself, so the drawing side is free to apply
			// its own attack and release rather than fighting a raw, jittery reading.
			this.#analyser.smoothingTimeConstant = 0.6;
			this.#spectrum = new Uint8Array(this.#analyser.frequencyBinCount);
			this.#gain.connect(this.#analyser);
			this.#analyser.connect(this.#ctx.destination);
		}
		// Browsers suspend a context that has been quiet, and a suspended one plays
		// nothing while reporting no error at all.
		if (this.#ctx.state === 'suspended') void this.#ctx.resume().catch(() => {});
		return this.#ctx;
	}

	/** Put one piece on the clock, immediately after the piece before it. */
	#schedule(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(this.#gain!);

		// Never in the past. A piece whose fetch ran long starts now and the gap is
		// real, which is better than starting it late and overlapping the next one.
		const at = Math.max(ctx.currentTime, this.#nextAt);
		source.start(at);
		this.#nextAt = at + buffer.duration;

		this.#playing.add(source);
		source.onended = () => this.#playing.delete(source);
		return source;
	}

	/**
	 * Resolves when the last piece has finished, or the moment something stops it.
	 *
	 * Both ways out matter. `stop()` clears the handlers before stopping a source,
	 * so waiting on `ended` alone would leave whoever awaited this hanging for ever,
	 * and on the voice screen that is the loop never coming round again. So the
	 * resolver is held where `stop()` can reach it.
	 */
	#until(last: AudioBufferSourceNode | null): Promise<void> {
		if (!last) return Promise.resolve();
		return new Promise((resolve) => {
			const done = () => {
				if (this.#finish === done) this.#finish = null;
				resolve();
			};
			this.#finish = done;
			last.onended = () => {
				this.#playing.delete(last);
				done();
			};
		});
	}

	async #fetch(where: Target, text: string): Promise<Blob> {
		const response = await fetch('/api/speak', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...where, text })
		});
		if (!response.ok) throw new Error(await response.text().catch(() => ''));
		return response.blob();
	}
}

interface Target {
	serverId: string;
	model: string;
	voice: string;
}

/** Where the sentence goes. Read at the moment of asking, not at construction. */
function target(): Target | null {
	const settings = get(settingsStore);
	const model = settings.speechModel;
	const voice = settings.speechVoice?.trim();
	if (!settings.speechOutput || !model || !voice) return null;
	const known = (settings.models ?? []).find((entry) => entry.name === model);
	return known?.serverId ? { serverId: known.serverId, model, voice } : null;
}

/**
 * What a reply sounds like once the typography is taken out of it.
 *
 * Markdown is written to be looked at. Read literally, a heading becomes "hash
 * hash Results", a bold word becomes "star star important star star", and a code
 * block becomes a minute of punctuation. None of that is what was said, so it
 * goes before anything is sent, which also means it is not paid for.
 *
 * Fenced code goes entirely rather than being flattened. Nobody wants a shell
 * script read to them, and the screen still has it.
 */
function spoken(text: string): string {
	return (
		text
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/`([^`]+)`/g, '$1')
			// A link is read as its words. The address is for the eye.
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/^\s{0,3}#{1,6}\s+/gm, '')
			.replace(/^\s{0,3}>\s?/gm, '')
			.replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, '')
			.replace(/(\*\*|__|\*|_|~~)/g, '')
			.replace(/^\s*\|.*\|\s*$/gm, ' ')
			.replace(/[ \t]+/g, ' ')
			.replace(/\n{2,}/g, '\n')
			.trim()
	);
}

/**
 * The text in pieces, cut where a reader would pause.
 *
 * Sentence ends first, then any line break, then a space, and only if none of
 * those turns up within the budget does it cut mid-word. That last case is a
 * wall of text with no punctuation in it, where any cut is arbitrary and the
 * alternative is not reading it at all.
 */
function split(text: string): string[] {
	const pieces: string[] = [];
	let rest = text;
	let budget = FIRST_CHUNK;

	while (rest.length) {
		if (rest.length <= budget) {
			pieces.push(rest);
			break;
		}

		const window = rest.slice(0, Math.min(budget, CHUNK_LIMIT));
		// In order of how much a listener would notice the seam. `lastIndexOf` answers
		// -1 rather than nothing, so it is compared rather than coalesced: a `??`
		// chain here would take -1 for a perfectly good position.
		const sentence = lastOf(window, /[.!?…](?=\s|$)/g);
		const line = window.lastIndexOf('\n');
		const space = window.lastIndexOf(' ');
		const at = sentence ?? (line >= 0 ? line : space);
		// Too early a cut is worse than a long piece: it turns one sentence into two
		// requests and puts a gap in the middle of a clause.
		const cut = at > budget / 3 ? at + 1 : window.length;

		pieces.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
		budget = CHUNK;
	}

	return pieces.filter(Boolean);
}

/** Where the last match of a pattern ends, or nothing when there is none. */
function lastOf(text: string, pattern: RegExp): number | null {
	let found: number | null = null;
	for (const match of text.matchAll(pattern)) found = match.index;
	return found;
}

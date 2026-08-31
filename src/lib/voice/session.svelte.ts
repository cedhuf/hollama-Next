import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { read, SILENCE, type Reading } from '$lib/audioReading';
import { toast } from '$lib/toast';

import {
	INPUT_SAMPLE_RATE,
	VOICE_SOCKET_PATH,
	type ClientMessage,
	type ServerMessage,
	type VoiceState
} from './protocol';

/**
 * A conversation held out loud, from this side.
 *
 * One object for the whole screen, and deliberately the only thing on it that
 * knows there is a network. What the page reads is a state, two readings and two
 * lines of text; what happens underneath is a microphone, two worklets, a socket
 * and a queue.
 *
 * The microphone opens once and stays open for the length of the conversation.
 * That is the difference between this and the recorder it replaces, and it is
 * what makes interruption possible: you can only take the floor from something
 * that was still listening while it spoke.
 */

/**
 * Deciding when somebody has started and finished speaking.
 *
 * Relative to the room, never absolute, and that is the whole of the difference
 * from the gate this replaces. A fixed threshold is calibrated for one room: in a
 * quiet one it misses a soft voice, and in a room with a fan it never closes at
 * all, so the turn either never ends or ends on the first breath. What the
 * numbers below describe is *how far above the room* a voice has to be, and the
 * room is measured continuously.
 *
 * Two thresholds rather than one, because a single one chatters: a voice sitting
 * near it opens and closes the gate every few frames. Speech has to clear the
 * higher one to begin and fall under the lower one to end.
 */

/** How far above the room a voice has to be to start, and to keep going. */
const OPEN = 3.5;
const CLOSE = 2.0;

/** And a floor under both, for a room so quiet that any ratio would trip. */
const QUIETEST = 0.01;

/** How long a sound has to last before it counts as somebody starting. */
const ONSET_MS = 120;

/** How long a quiet ends a turn, and how long a turn must run before it can end. */
const SILENCE_MS = 1_100;
const MINIMUM_MS = 350;

/**
 * How much louder than the room somebody has to be to interrupt an answer.
 *
 * Higher than starting, on purpose. The browser's echo canceller is good and not
 * perfect, and what leaks through is the answer itself: at the ordinary
 * threshold the app hears itself and stops mid-sentence, over and over.
 */
const BARGE = 6.0;
const BARGE_MS = 200;

/** One thing somebody said, whichever of the two of them said it. */
export interface Line {
	role: 'user' | 'assistant';
	text: string;
}

export class VoiceSession {
	/** Where the exchange is, as the server sees it. */
	state = $state<VoiceState>('idle');

	/** Whether there is a conversation at all, as opposed to a screen waiting. */
	live = $state(false);

	/** Whether the microphone is deliberately shut. */
	muted = $state(false);

	/**
	 * Whether the person currently has the floor.
	 *
	 * Theirs to set, not something inferred from how loud the room is. Frames only
	 * leave while this is true, so a conversation held next to a television uploads
	 * the sentence somebody meant to say and nothing else.
	 */
	talking = $state(false);

	/**
	 * The conversation, as lines to read back.
	 *
	 * A list rather than the last question and the last answer, which is what this
	 * held before. Two strings can only ever show the exchange in progress, and a
	 * spoken conversation is exactly the kind nobody can scroll back through in
	 * their head: a misheard word four turns ago is the thing you want to go and
	 * look at. Seeded from the stored conversation when the screen was opened on
	 * one, so what is on screen is the conversation and not the visit.
	 */
	lines = $state<Line[]>([]);

	/**
	 * Whether the answer being spoken already has a line of its own.
	 *
	 * The answer arrives in pieces, one per sentence synthesised, and they belong
	 * on one line. Reset at the start of every turn, which is the only thing that
	 * separates one answer from the next.
	 */
	#answering = false;

	/** The conversation this is being written into, once there is one. */
	sessionId = $state('');

	#socket: WebSocket | null = null;
	#ctx: AudioContext | null = null;
	#stream: MediaStream | null = null;
	#capture: AudioWorkletNode | null = null;
	#playback: AudioWorkletNode | null = null;

	#micAnalyser: AnalyserNode | null = null;
	#micSpectrum = new Uint8Array(0);
	#outAnalyser: AnalyserNode | null = null;
	#outSpectrum = new Uint8Array(0);

	/** The format the current answer is arriving in, from `speech-begin`. */
	#mime = '';

	/**
	 * Whether the browser refused to start the audio without being touched.
	 *
	 * The screen opens listening, which is what anybody arriving at a voice screen
	 * wants, and most browsers allow it because arriving was itself a tap. iOS
	 * sometimes does not, and the honest answer then is to say so and offer the
	 * press rather than to sit there with a dead microphone.
	 */
	needsGesture = $state(false);

	/** The room, and where the voice is against it. */
	#floor = 0.01;
	#loud = 0;
	#watching: number | null = null;
	#samples = new Float32Array(0);

	/** When the current sound began, when it last cleared the gate, and its state. */
	#onsetAt = 0;
	#spokeAt = 0;
	#startedAt = 0;
	#over = 0;

	/**
	 * Held from the first press until the socket is up.
	 *
	 * `live` cannot do this job: it stays false while the microphone is being
	 * granted and the ticket fetched, which is the one window where a second press
	 * gets through, and two presses would open two microphones and two sockets.
	 */
	#starting = false;

	/**
	 * Start listening, from inside a tap.
	 *
	 * Not optional: a browser only lets sound out of an audio context a person's
	 * own gesture created or resumed, and iOS is strict about it. By the time
	 * there is an answer to play, the gesture is long gone.
	 */
	async start(sessionId?: string): Promise<void> {
		if (this.live || this.#starting) return;
		this.#starting = true;
		try {
			await this.#begin(sessionId);
		} finally {
			this.#starting = false;
		}
	}

	async #begin(sessionId?: string): Promise<void> {
		const strings = get(LL);

		try {
			// The microphone and the audio hardware first, and the order is not
			// arbitrary. A browser only lets sound out of a context a person's own
			// gesture created or resumed, and the gesture is spent by the first
			// `await` that goes to the network: asking for a ticket before this left
			// iOS with a context it would never unsuspend and a screen that looked
			// broken. Everything that needs the tap happens before anything that
			// needs the server.
			await this.#openAudio();
		} catch {
			this.stop();
			return;
		}

		const ticket = await this.#ticket(sessionId);
		if (!ticket) {
			this.stop();
			return;
		}

		try {
			await this.#connect(ticket);
		} catch {
			this.stop();
			toast.error(strings.voiceFailed());
			return;
		}

		this.live = true;
		this.#watch();
	}

	/** Everything down, nothing left running. */
	stop(): void {
		this.#send({ type: 'cancel' });
		this.#socket?.close();
		this.#socket = null;

		if (this.#watching !== null) cancelAnimationFrame(this.#watching);
		this.#watching = null;

		// The browser keeps the recording indicator on until every track is stopped.
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;

		this.#capture?.disconnect();
		this.#playback?.disconnect();
		this.#capture = null;
		this.#playback = null;
		this.#micAnalyser = null;
		this.#outAnalyser = null;

		void this.#ctx?.close().catch(() => {});
		this.#ctx = null;

		this.live = false;
		this.muted = false;
		this.talking = false;
		this.state = 'idle';
	}

	/**
	 * What was already said in this conversation, before the screen opened.
	 *
	 * Handed in rather than fetched, because the screen has already read the
	 * conversation to find out whose it is and reading it twice would be a second
	 * request for the same bytes. Only what can be read back out loud: a system
	 * prompt is not part of the exchange, and an empty message is not a line.
	 */
	seed(messages: { role: string; content: string }[]): void {
		this.lines = messages
			.filter((message) => message.role === 'user' || message.role === 'assistant')
			.filter((message) => message.content.trim())
			.map((message) => ({ role: message.role as Line['role'], text: message.content.trim() }));
	}

	/** Shut the microphone without ending the conversation. */
	toggleMute(): void {
		this.muted = !this.muted;
		this.#stream?.getAudioTracks().forEach((track) => (track.enabled = !this.muted));
		// Muting mid-sentence hands the question over rather than leaving a turn open
		// that nothing will ever close: the detector stops running while muted, so
		// nothing else would ever send the end of it.
		if (this.muted && this.talking) {
			this.talking = false;
			this.#send({ type: 'end' });
		}
	}

	/** Take the floor while it is answering. */
	interrupt(): void {
		if (this.state !== 'speaking') return;
		this.#playback?.port.postMessage({ type: 'flush' });
	}

	/** What the microphone is hearing, for whatever is drawing it. */
	micReading(): Reading {
		if (this.muted) return SILENCE;
		return read(this.#micAnalyser, this.#micSpectrum);
	}

	/** What the answer sounds like, the same contract from the other end. */
	voiceReading(): Reading {
		return read(this.#outAnalyser, this.#outSpectrum);
	}

	// --- setting up ----------------------------------------------------------

	/** The ticket, or nothing, having said what was missing. */
	async #ticket(sessionId?: string): Promise<string | null> {
		const strings = get(LL);
		try {
			const response = await fetch('/api/voice/ticket', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sessionId: sessionId ?? null })
			});
			const body = await response.json().catch(() => null);

			if (response.ok && body?.ticket) return body.ticket as string;

			/**
			 * The instance says it is not set up for this, and it names which half.
			 *
			 * Said out loud even though the screen draws its own version of the same
			 * question, because the two can disagree and the server is the one that is
			 * right: it applies the administrator's sharing, which the browser cannot
			 * see. Silence here is a press that does nothing for a reason nobody can
			 * discover, which is exactly how this failed the first time it was tried.
			 */
			if (response.status === 409) {
				const missing: string[] = Array.isArray(body?.missing) ? body.missing : [];
				const hearing = missing.includes('listen');
				const speaking = missing.includes('speak');
				toast.error(
					hearing && speaking
						? strings.voiceSetupBoth()
						: hearing
							? strings.voiceSetupHearing()
							: speaking
								? strings.voiceSetupSpeaking()
								: strings.voiceNoModel()
				);
				return null;
			}

			toast.error(strings.voiceFailed());
			return null;
		} catch {
			toast.error(strings.voiceFailed());
			return null;
		}
	}

	/** The microphone, the graph and the two worklets. Nothing on the network. */
	async #openAudio(): Promise<void> {
		const strings = get(LL);

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// All three on, and the first one is the load-bearing one: without echo
				// cancellation the microphone hears the answer and the conversation
				// interrupts itself.
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
			});
		} catch {
			// Refused, or no microphone at all. Both are the same answer here.
			toast.error(strings.voiceNoMicrophone());
			throw new Error('no microphone');
		}
		this.#stream = stream;

		const ctx = new AudioContext();
		this.#ctx = ctx;
		if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

		// A context that will not start is a screen with a dead microphone on it, and
		// nothing about it looks broken. Browsers allow this when the page was opened
		// by a tap, which is how anybody arrives here; iOS sometimes does not, and the
		// honest answer then is to ask for the press rather than to pretend.
		if (ctx.state !== 'running') {
			this.needsGesture = true;
			throw new Error('audio needs a gesture');
		}
		this.needsGesture = false;

		await ctx.audioWorklet.addModule('/worklets/voice-capture.js');
		await ctx.audioWorklet.addModule('/worklets/voice-playback.js');

		// --- what it hears ---
		const source = ctx.createMediaStreamSource(stream);
		this.#micAnalyser = ctx.createAnalyser();
		this.#micAnalyser.fftSize = 1024;
		this.#micAnalyser.smoothingTimeConstant = 0.6;
		this.#micSpectrum = new Uint8Array(this.#micAnalyser.frequencyBinCount);
		this.#samples = new Float32Array(this.#micAnalyser.fftSize);
		source.connect(this.#micAnalyser);

		this.#capture = new AudioWorkletNode(ctx, 'voice-capture');
		this.#capture.port.onmessage = ({ data }) => this.#frame(data as ArrayBuffer);
		source.connect(this.#capture);
		// Never to the speakers. A capture node with no destination is not scheduled
		// on some browsers, so it goes to a gain of zero rather than nowhere.
		const sink = ctx.createGain();
		sink.gain.value = 0;
		this.#capture.connect(sink).connect(ctx.destination);

		// --- what it says ---
		this.#playback = new AudioWorkletNode(ctx, 'voice-playback', { outputChannelCount: [1] });
		this.#playback.port.onmessage = ({ data }) => this.#played(data);
		this.#outAnalyser = ctx.createAnalyser();
		this.#outAnalyser.fftSize = 512;
		this.#outAnalyser.smoothingTimeConstant = 0.6;
		this.#outSpectrum = new Uint8Array(this.#outAnalyser.frequencyBinCount);
		this.#playback.connect(this.#outAnalyser).connect(ctx.destination);
	}

	#connect(ticket: string): Promise<void> {
		// Built as a string rather than through `URL`, which here would be a mutable
		// object built to be read once. Same origin as the page, always: the socket
		// is this app's own route, so there is no host to resolve and nothing to
		// configure.
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const socket = new WebSocket(`${scheme}://${location.host}${VOICE_SOCKET_PATH}`);
		socket.binaryType = 'arraybuffer';
		this.#socket = socket;

		return new Promise((resolve, reject) => {
			socket.onopen = () => {
				// The ticket travels in the socket rather than in the address, so it is
				// never written into a proxy's log on its way past.
				this.#send({ type: 'hello', ticket });
				resolve();
			};
			socket.onerror = () => reject(new Error('socket failed'));
			socket.onmessage = (event) => this.#receive(event);
			socket.onclose = () => {
				if (this.live) this.stop();
			};
		});
	}

	// --- hearing the room ----------------------------------------------------

	/**
	 * The loop that decides when somebody is speaking, and when they have stopped.
	 *
	 * Everything about turn-taking lives here, and it is measured against the room
	 * rather than against a number. The loudness of a frame means nothing on its
	 * own: 0.02 is a shout in a recording booth and silence beside a fan. What
	 * means something is the ratio to the quiet the room settles at, which is
	 * tracked continuously below.
	 */
	#watch(): void {
		const tick = () => {
			this.#watching = requestAnimationFrame(tick);
			const analyser = this.#micAnalyser;
			if (!analyser || this.muted) return;

			analyser.getFloatTimeDomainData(this.#samples);
			let sum = 0;
			for (const sample of this.#samples) sum += sample * sample;
			this.#loud = Math.sqrt(sum / this.#samples.length);

			/**
			 * The room, which falls fast and rises slowly.
			 *
			 * Asymmetric on purpose. Falling fast means walking into a quiet room is
			 * noticed within a second, so a soft voice is heard there. Rising slowly
			 * means a voice cannot drag the floor up behind it and gate itself out
			 * mid-sentence, which is what a symmetric average does: the longer you
			 * speak the more it thinks the room is loud.
			 */
			const towards = this.#loud < this.#floor ? 0.25 : 0.0015;
			this.#floor += (this.#loud - this.#floor) * towards;

			if (this.state === 'speaking') return this.#barge();
			/**
			 * Only when the floor is free, and `listening` is the floor being used.
			 *
			 * The distinction is the whole of a bug this replaces. The server answers
			 * the first frame of an utterance with `listening`, so a screen that only
			 * ran the detector while `idle` ran it for one frame and then stopped: the
			 * turn opened, the state came back, and nothing was left watching for the
			 * silence that would have ended it. The microphone stayed open forever.
			 *
			 * `transcribing`, `thinking` and `speaking` really are closed, and for the
			 * original reason: frames sent then are dropped, and an end sent then
			 * arrives at an exchange that is not listening, so the whole utterance
			 * disappears without anybody being told.
			 */
			if (this.state !== 'idle' && this.state !== 'listening') return;
			this.#turnTaking();
		};
		this.#watching = requestAnimationFrame(tick);
	}

	/** Where the gates sit right now, given how quiet the room is. */
	#gates(): { open: number; close: number } {
		return {
			open: Math.max(QUIETEST, this.#floor * OPEN),
			close: Math.max(QUIETEST * 0.7, this.#floor * CLOSE)
		};
	}

	/** Has somebody started, and have they finished. */
	#turnTaking(): void {
		const now = performance.now();
		const { open, close } = this.#gates();

		if (!this.talking) {
			// A turn only begins from a standing start. `listening` is reachable here
			// for the moment between the end of an utterance being sent and the server
			// moving on to transcribe it, and the tail of the sound that just ended is
			// not the beginning of the next one.
			if (this.state !== 'idle') return void (this.#onsetAt = 0);

			// A sound has to last before it counts. A door, a keyboard and a cough all
			// clear any threshold; none of them lasts a tenth of a second at the level
			// a syllable does.
			if (this.#loud <= open) return void (this.#onsetAt = 0);
			if (!this.#onsetAt) this.#onsetAt = now;
			if (now - this.#onsetAt < ONSET_MS) return;

			this.talking = true;
			this.#startedAt = now;
			this.#spokeAt = now;
			return;
		}

		if (this.#loud > close) {
			this.#spokeAt = now;
			return;
		}

		// Nothing ends in its first fraction of a second: somebody who starts and
		// then gathers their thoughts has not finished, they have not started.
		if (now - this.#startedAt < MINIMUM_MS) return;
		if (now - this.#spokeAt < SILENCE_MS) return;

		this.talking = false;
		this.#onsetAt = 0;
		this.#send({ type: 'end' });
	}

	/**
	 * Somebody talking over the answer.
	 *
	 * Sustained, like an onset, and for the same reason twice over: a consonant
	 * leaking through the echo canceller is loud and brief, and so is a door.
	 */
	#barge(): void {
		const now = performance.now();
		if (this.#loud <= Math.max(QUIETEST * 2, this.#floor * BARGE)) {
			this.#over = 0;
			return;
		}
		if (!this.#over) this.#over = now;
		if (now - this.#over < BARGE_MS) return;

		this.#over = 0;
		this.interrupt();
	}

	/** One frame of microphone, on its way out. */
	#frame(buffer: ArrayBuffer): void {
		if (!this.talking || this.muted) return;
		if (this.#socket?.readyState !== WebSocket.OPEN) return;
		this.#socket.send(buffer);
	}

	/** What the playback worklet says about what actually left the speaker. */
	#played(data: { type: string; played?: number; total?: number }): void {
		if (data?.type !== 'stopped') return;
		const total = data.total || 0;
		this.#send({ type: 'interrupt', heard: total ? (data.played || 0) / total : 0 });
	}

	// --- what the server says ------------------------------------------------

	#receive(event: MessageEvent): void {
		if (event.data instanceof ArrayBuffer) return void this.#hear(event.data);

		let message: ServerMessage;
		try {
			message = JSON.parse(event.data);
		} catch {
			return;
		}

		switch (message.type) {
			case 'ready':
				this.sessionId = message.sessionId;
				return;
			case 'state':
				// A turn beginning closes whatever line the last answer was writing on.
				if (message.value === 'transcribing') this.#answering = false;
				this.state = message.value;
				return;
			case 'heard':
				this.#answering = false;
				this.lines.push({ role: 'user', text: message.text });
				return;
			case 'answer': {
				const last = this.lines.at(-1);
				if (this.#answering && last?.role === 'assistant') {
					last.text = `${last.text} ${message.text}`;
				} else {
					this.lines.push({ role: 'assistant', text: message.text });
					this.#answering = true;
				}
				return;
			}
			case 'speech-begin':
				this.#mime = message.mime;
				return;
			case 'speech-end':
				return;
			case 'error':
				toast.error(message.message);
				return;
		}
	}

	/** One piece of the answer, decoded and handed to the queue. */
	async #hear(bytes: ArrayBuffer): Promise<void> {
		const ctx = this.#ctx;
		if (!ctx || !this.#playback) return;

		try {
			const samples = await this.#decode(ctx, bytes);
			// Transferred rather than copied: it is a second of audio and nothing here
			// reads it again.
			this.#playback.port.postMessage(samples.buffer, [samples.buffer]);
		} catch {
			// One piece that would not decode. The rest of the answer still plays,
			// which is better than an interruption nobody asked for.
		}
	}

	/**
	 * A piece of the answer as samples at the context's own rate.
	 *
	 * Two cases, and they are genuinely different. Anything compressed goes to the
	 * browser's decoder, which resamples on the way. Raw samples carry their rate
	 * in the content type and have to be resampled here, which is worth doing
	 * rather than avoiding: raw is the format that starts playing soonest, because
	 * there is nothing to decode.
	 */
	async #decode(ctx: AudioContext, bytes: ArrayBuffer): Promise<Float32Array> {
		if (!this.#mime.startsWith('audio/pcm')) {
			const buffer = await ctx.decodeAudioData(bytes);
			return buffer.getChannelData(0);
		}

		const rate = Number(/rate=(\d+)/.exec(this.#mime)?.[1]) || 24_000;
		const source = new Int16Array(bytes);
		const floats = new Float32Array(source.length);
		for (let i = 0; i < source.length; i++) floats[i] = source[i] / 32768;

		if (rate === ctx.sampleRate) return floats;

		const offline = new OfflineAudioContext(
			1,
			Math.ceil((floats.length * ctx.sampleRate) / rate),
			ctx.sampleRate
		);
		const buffer = offline.createBuffer(1, floats.length, rate);
		buffer.copyToChannel(floats, 0);
		const node = offline.createBufferSource();
		node.buffer = buffer;
		node.connect(offline.destination);
		node.start();
		return (await offline.startRendering()).getChannelData(0);
	}

	#send(message: ClientMessage): void {
		if (this.#socket?.readyState === WebSocket.OPEN) {
			this.#socket.send(JSON.stringify(message));
		}
	}
}

/** Re-exported so the screen has one import for everything about a voice session. */
export { INPUT_SAMPLE_RATE };

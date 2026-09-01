import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { read, SILENCE, type Reading } from '$lib/audioReading';
import { settingsStore } from '$lib/localStorage';
import { toast } from '$lib/toast';

/**
 * Speaking, and getting words back.
 *
 * One recorder for the whole app, holding three states, because that is all a
 * caller has to draw: idle, recording, waiting for the words.
 *
 * The sound never touches disk and leaves this object only as one request. What
 * comes back is text, and the recording is dropped.
 */
export type VoiceState = 'idle' | 'recording' | 'transcribing';

/**
 * How the recorder knows you have finished. Only the voice screen asks: the
 * composer's microphone is a button somebody holds a conversation around, and a
 * field that submitted itself because they paused would fight them.
 *
 * Deliberately crude, and it should stay crude. A loudness gate, not voice
 * activity detection: it asks whether the room has been quiet for a moment, not
 * whether a person was talking.
 */
interface Listening {
	/** Stop this long after the last sound above the floor. */
	silenceMs: number;
	/** Never stop before this, so a slow start is not read as silence. */
	minimumMs: number;
}

interface Options {
	/** Stop on a silence rather than waiting to be told. Only the voice screen asks. */
	listen?: Listening;
	/**
	 * Nothing was said, or nothing came back as words. Its own way out, because
	 * `onText` is only called when there is text: on a screen that is a loop, a
	 * recording of a quiet room would leave it lit and deaf. Every other caller
	 * ignores it.
	 */
	onNothing?: () => void;
}

/** Low, because the far side of this is cutting somebody off mid-sentence, and half a second too long costs nothing anybody notices. */
const FLOOR = 0.015;

/**
 * A function rather than a method because the answer is wanted before there is
 * a recorder: a screen built around speaking has to know whether speaking is
 * possible before it offers to listen. Read at the moment of asking, since a
 * value captured at construction would outlive the settings.
 */
function transcriber(): { serverId: string; model: string; language: string } | null {
	const settings = get(settingsStore);
	const model = settings.voiceModel;
	if (!settings.voiceInput || !model) return null;
	const known = (settings.models ?? []).find((entry) => entry.name === model);
	return known?.serverId
		? { serverId: known.serverId, model, language: settings.voiceLanguage?.trim() ?? '' }
		: null;
}

export class VoiceRecorder {
	state = $state<VoiceState>('idle');

	/** Zero unless the caller asked to be listened to: the analyser is only wired up where something reads this, and a meter drawn from nothing is a meter that lies. */
	level = $state(0);

	#recorder: MediaRecorder | null = null;
	/**
	 * Held from the moment `start` is called until the state says so. `state` stays
	 * `idle` while the browser asks about the microphone, which is the window a
	 * second caller gets through: the voice screen has two paths that can decide to
	 * listen at the same moment.
	 */
	#starting = false;
	#chunks: Blob[] = [];
	#stream: MediaStream | null = null;
	#context: AudioContext | null = null;
	#analyser: AnalyserNode | null = null;
	#spectrum = new Uint8Array(0);
	#watching: number | null = null;

	/** Where the sound goes. Read at the moment of asking, not at construction. */
	#target() {
		return transcriber();
	}

	/** Whether anything can be transcribed at all: a model, on a connection. */
	static available(): boolean {
		return !!transcriber();
	}

	/** The callback rather than a return value: the words arrive long after this resolves, and it is the second press that produces anything. */
	async start(onText: (text: string) => void, options: Options = {}): Promise<void> {
		if (this.state !== 'idle' || this.#starting) return;
		this.#starting = true;
		try {
			await this.#begin(onText, options);
		} finally {
			this.#starting = false;
		}
	}

	async #begin(onText: (text: string) => void, options: Options): Promise<void> {
		const listening = options.listen;
		// `$LL` is a reserved prefix in a `.svelte.ts` module: the runes compiler
		// refuses it, so the dictionary is a plain binding here.
		const strings = get(LL);
		if (!this.#target()) {
			toast.error(strings.voiceNoModel());
			return;
		}

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			// Refused, or no microphone at all. Both are the same answer here.
			toast.error(strings.voiceNoMicrophone());
			return;
		}

		this.#stream = stream;
		this.#chunks = [];
		// Left to the browser: Chromium gives webm, Safari mp4, and both are on the
		// server's list. Naming one here is how you get silence on the other.
		this.#recorder = new MediaRecorder(stream);
		this.#recorder.ondataavailable = (event) => {
			if (event.data.size) this.#chunks.push(event.data);
		};
		this.#recorder.onstop = () => void this.#send(onText, options.onNothing);
		this.#recorder.start();
		this.state = 'recording';
		if (listening) this.#watch(stream, listening);
	}

	/** On the live stream rather than on the recording, because the answer is needed while it is still being recorded. The same reading drives the meter. */
	#watch(stream: MediaStream, { silenceMs, minimumMs }: Listening): void {
		let context: AudioContext;
		try {
			context = new AudioContext();
		} catch {
			// No Web Audio, no gate. The recording still works and the button still stops it.
			return;
		}

		this.#context = context;
		const analyser = context.createAnalyser();
		analyser.fftSize = 1024;
		// Smoothed, so the gate is not tripped by one loud frame and whatever is
		// drawing gets a reading it can apply its own attack to.
		analyser.smoothingTimeConstant = 0.6;
		context.createMediaStreamSource(stream).connect(analyser);
		this.#analyser = analyser;
		this.#spectrum = new Uint8Array(analyser.frequencyBinCount);

		const samples = new Float32Array(analyser.fftSize);
		const startedAt = performance.now();
		let lastSound = startedAt;

		const tick = () => {
			if (this.state !== 'recording') return;
			analyser.getFloatTimeDomainData(samples);

			// Root mean square: the loudness of the window, rather than whichever sample
			// happened to be the tallest in it.
			let sum = 0;
			for (const sample of samples) sum += sample * sample;
			const loudness = Math.sqrt(sum / samples.length);
			this.level = Math.min(1, loudness * 8);

			const now = performance.now();
			if (loudness > FLOOR) lastSound = now;
			if (now - startedAt > minimumMs && now - lastSound > silenceMs) return this.stop();

			this.#watching = requestAnimationFrame(tick);
		};
		this.#watching = requestAnimationFrame(tick);
	}

	/** Stop listening. The words follow. */
	stop(): void {
		if (this.state !== 'recording') return;
		this.state = 'transcribing';
		this.#recorder?.stop();
	}

	/** Stop listening and keep nothing, for a caller that is going away. */
	cancel(): void {
		this.#chunks = [];
		if (this.#recorder?.state === 'recording') this.#recorder.stop();
		this.#release();
		this.state = 'idle';
	}

	async #send(onText: (text: string) => void, onNothing?: () => void): Promise<void> {
		const strings = get(LL);
		const target = this.#target();
		const type = this.#recorder?.mimeType?.split(';')[0] || 'audio/webm';
		const audio = new Blob(this.#chunks, { type });
		this.#chunks = [];
		this.#release();

		if (!target || !audio.size) {
			this.state = 'idle';
			onNothing?.();
			return;
		}

		const form = new FormData();
		form.set('audio', audio, `speech.${type.split('/')[1] ?? 'webm'}`);
		form.set('serverId', target.serverId);
		form.set('model', target.model);
		// Only when somebody has said. Empty leaves the model to work it out.
		if (target.language) form.set('language', target.language);

		try {
			const response = await fetch('/api/transcribe', { method: 'POST', body: form });
			if (!response.ok) {
				const detail = await response.text().catch(() => '');
				toast.error(strings.voiceFailed(), { description: detail.slice(0, 200) || undefined });
				onNothing?.();
				return;
			}
			const { text } = (await response.json()) as { text: string };
			if (text) onText(text);
			else {
				toast.info(strings.voiceHeardNothing());
				onNothing?.();
			}
		} catch {
			toast.error(strings.voiceFailed());
			onNothing?.();
		} finally {
			this.state = 'idle';
		}
	}

	/** The mirror of the speaker's own, same contract: pulled by whoever is drawing, zeroes when there is nothing to hear. Together they let one shape stand for both halves of a conversation. */
	reading(): Reading {
		return this.state === 'recording' ? read(this.#analyser, this.#spectrum) : SILENCE;
	}

	/** The browser keeps the recording indicator on until every track is stopped. */
	#release(): void {
		if (this.#watching !== null) cancelAnimationFrame(this.#watching);
		this.#watching = null;
		void this.#context?.close().catch(() => {});
		this.#context = null;
		this.#analyser = null;
		this.#spectrum = new Uint8Array(0);
		this.level = 0;
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#recorder = null;
	}
}

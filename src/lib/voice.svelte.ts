import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { settingsStore } from '$lib/localStorage';
import { toast } from '$lib/toast';

/**
 * Speaking, and getting words back.
 *
 * One recorder for the whole app: the composer uses it, and the mobile interface
 * will use the same one. It holds three states and nothing else, because that is
 * all a caller has to draw: idle, recording, and waiting for the words.
 *
 * The sound never touches disk and never leaves this object except as one
 * request. What comes back is text, handed to whoever asked, and the recording is
 * dropped: a dictation that kept what it heard would be a microphone in somebody's
 * room with an archive attached.
 */
export type VoiceState = 'idle' | 'recording' | 'transcribing';

export class VoiceRecorder {
	state = $state<VoiceState>('idle');

	#recorder: MediaRecorder | null = null;
	#chunks: Blob[] = [];
	#stream: MediaStream | null = null;

	/** Where the sound goes. Read at the moment of asking, not at construction. */
	#target(): { serverId: string; model: string } | null {
		const settings = get(settingsStore);
		const model = settings.voiceModel;
		if (!model) return null;
		const known = (settings.models ?? []).find((entry) => entry.name === model);
		return known?.serverId ? { serverId: known.serverId, model } : null;
	}

	/**
	 * Start listening, and hand the words over when it stops.
	 *
	 * The callback rather than a return value, because the words arrive long after
	 * this resolves: the caller presses once to start and once to stop, and it is
	 * the second press that produces anything.
	 */
	async start(onText: (text: string) => void): Promise<void> {
		if (this.state !== 'idle') return;

		// `$LL` is a reserved prefix in a `.svelte.ts` module: the runes compiler
		// refuses it outright, so the dictionary is a plain binding here.
		const strings = get(LL);
		if (!this.#target()) {
			toast.error(strings.voiceNoModel());
			return;
		}

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			// Refused, or no microphone at all. Both are the same answer here, and
			// neither is a fault worth a stack trace.
			toast.error(strings.voiceNoMicrophone());
			return;
		}

		this.#stream = stream;
		this.#chunks = [];
		// Left to the browser: Chromium gives webm, Safari gives mp4, and both are
		// on the server's list. Naming one here is how you get silence on the other.
		this.#recorder = new MediaRecorder(stream);
		this.#recorder.ondataavailable = (event) => {
			if (event.data.size) this.#chunks.push(event.data);
		};
		this.#recorder.onstop = () => void this.#send(onText);
		this.#recorder.start();
		this.state = 'recording';
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

	async #send(onText: (text: string) => void): Promise<void> {
		const strings = get(LL);
		const target = this.#target();
		const type = this.#recorder?.mimeType?.split(';')[0] || 'audio/webm';
		const audio = new Blob(this.#chunks, { type });
		this.#chunks = [];
		this.#release();

		if (!target || !audio.size) {
			this.state = 'idle';
			return;
		}

		const form = new FormData();
		form.set('audio', audio, `speech.${type.split('/')[1] ?? 'webm'}`);
		form.set('serverId', target.serverId);
		form.set('model', target.model);

		try {
			const response = await fetch('/api/transcribe', { method: 'POST', body: form });
			if (!response.ok) {
				const detail = await response.text().catch(() => '');
				toast.error(strings.voiceFailed(), { description: detail.slice(0, 200) || undefined });
				return;
			}
			const { text } = (await response.json()) as { text: string };
			if (text) onText(text);
			else toast.info(strings.voiceHeardNothing());
		} catch {
			toast.error(strings.voiceFailed());
		} finally {
			this.state = 'idle';
		}
	}

	/** The browser keeps the recording indicator on until every track is stopped. */
	#release(): void {
		this.#stream?.getTracks().forEach((track) => track.stop());
		this.#stream = null;
		this.#recorder = null;
	}
}

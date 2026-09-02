/**
 * The microphone, reduced to what a recogniser wants.
 *
 * Plain JavaScript in `static/` because an `AudioWorklet` is loaded by URL into
 * a separate realm: it never passes through the bundle, so there is no import it
 * could resolve.
 *
 * It runs on the audio thread, which is the reason this is not done in the page:
 * a dropped buffer here is an audible gap in what somebody said. Two jobs, both
 * allocation-free after the first call: reduce 48 kHz to 16, and hand up whole
 * frames rather than whatever length the hardware delivers.
 */

/** What the server expects, matching `INPUT_SAMPLE_RATE` in the protocol. */
const TARGET_RATE = 16000;

/** Twenty milliseconds at that rate, matching `FRAME_SAMPLES`. */
const FRAME = 320;

class VoiceCapture extends AudioWorkletProcessor {
	constructor() {
		super();

		/** Read from `sampleRate`, the worklet's own global, rather than assumed: the hardware decides, and it is 48000 on most machines and 44100 on some. */
		this.step = sampleRate / TARGET_RATE;

		/** Where in the input we are, carried across blocks so nothing is lost. */
		this.position = 0;

		/** The frame being filled, and how far in. */
		this.frame = new Int16Array(FRAME);
		this.filled = 0;
	}

	process(inputs) {
		const input = inputs[0]?.[0];
		// No input is not an error: it happens between the track being connected and the
		// first buffer, and on a muted track for as long as it is muted.
		if (!input) return true;

		while (this.position < input.length) {
			// Nearest sample rather than an average of the window it stands for. A proper
			// filter is not worth it here: what follows is speech recognition, and the
			// aliasing this admits sits above the band anybody transcribes.
			const sample = input[Math.floor(this.position)];

			// Clamped before scaling, or a sample above one turns into a very loud negative
			// number once it wraps a signed sixteen-bit integer.
			const clamped = Math.max(-1, Math.min(1, sample));
			this.frame[this.filled++] = Math.round(clamped * 32767);

			if (this.filled === FRAME) {
				// A copy, because the frame is refilled immediately and the message is delivered
				// asynchronously. Transferred rather than cloned, so `slice()` is called once
				// and the same buffer is both the payload and the thing handed over.
				const sent = this.frame.slice().buffer;
				this.port.postMessage(sent, [sent]);
				this.filled = 0;
			}

			this.position += this.step;
		}

		// What is left of the step, carried into the next block so the resampling does
		// not drift a fraction of a sample every 128 frames.
		this.position -= input.length;

		return true;
	}
}

registerProcessor('voice-capture', VoiceCapture);

/**
 * The answer coming out of the speaker, one queue deep.
 *
 * The counterpart of the capture worklet, and why interruption works. An
 * `<audio>` element or a scheduled buffer source can be stopped, but neither can
 * say how much of itself was heard, and that number decides where the stored
 * transcript is cut. Here the queue is ours, so the count is exact.
 *
 * Also why the answer starts on its first sentence: pieces are pushed in as they
 * arrive and played back to back, so the seam is the decoder's and nothing else.
 */

class VoicePlayback extends AudioWorkletProcessor {
	constructor() {
		super();

		/** Pieces waiting to be played, oldest first. */
		this.queue = [];

		/** How far into the piece at the head of the queue we are. */
		this.offset = 0;

		/** Samples actually handed to the hardware, which is what "heard" means. */
		this.played = 0;

		/** Samples accepted, so the page can say what share of them was heard. */
		this.total = 0;

		this.port.onmessage = ({ data }) => {
			if (data instanceof ArrayBuffer) {
				const piece = new Float32Array(data);
				this.queue.push(piece);
				this.total += piece.length;
				return;
			}

			// Take the floor: everything still queued is dropped, and what was played is
			// reported so the transcript can be cut to match.
			if (data?.type === 'flush') {
				this.queue = [];
				this.offset = 0;
				this.port.postMessage({ type: 'stopped', played: this.played, total: this.total });
				this.played = 0;
				this.total = 0;
			}
		};
	}

	process(_inputs, outputs) {
		const output = outputs[0][0];
		if (!output) return true;

		for (let i = 0; i < output.length; i++) {
			const piece = this.queue[0];
			if (!piece) {
				// Silence rather than stopping: a processor that returns false is torn down, and
				// the next sentence would find nothing to play it.
				output[i] = 0;
				continue;
			}

			output[i] = piece[this.offset++];
			this.played++;

			if (this.offset >= piece.length) {
				this.queue.shift();
				this.offset = 0;
				// Said out loud so the page knows when the answer has finished leaving the
				// speaker, which is later than when the last piece arrived.
				if (!this.queue.length) this.port.postMessage({ type: 'drained' });
			}
		}

		return true;
	}
}

registerProcessor('voice-playback', VoicePlayback);

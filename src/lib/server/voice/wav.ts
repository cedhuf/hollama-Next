/**
 * Raw samples, wrapped in the smallest container a recogniser will accept.
 *
 * The socket carries bare 16-bit samples, because that is what a microphone
 * worklet produces and anything else would mean encoding on a phone. The
 * transcription endpoints take a file, and refuse a payload with no format to
 * read it by, so a header goes on before the upload. Forty-four bytes.
 *
 * WAV rather than anything better, and there is nothing to gain from better
 * here: the upload is one utterance, a few seconds, over a connection that has
 * just carried the same samples uncompressed anyway.
 */

const HEADER_BYTES = 44;
const BITS = 16;
const CHANNELS = 1;

/** One utterance, as a file. `frames` are little-endian 16-bit mono samples. */
export function wavFromPcm(frames: Buffer[], sampleRate: number): Buffer {
	const audio = frames.length === 1 ? frames[0] : Buffer.concat(frames);
	const header = Buffer.alloc(HEADER_BYTES);
	const byteRate = (sampleRate * CHANNELS * BITS) / 8;

	header.write('RIFF', 0, 'ascii');
	header.writeUInt32LE(36 + audio.length, 4);
	header.write('WAVE', 8, 'ascii');

	header.write('fmt ', 12, 'ascii');
	header.writeUInt32LE(16, 16); // the size of this chunk
	header.writeUInt16LE(1, 20); // 1 is uncompressed PCM
	header.writeUInt16LE(CHANNELS, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE((CHANNELS * BITS) / 8, 32); // bytes per sample, all channels
	header.writeUInt16LE(BITS, 34);

	header.write('data', 36, 'ascii');
	header.writeUInt32LE(audio.length, 40);

	return Buffer.concat([header, audio]);
}

/** How long a run of samples lasts, for deciding whether it is worth sending. */
export function durationMs(frames: Buffer[], sampleRate: number): number {
	const bytes = frames.reduce((total, frame) => total + frame.length, 0);
	return (bytes / 2 / sampleRate) * 1000;
}

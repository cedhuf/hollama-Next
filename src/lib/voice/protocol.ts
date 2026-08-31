/**
 * What the two ends of a spoken conversation say to each other.
 *
 * One file, imported by the browser and by the server, because a protocol
 * described in two places is a protocol that disagrees with itself the first
 * time somebody adds a field. Nothing in here reaches for a runtime: it is
 * types, two numbers and a path.
 *
 * The socket carries two kinds of traffic on purpose. Binary frames are audio
 * and nothing else, so neither side has to unwrap a wrapper sixty times a second
 * or pay a third for base64. Text frames are everything else, as JSON, where
 * being readable in a network panel is worth more than the bytes.
 */

/** Where the socket lives. Matched by the upgrade handler, opened by the client. */
export const VOICE_SOCKET_PATH = '/api/voice/stream';

/**
 * The rate the microphone is sent at.
 *
 * Sixteen kilohertz because that is what recognisers want: speech has nothing
 * above eight, and every kilohertz above that is bytes uploaded to be discarded.
 * The browser captures at whatever the hardware gives (usually 48) and reduces
 * to this before anything leaves.
 */
export const INPUT_SAMPLE_RATE = 16_000;

/**
 * How much sound is in one frame, in samples at the rate above.
 *
 * Twenty milliseconds, which is the size voice activity detection wants to think
 * in and small enough that the end of a sentence is noticed within one frame.
 * Smaller would be sixty messages a second for no gain a person could hear.
 */
export const FRAME_SAMPLES = 320;

/** What the browser says. Binary frames alongside these are microphone audio. */
export type ClientMessage =
	/**
	 * Always first, and nothing else is read until it arrives.
	 *
	 * The ticket travels here rather than in the address, so it is never written
	 * into a proxy's access log on its way past.
	 */
	| { type: 'hello'; ticket: string }
	/**
	 * The person has stopped speaking, as far as this end can tell.
	 *
	 * Decided in the browser because that is where the detector runs, and running
	 * it there means silence is never uploaded at all.
	 */
	| { type: 'end' }
	/**
	 * Speech while the answer was playing: take the floor.
	 *
	 * `heard` is the share of the answer's audio that actually left the speaker,
	 * from nought to one, so the stored transcript can be cut at what was heard
	 * rather than at what was written. A fraction rather than a count of samples
	 * because only the browser can know it: the server sends encoded audio and has
	 * no idea how long it turned out to be, while the playback queue knows exactly
	 * what it had and exactly where it stopped.
	 */
	| { type: 'interrupt'; heard: number }
	/** Stop and keep nothing. The conversation stays open. */
	| { type: 'cancel' };

/** What the server says. Binary frames alongside these are the answer's audio. */
export type ServerMessage =
	/** The ticket was good. Nothing before this is worth sending. */
	| { type: 'ready'; sessionId: string }
	/** Where the exchange is, for whatever is drawing it. */
	| { type: 'state'; value: VoiceState }
	/** What was understood, once the words come back. */
	| { type: 'heard'; text: string }
	/** The answer, in the pieces it is being spoken in. */
	| { type: 'answer'; text: string }
	/**
	 * Audio follows, in this format, until `speech-end`.
	 *
	 * Announced rather than assumed. A provider answers in what it was asked for
	 * and says so in its content type, and the two cases the browser handles are
	 * genuinely different: a compressed format is decoded, while raw samples are
	 * played straight and carry their rate in the type itself
	 * (`audio/pcm;rate=24000`). Guessing either one wrong is a voice at the wrong
	 * pitch or no voice at all.
	 */
	| { type: 'speech-begin'; mime: string }
	| { type: 'speech-end' }
	/** Something failed. The conversation survives it; the turn does not. */
	| { type: 'error'; message: string };

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

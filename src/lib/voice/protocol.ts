/**
 * What the two ends of a spoken conversation say to each other.
 *
 * One file, imported by the browser and the server, because a protocol
 * described twice disagrees with itself the first time somebody adds a field.
 *
 * Two kinds of traffic on purpose: binary frames are audio and nothing else, so
 * neither side unwraps a wrapper sixty times a second or pays a third for
 * base64; text frames are everything else, as JSON.
 */

/** Where the socket lives. Matched by the upgrade handler, opened by the client. */
export const VOICE_SOCKET_PATH = '/api/voice/stream';

/** Sixteen kilohertz because that is what recognisers want: speech has nothing above eight. The browser captures at whatever the hardware gives and reduces before anything leaves. */
export const INPUT_SAMPLE_RATE = 16_000;

/** Twenty milliseconds: the size voice activity detection thinks in, and small enough that the end of a sentence is noticed within one frame. */
export const FRAME_SAMPLES = 320;

/** What the browser says. Binary frames alongside these are microphone audio. */
export type ClientMessage =
	/** The ticket travels here rather than in the address, so it is never written into a proxy's access log. */
	| { type: 'hello'; ticket: string }
	/** Decided in the browser, where the detector runs, which means silence is never uploaded at all. */
	| { type: 'end' }
	/**
	 * Speech while the answer was playing: take the floor. `heard` is the share of
	 * the answer's audio that actually left the speaker, so the stored transcript
	 * can be cut at what was heard. A fraction because only the browser knows: the
	 * server sends encoded audio and has no idea how long it turned out to be.
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
	 * Audio follows, in this format, until `speech-end`. Announced rather than
	 * assumed: a compressed format is decoded, while raw samples are played straight
	 * and carry their rate in the type (`audio/pcm;rate=24000`). Guessing wrong is a
	 * voice at the wrong pitch or no voice at all.
	 */
	| { type: 'speech-begin'; mime: string }
	| { type: 'speech-end' }
	/** Something failed. The conversation survives it; the turn does not. */
	| { type: 'error'; message: string };

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

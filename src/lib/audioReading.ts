/**
 * What a sound looks like, for whatever is drawing it.
 *
 * Shared by the two ends of the voice screen, because the shape being drawn does
 * not care which direction the sound is going: the orb reads the microphone while
 * somebody is talking and the speaker while it is answering, and it should not
 * need two ways of asking.
 *
 * Pulled rather than pushed, and that is the whole reason this is a function
 * instead of a store. Whoever draws already has a frame loop; publishing sixty
 * readings a second into reactive state would wake every effect on the page to
 * animate one shape.
 */

export interface Reading {
	/** Overall energy, nought to one. */
	level: number;
	/**
	 * A handful of bands across the voice range, each nought to one.
	 *
	 * Twelve, and only across the lower part of the spectrum. Speech lives under
	 * about four kilohertz, so the upper half of an analyser's bins is mostly
	 * silence, and folding it in would flatten every band towards nothing.
	 *
	 * Spaced so the low ones are narrow and the high ones are wide, which is how
	 * hearing works and, more usefully here, what stops the first band from being
	 * the only one that ever moves.
	 */
	bands: number[];
}

export const BAND_COUNT = 12;

/** Nothing being heard, which is a reading rather than the absence of one. */
export const SILENCE: Reading = { level: 0, bands: new Array(BAND_COUNT).fill(0) };

/**
 * The current frame, folded into something drawable.
 *
 * The buffer is handed in rather than allocated here: this runs sixty times a
 * second, and a new array per frame is sixty avoidable allocations per second per
 * source.
 */
export function read(analyser: AnalyserNode | null, into: Uint8Array<ArrayBuffer>): Reading {
	if (!analyser || into.length !== analyser.frequencyBinCount) return SILENCE;

	analyser.getByteFrequencyData(into);

	// The voice range, as a share of the bins available. Everything above it is
	// sibilance and room, neither of which says much about a syllable.
	const usable = Math.max(BAND_COUNT, Math.floor(into.length * 0.45));

	const bands: number[] = [];
	let total = 0;

	for (let band = 0; band < BAND_COUNT; band++) {
		// Widening slices: the first covers a few bins, the last covers many.
		const from = Math.floor(usable * Math.pow(band / BAND_COUNT, 1.7));
		const to = Math.max(from + 1, Math.floor(usable * Math.pow((band + 1) / BAND_COUNT, 1.7)));

		let sum = 0;
		for (let bin = from; bin < to; bin++) sum += into[bin];
		const value = sum / (to - from) / 255;

		bands.push(value);
		total += value;
	}

	return { level: Math.min(1, total / BAND_COUNT), bands };
}

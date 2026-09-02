/**
 * What a sound looks like, for whatever is drawing it.
 *
 * Shared by the two ends of the voice screen: the shape being drawn does not
 * care which direction the sound is going.
 *
 * Pulled rather than pushed, which is why it is a function and not a store:
 * whoever draws already has a frame loop, and publishing sixty readings a second
 * into reactive state would wake every effect on the page.
 */

export interface Reading {
	/** Overall energy, nought to one. */
	level: number;
	/**
	 * A handful of bands across the voice range, each nought to one.
	 *
	 * Twelve, and only across the lower spectrum: speech lives under about four
	 * kilohertz, so folding the upper half in would flatten every band. Spaced so
	 * the low ones are narrow and the high ones wide, which is how hearing works and
	 * what stops the first band being the only one that ever moves.
	 */
	bands: number[];
}

export const BAND_COUNT = 12;

/** Nothing being heard, which is a reading rather than the absence of one. */
export const SILENCE: Reading = { level: 0, bands: new Array(BAND_COUNT).fill(0) };

/** The buffer is handed in rather than allocated here: this runs sixty times a second, and a new array per frame is sixty avoidable allocations. */
export function read(analyser: AnalyserNode | null, into: Uint8Array<ArrayBuffer>): Reading {
	if (!analyser || into.length !== analyser.frequencyBinCount) return SILENCE;

	analyser.getByteFrequencyData(into);

	// The voice range, as a share of the bins available: everything above it is
	// sibilance and room.
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

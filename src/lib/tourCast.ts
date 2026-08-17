/**
 * The characters the welcome tour introduces, and what they say.
 *
 * Fixed here rather than read from the store, and that is the point. The tour is
 * the first thing anyone sees, it runs before a single request has had to
 * succeed, and it explains what a persona *is* — a question whose answer does not
 * change with what a particular catalogue happens to list today. Built on the
 * store it was a first impression that depended on a network call: a cold cache
 * meant a skeleton, an unreachable listing meant an apology, and a curated
 * instance meant the concept was explained with whatever three personas that
 * admin had kept.
 *
 * The store still appears, once, as a count of what is actually available. That
 * line is the only part that can fail, and when it does it simply is not there.
 *
 * The lines are written, not fetched. They are short on purpose: what they have
 * to convey is that these are different people, not what any of them can do.
 */

export interface TourPersona {
	id: string;
	name: string;
	/** The disc, from the persona palette. */
	color: string;
	/** Inner SVG for a `0 0 64 64` box, drawn over the disc. See `TourFace`. */
	face: string;
	/** What they say while drifting, in their own voice. */
	line: string;
}

/**
 * A face rather than a symbol.
 *
 * A persona is someone you talk to, and a pictogram of a saucepan says what the
 * conversation is about while saying nothing about who is having it. Eyes and a
 * mouth do the opposite, which is the right way round for a step whose whole job
 * is "these are characters". The store's own glyphs stay symbols, because there
 * a card is being catalogued rather than introduced.
 *
 * Ink is `currentColor` so it belongs to the theme, and the disc shows back
 * through `var(--tour-face-cut)`, the same contract the persona glyphs use.
 */
const eyes = (y: number) =>
	`<circle fill="currentColor" cx="25" cy="${y}" r="3"/><circle fill="currentColor" cx="39" cy="${y}" r="3"/>`;

const smile = (y: number) =>
	`<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M25 ${y}q7 6 14 0"/>`;

const cheeks = (y: number) =>
	`<g fill="currentColor" opacity="0.3"><circle cx="18" cy="${y}" r="2.6"/><circle cx="46" cy="${y}" r="2.6"/></g>`;

export const TOUR_CAST: TourPersona[] = [
	{
		id: 'nova',
		name: 'Nova',
		color: '#7F77DD',
		// An antenna, because the everyday assistant is the one that may as well
		// admit what it is.
		face:
			'<circle fill="currentColor" cx="32" cy="11" r="3.2"/>' +
			'<rect fill="currentColor" x="30.6" y="13" width="2.8" height="7" rx="1.4"/>' +
			'<rect fill="currentColor" x="12" y="20" width="40" height="6" rx="3" opacity="0.35"/>' +
			eyes(36) +
			smile(44) +
			cheeks(43),
		line: 'Ask me anything. I keep it short.'
	},
	{
		id: 'lou',
		name: 'Lou',
		color: '#D4537E',
		// Hair framing the face, so the softest of them looks it.
		face:
			'<path fill="currentColor" opacity="0.35" d="M12 36a20 20 0 0 1 40 0v8a3.5 3.5 0 0 1-7 0V33a13 13 0 0 0-26 0v11a3.5 3.5 0 0 1-7 0z"/>' +
			eyes(36) +
			smile(44) +
			cheeks(43),
		line: 'Rough day? I am listening.'
	},
	{
		id: 'max',
		name: 'Max',
		color: '#D85A30',
		// A headband, and a bit of hair getting out of it.
		face:
			'<path fill="currentColor" opacity="0.35" d="M17 21c1-8 7-12 15-12s14 4 15 12c-4-4-9-6-15-6s-11 2-15 6z"/>' +
			'<rect fill="currentColor" x="13" y="20" width="38" height="5" rx="2.5"/>' +
			eyes(37) +
			smile(45) +
			cheeks(44),
		line: "Ready when you are. Let's move."
	},
	{
		id: 'pixel',
		name: 'Pixel',
		color: '#378ADD',
		// Headphones, worn rather than held.
		face:
			'<path fill="none" stroke="currentColor" stroke-width="3.5" d="M14 34a18 18 0 0 1 36 0"/>' +
			'<rect fill="currentColor" x="9" y="31" width="8.5" height="14" rx="4.25"/>' +
			'<rect fill="currentColor" x="46.5" y="31" width="8.5" height="14" rx="4.25"/>' +
			eyes(37) +
			smile(45) +
			cheeks(44),
		line: 'Yes, it is out on Friday.'
	},
	{
		id: 'maite',
		name: 'Maïté',
		color: '#1D9E75',
		// A chef's hat, sitting low enough to leave the face room.
		face:
			'<path fill="currentColor" d="M20 24a6.5 6.5 0 1 1 4.5-11.5 8 8 0 0 1 15 0A6.5 6.5 0 1 1 44 24z"/>' +
			'<rect fill="currentColor" x="19" y="23" width="26" height="6" rx="2.4"/>' +
			eyes(40) +
			smile(47) +
			cheeks(46),
		line: 'What is in your fridge?'
	}
];

/**
 * The turn the mention step plays out.
 *
 * A real question with a reason to ask two people at once, rather than a demo
 * that says "hello": the answers only make sense together, which is the argument
 * for the feature and the only honest way to make it.
 */
export const TOUR_TURN = {
	ask: 'what do I eat after training?',
	replies: [
		{
			id: 'maite',
			says: 'Protein and a proper carb. Eggs, rice, whatever is open. Ten minutes, no more.'
		},
		{ id: 'max', says: 'Within the hour if you can, and drink more than you think you need.' }
	]
};

export const tourPersona = (id: string): TourPersona =>
	TOUR_CAST.find((persona) => persona.id === id) ?? TOUR_CAST[0];

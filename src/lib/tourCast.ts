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
 *
 * The faces are the app's own glyphs, the same ones the store's personas wear, so
 * the characters someone meets in the tour are the characters they then find in
 * the Library rather than a set drawn twice.
 */

export interface TourPersona {
	id: string;
	name: string;
	/** The disc, from the persona palette. Matches the store's own bundle. */
	color: string;
	/** One of `PERSONA_GLYPHS`, the same faces the store's personas wear. */
	glyph: string;
	/** What they say while drifting, in their own voice. */
	line: string;
}

export const TOUR_CAST: TourPersona[] = [
	{
		id: 'nova',
		name: 'Nova',
		color: '#378ADD',
		glyph: 'face-antenna',
		line: 'Ask me anything. I keep it short.'
	},
	{
		id: 'lou',
		name: 'Lou',
		color: '#D4537E',
		glyph: 'face-hair',
		line: 'Rough day? I am listening.'
	},
	{
		id: 'max',
		name: 'Max',
		color: '#D85A30',
		glyph: 'face-headband',
		line: "Ready when you are. Let's move."
	},
	{
		id: 'pixel',
		name: 'Pixel',
		color: '#7F77DD',
		glyph: 'face-headset',
		line: 'Yes, it is out on Friday.'
	},
	{
		id: 'maite',
		name: 'Maïté',
		color: '#BA7517',
		glyph: 'face-chef',
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

/** What `PersonaAvatar` needs, for a character that is not a stored persona. */
export const tourAvatar = (persona: TourPersona) => ({
	name: persona.name,
	avatarColor: persona.color,
	avatarGlyph: persona.glyph
});

export const tourPersona = (id: string): TourPersona =>
	TOUR_CAST.find((persona) => persona.id === id) ?? TOUR_CAST[0];

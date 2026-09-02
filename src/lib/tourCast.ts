/**
 * The characters the welcome tour introduces, and what they say.
 *
 * Fixed here rather than read from the store: the tour is the first thing anyone
 * sees, runs before a single request has had to succeed, and explains what a
 * persona *is*. Built on the store, a cold cache meant a skeleton.
 *
 * The store still appears once, as a count of what is available, and that line
 * is the only part that can fail. The faces are the app's own glyphs, so the
 * characters met in the tour are the ones found in the Library.
 */

export interface TourPersona {
	id: string;
	name: string;
	/** The disc, from the persona palette. Matches the store's own bundle. */
	color: string;
	/** One of `PERSONA_GLYPHS`, the same faces the store's personas wear. */
	glyph: string;
	/** A key rather than the sentence: these are the first words anybody reads, and reading them in a language you did not choose is a poor welcome. Only what comes out of their mouths is looked up. */
	line: 'tourLineNova' | 'tourLineLou' | 'tourLineMax' | 'tourLinePixel' | 'tourLineMaite';
}

export const TOUR_CAST: TourPersona[] = [
	{
		id: 'nova',
		name: 'Nova',
		color: '#378ADD',
		glyph: 'face-antenna',
		line: 'tourLineNova'
	},
	{
		id: 'lou',
		name: 'Lou',
		color: '#D4537E',
		glyph: 'face-hair',
		line: 'tourLineLou'
	},
	{
		id: 'max',
		name: 'Max',
		color: '#D85A30',
		glyph: 'face-headband',
		line: 'tourLineMax'
	},
	{
		id: 'pixel',
		name: 'Pixel',
		color: '#7F77DD',
		glyph: 'face-headset',
		line: 'tourLinePixel'
	},
	{
		id: 'maite',
		name: 'Maïté',
		color: '#BA7517',
		glyph: 'face-chef',
		line: 'tourLineMaite'
	}
];

/** A real question with a reason to ask two people at once, rather than a demo that says "hello": the answers only make sense together, which is the argument for the feature. */
export const TOUR_TURN = {
	ask: 'tourAsk',
	replies: [
		{ id: 'maite', says: 'tourSaysMaite' as const },
		{ id: 'max', says: 'tourSaysMax' as const }
	]
} as const;

/** What `PersonaAvatar` needs, for a character that is not a stored persona. */
export const tourAvatar = (persona: TourPersona) => ({
	name: persona.name,
	avatarColor: persona.color,
	avatarGlyph: persona.glyph
});

export const tourPersona = (id: string): TourPersona =>
	TOUR_CAST.find((persona) => persona.id === id) ?? TOUR_CAST[0];

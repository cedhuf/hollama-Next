/**
 * The avatars the app can draw itself.
 *
 * A picture is tens of kilobytes of base64 carried in every bundle, fixed at the
 * size it was encoded. A glyph is its name and a colour: thirty bytes, sharp at
 * any size, drawn with the app's own ink so it belongs to the theme.
 *
 * They used to be data URIs inside `defaultPersonas`, which is the same drawing
 * written as a string nobody could reuse.
 *
 * The markup is drawn over the disc in a 64x64 box. Two colours: `currentColor`
 * is the ink, and `var(--persona-glyph-cut)` is the disc showing back through.
 */
export interface PersonaGlyph {
	/** Stored in the persona and named in a bundle, so it never changes. */
	id: string;
	/** Shown in the picker. */
	label: string;
	/** Inner SVG markup for a `0 0 64 64` viewBox. */
	body: string;
}

/** Written once rather than repeated in each glyph, so a row of them looks like a cast: the eyes are the same eyes, and only the thing on top of the head differs. */
const eyes = (y: number) =>
	`<circle fill="currentColor" cx="25" cy="${y}" r="3"/><circle fill="currentColor" cx="39" cy="${y}" r="3"/>`;

const smile = (y: number) =>
	`<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M25 ${y}q7 6 14 0"/>`;

const cheeks = (y: number) =>
	`<g fill="currentColor" opacity="0.3"><circle cx="18" cy="${y}" r="2.6"/><circle cx="46" cy="${y}" r="2.6"/></g>`;

/** Eyes, a mouth, cheeks, and one thing worn on top. */
const face = (worn: string, y = 36) => worn + eyes(y) + smile(y + 8) + cheeks(y + 7);

export const PERSONA_GLYPHS: PersonaGlyph[] = [
	/*
	 * The faces come first: a pictogram of a saucepan says what the conversation
	 * will be about while saying nothing about who is having it, and eyes and a
	 * mouth do the opposite. The symbols stay for the personas that are a tool.
	 */
	{
		id: 'face-antenna',
		label: 'Antenna',
		// An assistant that may as well admit what it is.
		body: face(
			'<circle fill="currentColor" cx="32" cy="11" r="3.2"/>' +
				'<rect fill="currentColor" x="30.6" y="13" width="2.8" height="7" rx="1.4"/>' +
				'<rect fill="currentColor" x="12" y="20" width="40" height="6" rx="3" opacity="0.35"/>'
		)
	},
	{
		id: 'face-hair',
		label: 'Long hair',
		body: face(
			'<path fill="currentColor" opacity="0.35" d="M12 36a20 20 0 0 1 40 0v8a3.5 3.5 0 0 1-7 0V33a13 13 0 0 0-26 0v11a3.5 3.5 0 0 1-7 0z"/>'
		)
	},
	{
		id: 'face-headband',
		label: 'Headband',
		body: face(
			'<path fill="currentColor" opacity="0.35" d="M17 21c1-8 7-12 15-12s14 4 15 12c-4-4-9-6-15-6s-11 2-15 6z"/>' +
				'<rect fill="currentColor" x="13" y="20" width="38" height="5" rx="2.5"/>',
			37
		)
	},
	{
		id: 'face-headset',
		label: 'Headset',
		body: face(
			'<path fill="none" stroke="currentColor" stroke-width="3.5" d="M14 34a18 18 0 0 1 36 0"/>' +
				'<rect fill="currentColor" x="9" y="31" width="8.5" height="14" rx="4.25"/>' +
				'<rect fill="currentColor" x="46.5" y="31" width="8.5" height="14" rx="4.25"/>',
			37
		)
	},
	{
		id: 'face-chef',
		label: 'Chef hat',
		body: face(
			'<path fill="currentColor" d="M20 24a6.5 6.5 0 1 1 4.5-11.5 8 8 0 0 1 15 0A6.5 6.5 0 1 1 44 24z"/>' +
				'<rect fill="currentColor" x="19" y="23" width="26" height="6" rx="2.4"/>',
			40
		)
	},
	{
		id: 'sparkle',
		label: 'Sparkle',
		body: '<path fill="currentColor" d="M32 14 C 33 26 38 31 50 32 C 38 33 33 38 32 50 C 31 38 26 33 14 32 C 26 31 31 26 32 14 Z"/>'
	},
	{
		id: 'heart',
		label: 'Heart',
		body: '<path fill="currentColor" d="M32 45 C 16 34 17 23 25 21 C 30 19.5 32 24 32 24 C 32 24 34 19.5 39 21 C 47 23 48 34 32 45 Z"/>'
	},
	{
		id: 'dumbbell',
		label: 'Dumbbell',
		body:
			'<g fill="currentColor"><rect x="22" y="29.5" width="20" height="5" rx="2.5"/>' +
			'<rect x="15" y="23" width="6" height="18" rx="3"/><rect x="43" y="23" width="6" height="18" rx="3"/>' +
			'<rect x="9" y="27" width="5" height="10" rx="2.5"/><rect x="50" y="27" width="5" height="10" rx="2.5"/></g>'
	},
	{
		id: 'gamepad',
		label: 'Gamepad',
		// The pad and the buttons are the disc showing through, which is why the cut
		// colour has to be a variable: as a literal it was right for exactly one persona.
		body:
			'<rect fill="currentColor" x="11" y="23" width="42" height="18" rx="9"/>' +
			'<g fill="var(--persona-glyph-cut)"><rect x="17" y="31" width="12" height="4" rx="1"/>' +
			'<rect x="21" y="27" width="4" height="12" rx="1"/>' +
			'<circle cx="40" cy="30" r="2.6"/><circle cx="46" cy="34" r="2.6"/></g>'
	},
	{
		id: 'pot',
		label: 'Cooking pot',
		// No steam, deliberately: the smallest this is drawn is the 24px sidebar badge,
		// where a thin curl is a grey smudge.
		body:
			'<g fill="currentColor"><circle cx="32" cy="19" r="3.5"/>' +
			'<rect x="14" y="24" width="36" height="5" rx="2.5"/>' +
			'<path d="M17 31 h30 v10 a7 7 0 0 1 -7 7 h-16 a7 7 0 0 1 -7 -7 z"/>' +
			'<rect x="8" y="32" width="8" height="4.5" rx="2.25"/>' +
			'<rect x="48" y="32" width="8" height="4.5" rx="2.25"/></g>'
	},
	{
		id: 'compass',
		label: 'Compass',
		body:
			'<circle fill="currentColor" cx="32" cy="32" r="19"/>' +
			'<path fill="var(--persona-glyph-cut)" d="M41 23 L34.5 34.5 L23 41 L29.5 29.5 Z"/>'
	},
	{
		id: 'book',
		label: 'Book',
		body:
			'<path fill="currentColor" d="M16 16 h13 a5 5 0 0 1 5 5 v27 a4 4 0 0 0 -4 -4 h-14 z"/>' +
			'<path fill="currentColor" d="M48 16 h-13 a5 5 0 0 0 -5 5 v27 a4 4 0 0 1 4 -4 h14 z"/>'
	},
	{
		id: 'code',
		label: 'Code',
		body:
			'<g fill="currentColor"><path d="M24 20 L28.5 24.5 L21 32 L28.5 39.5 L24 44 L12 32 Z"/>' +
			'<path d="M40 20 L35.5 24.5 L43 32 L35.5 39.5 L40 44 L52 32 Z"/></g>'
	}
];

const BY_ID = new Map(PERSONA_GLYPHS.map((glyph) => [glyph.id, glyph]));

/** A lookup rather than a passthrough, which is the security of it: the markup rendered into the page is always one of the strings above. A miss falls back to the initials. */
export function personaGlyph(id: string | undefined): PersonaGlyph | undefined {
	return id ? BY_ID.get(id) : undefined;
}

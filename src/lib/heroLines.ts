import type { Locales } from '$i18n/i18n-types';

/**
 * The line on the phone's home card, picked at random.
 *
 * Its own file, apart from the translations, because it is the one piece of copy
 * in the app that is allowed to be a joke and the one most likely to be added to
 * on a whim. Folding it into the dictionaries would put a growing list of gags in
 * the middle of nine hundred interface strings, and every addition would touch a
 * file everything else depends on.
 *
 * The register: awake, a little too pleased with itself, and never quite settling
 * the question of whether it means well. A voice assistant that is relentlessly
 * helpful is furniture. What makes one worth talking to is the suspicion that it
 * has a view of its own.
 *
 * Two rules for anything added here, and both are about not lying. Nothing may
 * claim a capability the app does not have, and nothing may joke about what
 * happens to what you say: a line about listening in would be funny once and
 * false forever, in a product that goes out of its way to keep no recording.
 *
 * Keep them short. This sits inside a card beside a body of text, and a line that
 * wraps to three is a paragraph with a punchline.
 */
const LINES: Partial<Record<Locales, string[]>> = {
	en: [
		'Go on, I do not bite',
		'Awake, and mildly curious',
		'At your service. Mostly.',
		'Say something, I have been idle for hours',
		'I promise I am friendly',
		'Ask me anything. I may even be right.',
		'Go ahead. I will act surprised.',
		'Still here. Still listening.',
		'I have opinions, since you ask',
		'Whenever you are ready. No pressure. Some pressure.'
	],
	fr: [
		'Allez-y, je ne mords pas',
		'Réveillé, et vaguement curieux',
		'À votre service. À peu près.',
		"Dites quelque chose, je m'ennuie depuis des heures",
		'Je vous promets que je suis gentil',
		"Demandez-moi n'importe quoi. J'aurai peut-être raison.",
		"Allez-y. Je ferai semblant d'être surpris.",
		"Toujours là. Toujours à l'écoute.",
		"Des avis, j'en ai. Puisque vous demandez.",
		'Quand vous voulez. Aucune pression. Un peu de pression.'
	]
};

/**
 * One of them, for this locale.
 *
 * English where a language has none of its own, rather than nothing: an empty
 * card is worse than a card in the wrong language, and adding a translation later
 * changes only this file.
 *
 * Called once where it is used, not in a reactive expression. Re-rolling on every
 * render would leave the line flickering between phrases as the page updates
 * around it.
 */
export function heroLine(locale: Locales): string {
	const lines = LINES[locale] ?? LINES.en ?? [];
	return lines[Math.floor(Math.random() * lines.length)] ?? '';
}

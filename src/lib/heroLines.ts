import type { Locales } from '$i18n/i18n-types';

/**
 * The line on the phone's home card, picked at random. Its own file, since
 * folding it into the dictionaries would put a growing list of gags among nine
 * hundred interface strings.
 *
 * The register: awake, a little too pleased with itself. Two rules, both about
 * not lying: nothing may claim a capability the app does not have, and nothing
 * may joke about what happens to what you say. Keep them short.
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
 * English where a language has none of its own: an empty card is worse than a
 * card in the wrong language.
 *
 * Called once where it is used, not in a reactive expression, or the line would
 * flicker between phrases as the page updates around it.
 */
export function heroLine(locale: Locales): string {
	const lines = LINES[locale] ?? LINES.en ?? [];
	return lines[Math.floor(Math.random() * lines.length)] ?? '';
}

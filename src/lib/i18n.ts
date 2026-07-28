import type { Locales } from '$i18n/i18n-types';
import { locales } from '$i18n/i18n-util';

/**
 * Native label per locale, used by the language picker.
 *
 * Adding a language is two steps and nothing else:
 *   1. create `src/i18n/<locale>/index.ts` exporting
 *      `extendDictionary(en, { …the keys you translated… })`
 *   2. add its label below
 *
 * `typesafe-i18n` picks the folder up and regenerates `locales`, so the picker
 * and the browser-language detection follow automatically. Untranslated keys
 * fall back to English, so a partial translation is always safe to ship.
 *
 * Labels for locales that aren't installed are simply ignored.
 */
const LANGUAGE_LABELS: Record<string, string> = {
	en: 'English',
	fr: 'Français',
	de: 'Deutsch',
	es: 'Español',
	ja: '日本語',
	'pt-br': 'Português (Brasil)',
	tr: 'Türkçe',
	vi: 'Tiếng Việt',
	'zh-cn': '中文 (简体)'
};

/** Installed locales as picker options, in the generated order. */
export const languageOptions: { value: Locales; label: string }[] = locales.map((locale) => ({
	value: locale,
	label: LANGUAGE_LABELS[locale] ?? locale
}));

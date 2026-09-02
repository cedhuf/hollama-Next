import type { Locales } from '$i18n/i18n-types';
import { locales } from '$i18n/i18n-util';

/**
 * Native label per locale, for the language picker.
 *
 * Adding a language is two steps: create `src/i18n/<locale>/index.ts` exporting
 * `extendDictionary(en, {...})`, and add its label below. `typesafe-i18n` picks
 * the folder up and regenerates `locales`, so the picker and the detection
 * follow. Untranslated keys fall back to English.
 *
 * Labels for locales that are not installed are ignored.
 */
export const LANGUAGE_LABELS: Record<string, string> = {
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

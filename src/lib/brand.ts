/**
 * The product name, in one place.
 *
 * A proper noun, so it does not live in the translation files: there is nothing
 * to translate, and a per-locale copy would be a second place to forget.
 *
 * Two files cannot read it: `src/app.html` and `static/manifest.webmanifest` are
 * served as-is and import nothing. `tests/ui.test.ts` covers the title one.
 */
export const APP_NAME = 'Llooma';

/** Lowercase, for cache keys, image paths and anything else machine-facing. */
export const APP_SLUG = APP_NAME.toLowerCase();

/** A phonemic transcription in the IPA, in slashes rather than brackets: the idealised pronunciation, not a narrow rendering of one accent. Not translated, since the notation is the same in every language. */
export const APP_PRONUNCIATION = '/ˈluː.mə/';

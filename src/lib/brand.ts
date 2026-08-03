/**
 * The product name, in one place.
 *
 * A proper noun, so it deliberately does not live in the translation files:
 * there is nothing to translate, and a per-locale copy would only be a second
 * place to forget. Everything the app renders reads it from here.
 *
 * Two files cannot: `src/app.html` and `static/manifest.webmanifest` are served
 * as-is and import nothing, so the name is written out there. They are the only
 * exceptions, and `tests/ui.test.ts` covers the title one.
 */
export const APP_NAME = 'Llooma';

/** Lowercase, for cache keys, image paths and anything else machine-facing. */
export const APP_SLUG = APP_NAME.toLowerCase();

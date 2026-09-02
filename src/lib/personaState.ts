import { contentDigest, personaAuthored } from '$lib/personaDigest';
import type { Persona } from '$lib/personas';

/**
 * What a persona is, relative to where it came from.
 *
 * Deduced rather than declared: nothing has to remember to set a flag, nothing
 * goes stale, and editing a persona back to what it was makes it the store's
 * persona again.
 *
 * Two comparisons: the persona now against what it said when installed (did
 * *you* change it), and that against the listing today (did the *store*).
 */
export type PersonaState =
	/** Written here. Not from anywhere, so there is nothing to say about it. */
	| 'own'
	/** Exactly as published. */
	| 'clean'
	/** Yours now: you have edited it since. */
	| 'edited'
	/** Untouched, but a newer version has been published. */
	| 'outdated'
	/** Both: you edited it and it has moved on. The one case with a real choice in it. */
	| 'edited-outdated';

/**
 * `published` is the fingerprint of the version on offer today, from a catalogue
 * row or from the persona an administrator is sharing. A digest rather than an
 * entry, so both sources answer with the same call.
 *
 * Without it, a persona with a source is still classifiable against its install
 * digest, which is what happens when the store is unreachable.
 */
export function personaState(persona: Persona, published?: string): PersonaState {
	const source = persona.source;
	if (!source?.id) return 'own';

	const now = contentDigest(personaAuthored(persona));
	const installed = source.digest;

	// Nothing recorded at install: personas from before this existed have no digest.
	// Compare against the listing and say the weaker of the two things.
	if (!installed) {
		if (!published) return 'clean';
		return now === published ? 'clean' : 'edited';
	}

	const edited = now !== installed;
	const moved = !!published && published !== installed;

	if (edited && moved) return 'edited-outdated';
	if (edited) return 'edited';
	if (moved) return 'outdated';
	return 'clean';
}

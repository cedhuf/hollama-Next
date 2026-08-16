import { contentDigest, personaAuthored } from '$lib/personaDigest';
import type { Persona } from '$lib/personas';

/**
 * What a persona is, relative to where it came from.
 *
 * Deduced rather than declared, which is the point: nothing has to remember to
 * set a flag, nothing goes stale, and editing a persona back to what it was
 * makes it the store's persona again instead of leaving a mark that lies.
 *
 * Two comparisons, three of the four combinations worth naming:
 *
 * - the persona now, against what it said when it was installed: did *you* change it
 * - what it said when installed, against the listing today: did the *store* change it
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
 * Classify one persona against what is published.
 *
 * `published` is the fingerprint of the version on offer today, wherever it comes
 * from: a catalogue row, or the persona an administrator is currently sharing.
 * A digest rather than an entry, so both sources answer the same question with
 * the same call and neither has to be dressed up as the other.
 *
 * Without it, a persona that has a source is still classifiable against its
 * install digest, which is what happens when the store is unreachable: you can
 * still be told whether you edited it.
 */
export function personaState(persona: Persona, published?: string): PersonaState {
	const source = persona.source;
	if (!source?.id) return 'own';

	const now = contentDigest(personaAuthored(persona));
	const installed = source.digest;

	// Nothing recorded at install: everything before this existed, and personas
	// installed then have no digest. Compare against the listing and say the
	// weaker of the two things rather than guessing.
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

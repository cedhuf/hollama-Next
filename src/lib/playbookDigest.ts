import { contentDigest } from './personaDigest';

/**
 * The fingerprint of what a playbook says.
 *
 * The same question the personas ask, so it uses the same hash and the same
 * rules: the field order is written here rather than taken from an object, and
 * the one function is imported by the browser and by the script that builds the
 * store's listing. See `personaDigest` for why both of those matter.
 *
 * The fields are folded into that function's shape rather than given a second
 * implementation. A playbook's name and summary sit where a persona's name and
 * tagline do, and its instructions where the system prompt does, which is
 * exactly what they are: the authored text. What matters is only that the same
 * playbook always produces the same string.
 *
 * The index generator repeats this three-line mapping rather than importing it,
 * for a dull reason: a script Node runs directly needs a `.ts` on its imports,
 * and a module the browser also loads must not have one. The hash itself, which
 * is the part that would actually hurt if it diverged, is imported by both.
 */
export interface AuthoredPlaybook {
	name: string;
	summary?: string;
	instructions: string;
	color?: string;
	glyph?: string;
	tags?: string[];
}

export function playbookDigest(playbook: AuthoredPlaybook): string {
	return contentDigest({
		name: playbook.name,
		tagline: playbook.summary,
		avatar: { color: playbook.color, glyph: playbook.glyph },
		systemPrompt: playbook.instructions,
		tags: playbook.tags
	});
}

/** The authored fields of a bundle, whatever else it carries. */
export function bundlePlaybookAuthored(bundle: { playbook: AuthoredPlaybook }): AuthoredPlaybook {
	const { name, summary, instructions, color, glyph, tags } = bundle.playbook;
	return { name, summary, instructions, color, glyph, tags };
}

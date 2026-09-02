import { contentDigest } from './personaDigest';

/**
 * The fingerprint of what a playbook says. The same question the personas ask,
 * so it uses the same hash and the same rules; see `personaDigest`.
 *
 * The fields are folded into that function's shape rather than given a second
 * implementation. The index generator repeats the three-line mapping rather than
 * importing it, because a script Node runs directly needs a `.ts` on its imports
 * and a module the browser loads must not have one.
 */
export interface AuthoredPlaybook {
	name: string;
	summary?: string;
	instructions: string;
	tags?: string[];
}

export function playbookDigest(playbook: AuthoredPlaybook): string {
	return contentDigest({
		name: playbook.name,
		tagline: playbook.summary,
		// A playbook has no avatar. The slot stays because the shared hash walks a fixed
		// list of fields.
		avatar: {},
		systemPrompt: playbook.instructions,
		tags: playbook.tags
	});
}

/** The authored fields of a bundle, whatever else it carries. */
export function bundlePlaybookAuthored(bundle: { playbook: AuthoredPlaybook }): AuthoredPlaybook {
	const { name, summary, instructions, tags } = bundle.playbook;
	return { name, summary, instructions, tags };
}

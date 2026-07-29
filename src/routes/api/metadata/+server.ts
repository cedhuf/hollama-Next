import { json } from '@sveltejs/kit';

import { version } from '$app/environment';

/**
 * What the running server is, as opposed to what the loaded tab was built from.
 * The two drift apart when an instance is updated under an open tab.
 */
export interface HollamaNextMetadata {
	currentVersion: string;
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	return json({ currentVersion: version } as HollamaNextMetadata);
}

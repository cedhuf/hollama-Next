import { env as publicEnv } from '$env/dynamic/public';

import type { LayoutServerLoad } from './$types';

/** Expose the signed-in user (server mode) to the client for UI gating. */
export const load: LayoutServerLoad = async ({ locals }) => {
	const session = publicEnv.PUBLIC_MODE === 'server' ? await locals.auth() : null;
	return { user: session?.user ?? null };
};

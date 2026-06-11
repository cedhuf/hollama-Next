import type { Handle } from '@sveltejs/kit';

import { env as publicEnv } from '$env/dynamic/public';

/**
 * In `server` mode, Auth.js guards the app; in `local` mode the handle is a
 * pass-through (no auth, no DB). The Auth.js config is only constructed when
 * needed so local deployments never load it.
 */
const passthrough: Handle = ({ event, resolve }) => resolve(event);

async function resolveHandle(): Promise<Handle> {
	if (publicEnv.PUBLIC_MODE !== 'server') return passthrough;
	const { createAuthHandle } = await import('$lib/server/auth');
	return createAuthHandle();
}

const handlePromise = resolveHandle();

export const handle: Handle = async (input) => (await handlePromise)(input);

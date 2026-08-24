import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { env as publicEnv } from '$env/dynamic/public';

/**
 * In `server` mode, Auth.js guards the app; in `local` mode the handle is a
 * pass-through (no auth, no DB). The Auth.js config is only constructed when
 * needed so local deployments never load it.
 *
 * A server instance that configures no way to sign in is a pass-through too, and
 * for the same reason: there are no credentials to check, so there is nothing
 * for Auth.js to do. It still has its database, its encrypted keys and its owner
 * (see `$lib/server/session`); it just never asks who is knocking.
 */
const passthrough: Handle = ({ event, resolve }) => resolve(event);

/**
 * Redirect unauthenticated visitors to /login. API and auth routes handle their
 * own responses (401/redirects), so they're left alone.
 */
const guard: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isExempt =
		pathname === '/login' || pathname.startsWith('/auth') || pathname.startsWith('/api');

	if (!isExempt) {
		const { sessionUser } = await import('$lib/server/session');
		if (!(await sessionUser(event))) {
			const redirectTo = encodeURIComponent(pathname + event.url.search);
			throw redirect(303, `/login?redirectTo=${redirectTo}`);
		}
	}
	return resolve(event);
};

async function resolveHandle(): Promise<Handle> {
	if (publicEnv.PUBLIC_MODE !== 'server') return passthrough;

	const { accountsEnabled } = await import('$lib/server/authMode');
	if (!accountsEnabled()) return passthrough;

	const { createAuthHandle } = await import('$lib/server/auth');
	return sequence(createAuthHandle(), guard);
}

const handlePromise = resolveHandle();

export const handle: Handle = async (input) => (await handlePromise)(input);

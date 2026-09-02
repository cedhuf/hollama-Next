import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

/**
 * Auth.js guards an instance that has accounts. One that configures no way to
 * sign in gets a pass-through: there are no credentials to check, and its config
 * is never even constructed.
 *
 * Such an instance still has its database, its encrypted keys and its owner (see
 * `$lib/server/session`); it just never asks who is knocking.
 */
const passthrough: Handle = ({ event, resolve }) => resolve(event);

/** API and auth routes handle their own responses, so they are left alone. */
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

/** Here rather than at import time, because this module is loaded during the build too, and a build has no business polling somebody's chat server. The first request is the earliest moment the instance is certainly running. */
const bootIntegrations: Handle = async ({ event, resolve }) => {
	const { ensureIntegrationsStarted } = await import('$lib/server/integrations/supervisor');
	ensureIntegrationsStarted();
	return resolve(event);
};

async function resolveHandle(): Promise<Handle> {
	const { accountsEnabled } = await import('$lib/server/authMode');
	if (!accountsEnabled()) return sequence(bootIntegrations, passthrough);

	const { createAuthHandle } = await import('$lib/server/auth');
	return sequence(bootIntegrations, createAuthHandle(), guard);
}

const handlePromise = resolveHandle();

export const handle: Handle = async (input) => (await handlePromise)(input);

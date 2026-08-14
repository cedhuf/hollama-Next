import { redirect } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const load = async ({ url, locals }) => {
	// Login only exists in server mode.
	if (publicEnv.PUBLIC_MODE !== 'server') throw redirect(303, '/');

	const redirectTo = url.searchParams.get('redirectTo') || '/';

	// Already signed in → go straight to the target. Asked of the database, like
	// the guard that sent us here: a session whose user is gone has to read as
	// signed out on both sides, or the two bounce the browser between them.
	const { sessionUser } = await import('$lib/server/session');
	if (await sessionUser({ locals })) throw redirect(303, redirectTo);

	const credentials = privateEnv.AUTH_CREDENTIALS === 'true';
	const oidc = privateEnv.OIDC_ISSUER?.trim()
		? { name: privateEnv.OIDC_NAME?.trim() || 'SSO' }
		: null;
	const error = url.searchParams.get('error');

	return {
		credentials,
		oidc,
		error,
		redirectTo,
		// Transparent SSO: when OIDC is the only method, jump straight to the IdP
		// (unless we're showing an error, to avoid a redirect loop).
		autoRedirect: !!oidc && !credentials && !error && privateEnv.OIDC_AUTO_REDIRECT === 'true'
	};
};

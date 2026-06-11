import { redirect } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const load = async ({ url, locals }) => {
	// Login only exists in server mode.
	if (publicEnv.PUBLIC_MODE !== 'server') throw redirect(303, '/');

	const redirectTo = url.searchParams.get('redirectTo') || '/';

	// Already signed in → go straight to the target.
	const session = await locals.auth();
	if (session) throw redirect(303, redirectTo);

	return {
		credentials: privateEnv.AUTH_CREDENTIALS === 'true',
		oidc: privateEnv.OIDC_ISSUER?.trim() ? { name: privateEnv.OIDC_NAME?.trim() || 'SSO' } : null,
		error: url.searchParams.get('error'),
		redirectTo
	};
};

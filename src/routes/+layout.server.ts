import { env as publicEnv } from '$env/dynamic/public';
import { getConfig, themeSharing } from '$lib/server/db/config';
import { adminContact } from '$lib/server/db/users';

import type { LayoutServerLoad } from './$types';

/**
 * What the page needs before it draws, rather than after.
 *
 * The signed-in user, for gating, and the two instance-wide decisions that
 * cannot wait for a round trip: the theme, which would otherwise flash the
 * wrong one, and the onboarding epoch, which decides whether the tour is due.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const isServer = publicEnv.PUBLIC_MODE === 'server';
	const session = isServer ? await locals.auth() : null;

	return {
		user: session?.user ?? null,
		instance: isServer
			? {
					themeSharing: themeSharing(),
					themeMode: getConfig('themeMode') ?? 'system',
					themeStyle: getConfig('themeStyle') ?? 'classic',
					/**
					 * When an administrator last decided everyone should see the tour again.
					 *
					 * A stamp rather than a flag they would have to unset afterwards: each
					 * person's settings remember the stamp they acknowledged, so a newer one
					 * shows the tour once and then stops, for everybody, without the server
					 * tracking who has seen what.
					 */
					onboardingEpoch: Number(getConfig('onboardingEpoch') ?? 0),
					/**
					 * Who to ask when the instance refuses something.
					 *
					 * A limit reached and a model nobody priced are both somebody else's
					 * decision to change, and "contact your administrator" without an
					 * address is advice nobody can act on. The instance knows the address;
					 * it is the account it was bootstrapped with.
					 */
					adminEmail: adminContact()
				}
			: null
	};
};

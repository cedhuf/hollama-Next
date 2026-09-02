import { accountsEnabled } from '$lib/server/authMode';
import { allowUserKeys, getConfig, themeSharing } from '$lib/server/db/config';
import { adminContact } from '$lib/server/db/users';
import { implicitOwner } from '$lib/server/session';

import type { LayoutServerLoad } from './$types';

/** The signed-in user, and the two instance-wide decisions that cannot wait for a round trip: the theme, which would flash the wrong one, and the onboarding epoch. */
export const load: LayoutServerLoad = async ({ locals }) => {
	const accounts = accountsEnabled();
	const session = accounts ? await locals.auth() : null;

	/** With no accounts there is nobody to sign in, but the page still needs a user to be: this is where the owner is created on first run. */
	const owner = accounts ? null : implicitOwner();

	return {
		user: owner ? { id: owner.id, email: '', role: owner.role } : (session?.user ?? null),
		instance: {
			/** Whether anyone signs in here, which decides what the account UI offers. */
			accounts,
			themeSharing: themeSharing(),
			themeMode: getConfig('themeMode') ?? 'system',
			themeStyle: getConfig('themeStyle') ?? 'classic',
			/** A stamp rather than a flag to unset: each person's settings remember the one they acknowledged, so a newer stamp shows the tour once for everybody without tracking who has seen what. */
			onboardingEpoch: Number(getConfig('onboardingEpoch') ?? 0),
			/** A limit reached and an unpriced model are both somebody else's decision to change, and "contact your administrator" without an address is advice nobody can act on. */
			adminEmail: accounts ? adminContact() : null,
			/** Delivered with the page because the welcome tour decides whether to offer that step before it draws: asking `/api/providers` would settle it a frame after the tour was composed. */
			allowUserKeys: allowUserKeys()
		}
	};
};

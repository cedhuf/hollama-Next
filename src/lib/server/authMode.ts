import { env } from '$env/dynamic/private';

/**
 * Whether this instance has accounts at all.
 *
 * Read from the sign-in methods rather than a switch of its own, because the two
 * can disagree and both ways are bad: "accounts on" with no provider is an
 * instance nobody can enter, "accounts off" with an identity provider is one
 * anybody can.
 *
 * Configure a way in and the instance has accounts; configure none and it
 * belongs to whoever opens it.
 */
export function accountsEnabled(): boolean {
	return env.AUTH_CREDENTIALS === 'true' || !!env.OIDC_ISSUER?.trim();
}

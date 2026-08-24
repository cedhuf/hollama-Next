import { env } from '$env/dynamic/private';

/**
 * Whether this instance has accounts at all.
 *
 * Read from the sign-in methods rather than from a switch of its own, because a
 * switch and the configuration can disagree, and both ways of disagreeing are
 * bad: "accounts on" with no provider is an instance nobody can enter, and
 * "accounts off" with an identity provider configured is one anybody can. There
 * is nothing to keep in step here. Configure a way in and the instance has
 * accounts; configure none and it belongs to whoever opens it.
 *
 * That also makes the two deployments people actually run come out right without
 * being told: a shared instance already sets AUTH_CREDENTIALS or OIDC_ISSUER and
 * keeps its login, and a personal one that sets nothing at all comes up usable
 * instead of showing a login page with no way past it.
 */
export function accountsEnabled(): boolean {
	return env.AUTH_CREDENTIALS === 'true' || !!env.OIDC_ISSUER?.trim();
}

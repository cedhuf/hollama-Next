import { SvelteKitAuth, type SvelteKitAuthConfig } from '@auth/sveltekit';
import type { Provider } from '@auth/sveltekit/providers';
import Credentials from '@auth/sveltekit/providers/credentials';

import { env } from '$env/dynamic/private';
import {
	countUsers,
	createUser,
	getUserByEmail,
	setUserRole,
	type Role,
	type UserRow
} from '$lib/server/db/users';

import { hashPassword, verifyPassword } from './password';

/** Derive the role from an OIDC claim (group/scope), defaulting to `user`. */
function roleFromClaim(profile: Record<string, unknown> | undefined | null): Role {
	const claim = env.OIDC_ROLE_CLAIM?.trim();
	const adminValue = env.OIDC_ADMIN_VALUE?.trim();
	if (!claim || !adminValue || !profile) return 'user';

	const raw = profile[claim];
	const values = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
	return values.includes(adminValue) ? 'admin' : 'user';
}

/**
 * Find-or-create the local user backing an OIDC login. The IdP is the gate:
 * when auto-provisioning is on (default) a new user is created on first login;
 * otherwise an unknown subject is rejected. Role follows the claim.
 */
function provisionOidcUser(profile: Record<string, unknown> | null | undefined): UserRow | null {
	const email = String(profile?.email ?? '')
		.trim()
		.toLowerCase();
	if (!email) return null;

	const role = roleFromClaim(profile);
	const existing = getUserByEmail(email);

	if (!existing) {
		if (env.OIDC_AUTO_PROVISION === 'false') return null;
		return createUser({
			email,
			role,
			passwordHash: null,
			profile: {
				firstName: profile?.given_name ?? '',
				lastName: profile?.family_name ?? ''
			}
		});
	}

	if (existing.role !== role) {
		setUserRole(existing.id, role);
		return { ...existing, role };
	}
	return existing;
}

/** Create the admin from env on a fresh install (no users yet). Fire-and-forget. */
function bootstrapAdmin(): void {
	const email = env.ADMIN_EMAIL?.trim().toLowerCase();
	if (!email || countUsers() > 0) return;

	void (async () => {
		if (countUsers() > 0 || getUserByEmail(email)) return;
		const passwordHash = env.ADMIN_PASSWORD ? await hashPassword(env.ADMIN_PASSWORD) : null;
		createUser({ email, role: 'admin', passwordHash });
	})();
}

function buildProviders(): Provider[] {
	const providers: Provider[] = [];

	if (env.AUTH_CREDENTIALS === 'true') {
		providers.push(
			Credentials({
				credentials: { email: {}, password: {} },
				async authorize(credentials) {
					const email = String(credentials?.email ?? '')
						.trim()
						.toLowerCase();
					const password = String(credentials?.password ?? '');
					if (!email || !password) return null;

					const user = getUserByEmail(email);
					if (!user?.password_hash) return null;
					if (!(await verifyPassword(password, user.password_hash))) return null;

					return { id: user.id, email: user.email, role: user.role };
				}
			})
		);
	}

	if (env.OIDC_ISSUER?.trim()) {
		providers.push({
			id: 'oidc',
			name: env.OIDC_NAME?.trim() || 'SSO',
			type: 'oidc',
			issuer: env.OIDC_ISSUER,
			clientId: env.OIDC_CLIENT_ID,
			clientSecret: env.OIDC_CLIENT_SECRET
		} as Provider);
	}

	return providers;
}

const config: SvelteKitAuthConfig = {
	trustHost: true,
	session: { strategy: 'jwt' },
	pages: { signIn: '/login', error: '/login' },
	providers: buildProviders(),
	callbacks: {
		// Gate OIDC sign-ins when provisioning is disabled and the user is unknown.
		signIn({ account, profile }) {
			if (account?.provider !== 'oidc') return true;
			const email = String(profile?.email ?? '')
				.trim()
				.toLowerCase();
			if (!email) return false;
			return getUserByEmail(email) != null || env.OIDC_AUTO_PROVISION !== 'false';
		},
		jwt({ token, user, account, profile }) {
			if (account?.provider === 'oidc') {
				const dbUser = provisionOidcUser(profile);
				if (dbUser) {
					token.userId = dbUser.id;
					token.role = dbUser.role;
					token.email = dbUser.email;
				}
			} else if (user) {
				token.userId = user.id;
				token.role = user.role;
				token.email = user.email ?? undefined;
			}
			return token;
		},
		session({ session, token }) {
			// token carries custom keys set in the jwt callback (untyped JWT bag).
			if (token.userId) {
				session.user.id = token.userId as string;
				session.user.role = (token.role as 'admin' | 'user') ?? 'user';
				if (token.email) session.user.email = token.email as string;
			}
			return session;
		}
	}
};

/** Build the Auth.js request handle. Only called in `server` mode. */
export function createAuthHandle() {
	bootstrapAdmin();
	return SvelteKitAuth(config).handle;
}

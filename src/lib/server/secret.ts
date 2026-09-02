import { randomBytes } from 'node:crypto';

import { env } from '$env/dynamic/private';

import { getConfig, setConfig } from './db/config';

const CONFIG_KEY = 'instanceSecret';

/**
 * The secret this instance signs sessions and encrypts provider keys with.
 *
 * An instance nobody configured still has API keys to protect, so it makes one
 * for itself: 32 random bytes on first use, kept in the database. The only
 * alternative to a secret is storing the keys in plaintext.
 *
 * A stored secret wins over the environment once it exists. Setting AUTH_SECRET
 * later on an instance that had already encrypted keys would otherwise turn
 * every one of them into an undecryptable blob.
 */
export function instanceSecret(): string {
	const stored = getConfig(CONFIG_KEY)?.trim();
	if (stored) return stored;

	const configured = env.AUTH_SECRET?.trim() || env.DATA_ENCRYPTION_KEY?.trim();
	if (configured) return configured;

	const generated = randomBytes(32).toString('base64');
	setConfig(CONFIG_KEY, generated);
	return generated;
}

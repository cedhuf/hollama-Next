import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '$env/dynamic/private';

/**
 * Server-side encryption for provider API keys, so they're never stored in
 * plaintext and never leave the server. AES-256-GCM with a key derived from
 * `AUTH_SECRET` (the same secret Auth.js uses). Format: `iv.tag.ciphertext`,
 * all base64.
 */
function encryptionKey(): Buffer {
	const secret = env.AUTH_SECRET?.trim() || env.DATA_ENCRYPTION_KEY?.trim();
	if (!secret) {
		throw new Error('AUTH_SECRET (or DATA_ENCRYPTION_KEY) is required to encrypt provider keys');
	}
	return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
	const [ivB64, tagB64, dataB64] = payload.split('.');
	if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');

	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	return Buffer.concat([
		decipher.update(Buffer.from(dataB64, 'base64')),
		decipher.final()
	]).toString('utf8');
}

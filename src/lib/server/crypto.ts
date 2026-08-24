import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { instanceSecret } from './secret';

/**
 * Server-side encryption for provider API keys, so they're never stored in
 * plaintext and never leave the server. AES-256-GCM with a key derived from the
 * instance secret (the same one Auth.js signs with). Format: `iv.tag.ciphertext`,
 * all base64.
 *
 * Encryption is not conditional on there being accounts to sign into: an
 * instance with a single implicit owner holds exactly the same provider keys as
 * a shared one, so it gets exactly the same treatment.
 */
function encryptionKey(): Buffer {
	return createHash('sha256').update(instanceSecret()).digest();
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

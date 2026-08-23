import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Password hashing with `scrypt` from `node:crypto`: no native dependency,
 * no build step (works in Alpine/Nix). Format: `scrypt$<salt>$<hash>`, base64.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
	return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, saltB64, hashB64] = stored.split('$');
	if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;

	const expected = Buffer.from(hashB64, 'base64');
	const derived = (await scryptAsync(
		password,
		Buffer.from(saltB64, 'base64'),
		expected.length
	)) as Buffer;
	return expected.length === derived.length && timingSafeEqual(expected, derived);
}

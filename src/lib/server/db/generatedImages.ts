import type { GeneratedImage } from '$lib/generatedImages';

import { getDb } from './index';

/**
 * The gallery's index. Every function takes the account, and none of them offers
 * a way to reach a row without one: an id is not a permission, and a gallery is
 * about as personal as this app gets.
 */

export function listImages(userId: string): GeneratedImage[] {
	const rows = getDb()
		.prepare('SELECT data FROM generated_images WHERE user_id = ? ORDER BY created_at DESC')
		.all(userId) as { data: string }[];
	return rows.map((row) => JSON.parse(row.data) as GeneratedImage);
}

/** One image, or nothing when it does not exist or is not theirs. Same answer either way. */
export function getImage(userId: string, id: string): GeneratedImage | null {
	const row = getDb()
		.prepare('SELECT data FROM generated_images WHERE id = ? AND user_id = ?')
		.get(id, userId) as { data: string } | undefined;
	return row ? (JSON.parse(row.data) as GeneratedImage) : null;
}

export function insertImage(userId: string, image: GeneratedImage): void {
	getDb()
		.prepare(
			`INSERT INTO generated_images (id, user_id, data, bytes, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.run(image.id, userId, JSON.stringify(image), image.bytes, image.createdAt);
}

/** Delete one row, scoped to its owner. Says whether there was one to delete. */
export function deleteImage(userId: string, id: string): boolean {
	const result = getDb()
		.prepare('DELETE FROM generated_images WHERE id = ? AND user_id = ?')
		.run(id, userId);
	return Number(result.changes) > 0;
}

/**
 * What this account is holding, in bytes.
 *
 * Summed from the column rather than from the rows, so the answer costs the same
 * whether somebody has ten images or ten thousand. Asked before a generation,
 * never during one.
 */
export function bytesHeld(userId: string): number {
	const row = getDb()
		.prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM generated_images WHERE user_id = ?')
		.get(userId) as { total: number };
	return row.total;
}

import type { Message } from '$lib/sessions';

/**
 * Conversations written before notes were one field. `compaction` and `cleared`
 * are one `note` now, with the kind inside it (see `chat/notes`), so stored
 * conversations are converted: by a migration, by the browser on first read, and
 * on the way in from a backup.
 *
 * TODO: the storage conversions can go a few versions after this shipped. The
 * backup path stays, since an exported file does not age out.
 */

interface LegacyMessage extends Message {
	compaction?: { generatedAt: string; replacedCount: number; model?: string; automatic?: boolean };
	cleared?: { generatedAt: string; replacedCount: number };
}

/** A message that already has a `note` is left alone: the new field is the truth, and a stale legacy field beside it is a leftover rather than a second opinion. */
function adopt(message: LegacyMessage): boolean {
	const legacy = message.compaction ?? message.cleared;
	if (!legacy) return false;

	if (!message.note) {
		message.note = message.compaction
			? { kind: 'compaction', ...message.compaction }
			: { kind: 'cleared', ...message.cleared! };
	}
	delete message.compaction;
	delete message.cleared;
	return true;
}

/** Convert every message of every conversation in place. Returns what changed. */
export function adoptLegacyNotes(sessions: { messages?: Message[] }[]): number {
	let converted = 0;
	for (const session of sessions) {
		for (const message of session.messages ?? []) {
			if (adopt(message as LegacyMessage)) converted++;
		}
	}
	return converted;
}

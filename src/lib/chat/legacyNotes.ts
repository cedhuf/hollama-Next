import type { Message } from '$lib/sessions';

/**
 * Conversations written before notes were one field.
 *
 * `compaction` and `cleared` used to be two fields on a message, each carrying
 * its own payload and each meaning "the model does not read this the usual way".
 * They are one `note` now, with the kind inside it (see `chat/notes`), which is
 * what lets a kind be added without editing the context builder, the search, the
 * SQL and the renderer.
 *
 * Stored conversations still have the old shape, so they are converted: once on
 * the server by a migration, once in the browser when local storage is first
 * read, and on the way in from any backup file.
 *
 * TODO (note migration): the storage conversions can go a few versions after
 * this shipped, at which point this file goes with them. The exception is the
 * backup path: an exported file does not age out, so if anything survives here
 * it is the import conversion, moved next to the importer.
 */

interface LegacyMessage extends Message {
	compaction?: { generatedAt: string; replacedCount: number; model?: string; automatic?: boolean };
	cleared?: { generatedAt: string; replacedCount: number };
}

/**
 * Convert one message in place, and say whether it had anything to convert.
 *
 * A message that already has a `note` is left alone, whatever else it carries:
 * the new field is the truth, and a stale legacy field beside it is a leftover
 * rather than a second opinion.
 */
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

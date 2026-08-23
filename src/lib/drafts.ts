import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';

/**
 * What was typed and not sent, kept where it was typed.
 *
 * A message only becomes yours once it is sent, and until then it lives in a
 * textarea and nowhere else. A reload, a crash, a tab closed by mistake and it
 * is gone, which is the same loss as a sent message vanishing except that
 * nothing about it looks like a failure.
 *
 * Local storage in both modes, deliberately. A draft belongs to the machine it
 * was typed on: nobody expects the half-written sentence from their desk to turn
 * up on their phone, and writing it to the server would mean a request while
 * somebody is still choosing their words.
 *
 * **Text only, never attachments.** A pasted image is measured in megabytes and
 * the whole of local storage is measured in five, so a draft that carried one
 * would evict the conversations it was meant to protect. Whoever draws the
 * composer has to say so rather than let it be discovered.
 */
const DRAFT_PREFIX = `${LOCAL_STORAGE_PREFIX}-draft:`;

/** One draft per place text is composed: a conversation, or the image page. */
export type DraftKey = string;

export const sessionDraft = (sessionId: string): DraftKey => `session:${sessionId}`;
export const IMAGE_DRAFT: DraftKey = 'images';

/** Longer than any composer should hold, short enough never to threaten the quota. */
const MAX_DRAFT = 20_000;

export function readDraft(key: DraftKey): string {
	if (!browser) return '';
	try {
		return localStorage.getItem(DRAFT_PREFIX + key) ?? '';
	} catch {
		return '';
	}
}

/**
 * Written straight through, without debouncing.
 *
 * A composer's value changes on a keystroke, and a keystroke is nowhere near the
 * cost of one small `setItem`. Debouncing would only add a window in which the
 * last few words are still not saved, which is the entire failure this exists to
 * prevent.
 */
export function writeDraft(key: DraftKey, value: string): void {
	if (!browser) return;
	const text = value.slice(0, MAX_DRAFT);
	try {
		// An empty draft is a deletion. Storing it would leave a row per conversation
		// ever opened, and reading it back would be reading nothing.
		if (text.trim()) localStorage.setItem(DRAFT_PREFIX + key, text);
		else localStorage.removeItem(DRAFT_PREFIX + key);
	} catch {
		// A full quota costs a draft, never the send. There is nothing useful to say
		// here: the text is still on screen, which is where it was a moment ago.
	}
}

export function clearDraft(key: DraftKey): void {
	writeDraft(key, '');
}

/**
 * Drafts for conversations that no longer exist.
 *
 * Deleting a conversation elsewhere leaves its draft behind, and nothing would
 * ever read it again. Swept on demand rather than watched, because the cost of a
 * stray key is a few bytes and the cost of watching is a subscription.
 */
export function pruneDrafts(liveSessionIds: string[]): void {
	if (!browser) return;
	const keep = new Set(liveSessionIds.map((id) => DRAFT_PREFIX + sessionDraft(id)));
	try {
		for (const key of Object.keys(localStorage)) {
			if (!key.startsWith(DRAFT_PREFIX + 'session:')) continue;
			if (!keep.has(key)) localStorage.removeItem(key);
		}
	} catch {
		// Housekeeping, so a failure changes nothing that matters.
	}
}

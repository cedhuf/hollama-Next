import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';

/**
 * What was typed and not sent, kept where it was typed.
 *
 * Local storage in both modes: a draft belongs to the machine it was typed on,
 * and writing it to the server would mean a request mid-sentence.
 *
 * **Text only, never attachments.** A pasted image is megabytes and the whole of
 * local storage is five, so a draft carrying one would evict the conversations.
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

/** A composer's value changes on a keystroke, which is nowhere near the cost of one small `setItem`. Debouncing would only add a window in which the last few words are not saved. */
export function writeDraft(key: DraftKey, value: string): void {
	if (!browser) return;
	const text = value.slice(0, MAX_DRAFT);
	try {
		// An empty draft is a deletion: storing it would leave a row per conversation
		// ever opened.
		if (text.trim()) localStorage.setItem(DRAFT_PREFIX + key, text);
		else localStorage.removeItem(DRAFT_PREFIX + key);
	} catch {
		// A full quota costs a draft, never the send, and there is nothing useful to
		// say: the text is still on screen.
	}
}

export function clearDraft(key: DraftKey): void {
	writeDraft(key, '');
}

/** Deleting a conversation elsewhere leaves its draft behind. Swept on demand rather than watched: a stray key costs a few bytes, and watching costs a subscription. */
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

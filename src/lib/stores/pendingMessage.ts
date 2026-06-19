import { writable } from 'svelte/store';

import type { Attachment } from '$lib/promptAttachments';

/** A message composed on the home page, handed off to the new session page. */
export interface PendingMessage {
	prompt: string;
	model?: string;
	webSearch: boolean;
	attachments: Attachment[];
	/**
	 * Composer tool switches carried over from the home page. Optional so older
	 * hand-offs (and code paths that don't set them) fall back to session defaults.
	 */
	thinking?: boolean;
	interactiveChoices?: boolean;
	sendCurrentDate?: boolean;
}

export const pendingMessage = writable<PendingMessage | null>(null);

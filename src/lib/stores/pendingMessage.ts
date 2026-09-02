import { writable } from 'svelte/store';

import type { Attachment } from '$lib/promptAttachments';

/** A message composed on the home page, handed off to the new session page. */
export interface PendingMessage {
	prompt: string;
	model?: string;
	webSearch: boolean;
	webFetch: boolean;
	attachments: Attachment[];
	/** Carried over from the home page. Optional, so older hand-offs fall back to the session defaults. */
	thinking?: boolean;
	interactiveChoices?: boolean;
	sendCurrentDate?: boolean;
	mcp?: boolean;
}

export const pendingMessage = writable<PendingMessage | null>(null);

import { writable } from 'svelte/store';

import type { Attachment } from '$lib/promptAttachments';

/** A message composed on the home page, handed off to the new session page. */
export interface PendingMessage {
	prompt: string;
	model?: string;
	webSearch: boolean;
	attachments: Attachment[];
}

export const pendingMessage = writable<PendingMessage | null>(null);

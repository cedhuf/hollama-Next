import type { Knowledge } from '$lib/knowledge';
import type { Message } from '$lib/sessions';

/**
 * Context attached to the next message.
 *
 * Every kind carries an `id` under the same name, so the composer can key,
 * render and remove them without asking what they are first. New kinds (a PDF,
 * a document) are meant to be added here and picked up by the pill row as they
 * are, rather than growing another branch in the composer.
 */
export type KnowledgeAttachment = {
	type: 'knowledge';
	id: string;
	knowledge: Knowledge;
};

export type ImageAttachment = {
	type: 'image';
	id: string;
	name: string;
	dataUrl: string;
};

export type Attachment = KnowledgeAttachment | ImageAttachment;

/** What the pill shows: the same handle for every kind. */
export function attachmentLabel(attachment: Attachment): string {
	return attachment.type === 'knowledge' ? attachment.knowledge.name : attachment.name;
}

/** The chat-request image payload (base64 without the data-URL prefix). */
export function imagesPayload(attachments: Attachment[]): { filename: string; data: string }[] {
	return attachments
		.filter((a): a is ImageAttachment => a.type === 'image')
		.map((a) => ({
			filename: a.name,
			data: a.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
		}));
}

/** A user message that injects a knowledge item as context. */
export function knowledgeContextMessage(knowledge: Knowledge): Message {
	return {
		role: 'user',
		knowledge,
		content: `
<CONTEXT>
	<CONTEXT_NAME>${knowledge.name}</CONTEXT_NAME>
	<CONTEXT_CONTENT>${knowledge.content}</CONTEXT_CONTENT>
</CONTEXT>
`
	};
}

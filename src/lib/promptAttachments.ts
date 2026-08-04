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

/**
 * A file read into Markdown in the browser. The file itself is never kept: what
 * is attached is the text it turned out to hold, which is also all that is ever
 * sent.
 */
export type DocumentAttachment = {
	type: 'document';
	id: string;
	name: string;
	markdown: string;
	tokens: number;
	pages?: number;
};

export type Attachment = KnowledgeAttachment | ImageAttachment | DocumentAttachment;

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

/**
 * The messages that carry attached context, in the order they were attached.
 *
 * One place rather than one per composer: the home screen and a conversation
 * both attach the same things, and they used to each know how to unpack them,
 * which meant a new kind had to be added to both to work in both.
 *
 * Images are not here: they ride on the message itself rather than as messages
 * of their own, because that is how every provider takes them.
 */
export function contextMessages(attachments: Attachment[]): Message[] {
	return attachments.flatMap((attachment) => {
		if (attachment.type === 'knowledge') return [knowledgeContextMessage(attachment.knowledge)];
		if (attachment.type === 'document') return [documentContextMessage(attachment)];
		return [];
	});
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

/**
 * A user message carrying an attached document.
 *
 * The same envelope knowledge uses, so a model that has learned to read one has
 * learned to read the other, and so the two look alike in an exported
 * conversation. The file name goes in because "the document" is how people refer
 * to it, and the model needs to know which name that maps to.
 */
export function documentContextMessage(document: DocumentAttachment): Message {
	return {
		role: 'user',
		document: { name: document.name, pages: document.pages },
		content: `
<CONTEXT>
	<CONTEXT_NAME>${document.name}</CONTEXT_NAME>
	<CONTEXT_CONTENT>${document.markdown}</CONTEXT_CONTENT>
</CONTEXT>
`
	};
}

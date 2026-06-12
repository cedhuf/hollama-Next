import type { Knowledge } from '$lib/knowledge';
import type { Message } from '$lib/sessions';

export type KnowledgeAttachment = {
	type: 'knowledge';
	fieldId: string;
	knowledge?: Knowledge;
};

export type ImageAttachment = {
	type: 'image';
	id: string;
	name: string;
	dataUrl: string;
};

export type Attachment = KnowledgeAttachment | ImageAttachment;

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

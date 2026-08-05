import { repository } from '$lib/data';
import { resolveSessionTitle, type Message, type Session } from '$lib/sessions';

export type ExportFormat = 'json' | 'markdown';

/** The raw message array — the shape the app stores, for re-import or tooling. */
export function sessionToJson(session: Session): string {
	return JSON.stringify(session.messages, null, 2);
}

function speaker(message: Message, assistantLabel?: string): string {
	if (message.role === 'user') return 'You';
	if (message.role === 'system') return 'System';
	return assistantLabel || 'Assistant';
}

/**
 * A readable transcript: one heading per turn, with the extras that carry meaning
 * on their own (attachments, sources, reasoning) kept but folded out of the way.
 */
export function sessionToMarkdown(session: Session, assistantLabel?: string): string {
	const parts: string[] = [];

	const title = resolveSessionTitle(session);
	parts.push(`# ${title || `Session #${session.id}`}`);
	if (session.updatedAt) parts.push(`_${new Date(session.updatedAt).toLocaleString()}_`);

	for (const message of session.messages) {
		// A knowledge attachment is a document, not a turn — name it rather than
		// dumping its full body into the transcript.
		if (message.knowledge) {
			parts.push(`## ${speaker(message, assistantLabel)}`, `📎 **${message.knowledge.name}**`);
			continue;
		}

		parts.push(`## ${speaker(message, assistantLabel)}`);

		for (const image of message.images ?? []) {
			parts.push(`🖼️ _${image.filename}_`);
		}

		// Earlier rounds first, so the transcript reads in the order it happened.
		for (const step of message.reasoningTrace ?? []) {
			if (step.type === 'search') {
				parts.push(`🌐 _Searched: ${step.query} — ${step.resultCount ?? 0} results_`);
			} else if (step.type === 'read') {
				parts.push(
					step.pages?.length
						? `🌐 _Read: ${step.pages.map((p) => `[${p.title || p.url}](${p.url})`).join(', ')}_`
						: '🌐 _Pages could not be read_'
				);
			} else if (step.content?.trim()) {
				parts.push(
					[
						'<details>',
						'<summary>Reasoning</summary>',
						'',
						step.content.trim(),
						'',
						'</details>'
					].join('\n')
				);
			}
		}

		if (message.reasoning?.trim()) {
			// <details> keeps long chains of thought collapsed wherever the markdown
			// is rendered, while staying plain text everywhere else.
			parts.push(
				[
					'<details>',
					'<summary>Reasoning</summary>',
					'',
					message.reasoning.trim(),
					'',
					'</details>'
				].join('\n')
			);
		}

		if (message.content.trim()) parts.push(message.content.trim());

		const sources = message.webSearch?.sources ?? [];
		if (sources.length) {
			parts.push(
				['**Sources**', ...sources.map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`)].join(
					'\n'
				)
			);
		}
	}

	return parts.join('\n\n') + '\n';
}

export function serializeSession(
	session: Session,
	format: ExportFormat,
	assistantLabel?: string
): string {
	return format === 'json' ? sessionToJson(session) : sessionToMarkdown(session, assistantLabel);
}

/**
 * A conversation, ready to become a knowledge collection.
 *
 * What was worked out in a conversation is often what you want to hand to the
 * next one, and copying the transcript by hand was the only way to do it. Same
 * transcript as the Markdown export, so there is one idea of what a conversation
 * reads like.
 *
 * A draft rather than a saved collection: it opens in the editor to be named and
 * trimmed first. The conversation is untouched either way, and the copy does not
 * follow it if it continues.
 */
export async function sessionAsKnowledgeDraft(
	id: string
): Promise<{ name: string; content: string } | null> {
	const session = await repository.loadSession(id);
	if (!session) return null;

	return {
		name: resolveSessionTitle(session) || `Session #${session.id}`,
		content: sessionToMarkdown(session)
	};
}

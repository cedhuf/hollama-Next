import { get } from 'svelte/store';

import { playbooksStore } from '$lib/localStorage';
import { generateRandomId } from '$lib/utils';

/**
 * A way of doing something, written once and reused in any conversation.
 *
 * The other half of what a persona is, and deliberately not the same object. A
 * persona is *who* is answering: a voice, a model, an ongoing relationship, a
 * conversation of its own. A playbook is *how* a job gets done: a procedure the
 * model follows, with no voice, no model and no conversation. You do not talk to
 * a playbook; you switch one on and it changes how the answer is produced.
 *
 * Which is why the two are drawn differently even though they travel through the
 * same machinery. A persona's card is a face and a tagline, because you are
 * choosing somebody. A playbook's is a name, the sentence saying when it
 * applies, and the shape of the procedure inside it, because you are choosing a
 * method.
 *
 * The instructions are Markdown, and they are the whole of it. No templating, no
 * variables, no steps the app interprets: what makes a playbook reusable is that
 * it is text a model reads, so it survives every model, every provider, and
 * every change of ours.
 */
export interface Playbook {
	id: string;
	name: string;
	/**
	 * When to use it, in one line.
	 *
	 * It carries more weight than a persona's tagline, which is decoration. This
	 * is what `/playbooks` lists and what somebody reads when deciding whether
	 * this is the one, so it is written for that decision rather than as a
	 * description of the contents.
	 */
	summary: string;
	/** The procedure itself, in Markdown. */
	instructions: string;
	/** Accent for the card and the chip; stable per playbook. */
	color: string;
	/** One of `PERSONA_GLYPHS`, drawn on the accent. Optional: most wear none. */
	glyph?: string;
	tags?: string[];
	/** Admin-shared with users (server mode). */
	shared?: boolean;
	/** Where it came from, when it was not written here. The same notion a persona uses. */
	source?: {
		origin: 'official' | 'community' | 'admin' | 'file';
		id?: string;
		revision?: number;
		digest?: string;
	};
	createdAt: string;
	updatedAt: string;
}

/** Theme-safe accents, from the same family as the personas, so a library reads as one thing. */
export const PLAYBOOK_COLORS = [
	'#5DCAA5',
	'#378ADD',
	'#7F77DD',
	'#BA7517',
	'#1D9E75',
	'#D4537E',
	'#D85A30',
	'#888780'
];

export function pickPlaybookColor(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
	return PLAYBOOK_COLORS[hash % PLAYBOOK_COLORS.length];
}

export function newPlaybook(id: string = generateRandomId()): Playbook {
	const now = new Date().toISOString();
	return {
		id,
		name: '',
		summary: '',
		instructions: '',
		color: pickPlaybookColor(id),
		createdAt: now,
		updatedAt: now
	};
}

export const loadPlaybook = (id: string): Playbook =>
	(get(playbooksStore) ?? []).find((playbook) => playbook.id === id) ?? newPlaybook(id);

export const savePlaybook = (playbook: Playbook): void => {
	playbooksStore.upsert({ ...playbook, updatedAt: new Date().toISOString() });
};

export const deletePlaybook = (id: string): void => {
	playbooksStore.remove(id);
};

/**
 * The playbooks a conversation is running with, in the order they were switched on.
 *
 * Held by id and resolved on the fly, unlike a persona, which is snapshotted
 * into the session when the conversation starts. The difference is not an
 * oversight: a persona is who you are talking to and must not change under a
 * conversation already under way, while a playbook is a procedure you are
 * maintaining, and fixing a step in it should fix it everywhere it is on.
 */
export function playbooksOf(ids: string[] | undefined): Playbook[] {
	if (!ids?.length) return [];
	const all = get(playbooksStore) ?? [];
	return ids
		.map((id) => all.find((playbook) => playbook.id === id))
		.filter((playbook): playbook is Playbook => !!playbook);
}

/** Ready to be written into a system prompt: a heading per playbook, then its text. */
export function playbookInstructions(playbooks: Playbook[]): string {
	return playbooks
		.map(
			(playbook) => `## ${playbook.name.trim() || 'Playbook'}\n\n${playbook.instructions.trim()}`
		)
		.filter(Boolean)
		.join('\n\n');
}

import { get } from 'svelte/store';

import { playbooksStore } from '$lib/localStorage';
import { generateRandomId } from '$lib/utils';

/**
 * A way of doing something, written once and reused in any conversation.
 *
 * The other half of what a persona is, and deliberately not the same object: a
 * persona is *who* is answering, a playbook is *how* a job gets done. You do not
 * talk to a playbook, you switch one on.
 *
 * Which is why it has no face: the space a portrait would take is given to the
 * sentence saying when to use it.
 *
 * The instructions are Markdown and are the whole of it. No templating, no
 * variables, no steps the app interprets: what makes a playbook reusable is that
 * it is text a model reads.
 */
export interface Playbook {
	id: string;
	name: string;
	/** It carries more weight than a persona's tagline, which is decoration: this is what `/playbooks` lists and what somebody reads when deciding. */
	summary: string;
	/** The procedure itself, in Markdown. */
	instructions: string;
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

export function newPlaybook(id: string = generateRandomId()): Playbook {
	const now = new Date().toISOString();
	return {
		id,
		name: '',
		summary: '',
		instructions: '',
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

/** A copy, not a link: a fresh id, and what it is a copy *of* recorded, so the card can tell later whether you have changed it. */
export function installSharedPlaybook(playbook: Playbook): Playbook {
	const now = new Date().toISOString();
	const copy: Playbook = {
		...playbook,
		id: generateRandomId(),
		shared: false,
		source: { origin: 'admin', id: playbook.id },
		createdAt: now,
		updatedAt: now
	};
	savePlaybook(copy);
	return copy;
}

/**
 * Held by id and resolved on the fly, unlike a persona, which is snapshotted
 * when the conversation starts: a persona must not change under a conversation
 * already under way, while fixing a step in a procedure should fix it
 * everywhere it is on.
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

/** Headings first, since a playbook with sections is organised by them; failing that, numbered or bulleted lines. What somebody wants before switching one on is how much of a procedure it is. */
export function playbookSteps(instructions: string): number {
	const headings = (instructions.match(/^#{1,6}\s+\S/gm) ?? []).length;
	if (headings) return headings;
	return (instructions.match(/^\s*(?:[-*+]|\d+[.)])\s+\S/gm) ?? []).length;
}

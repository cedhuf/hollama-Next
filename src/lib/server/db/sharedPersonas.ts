import type { Persona } from '$lib/personas';

import { getConfig, setConfig } from './config';

/**
 * The personas an instance offers its users, as a collection of its own.
 *
 * It used to be a snapshot of the admin's library: every republication rebuilt
 * the whole list from whatever they had flagged `shared`. That works exactly as
 * long as sharing something means owning it, and it stopped being true the day
 * an admin could hand out a persona straight from the store without installing
 * it first. Under the old rule, the next time they toggled anything in their
 * library the store-shared entry vanished, silently, from everyone.
 *
 * So the list is the thing, and the library is one of two ways to add to it. A
 * republication from the library refreshes what the library contributed and
 * leaves the rest standing, which is why it has to be told which ids are in that
 * library rather than inferring it from what it was sent.
 *
 * Note what a shared persona does not carry: attached knowledge. The documents
 * live in whoever's store they were created in, and the ids on the persona mean
 * nothing to anyone else. That was already true of library sharing and is not
 * made worse here, but it is the next thing to fix if personas start shipping
 * documents.
 */
const KEY = 'sharedPersonas';

export function sharedPersonas(): Persona[] {
	try {
		const raw = getConfig(KEY);
		return raw ? (JSON.parse(raw) as Persona[]) : [];
	} catch {
		return [];
	}
}

function write(list: Persona[]): void {
	setConfig(KEY, JSON.stringify(list));
}

/**
 * Refresh what one admin's library contributes, and leave everything else.
 *
 * `libraryIds` is every persona in that library, shared or not, which is what
 * makes removal work: an entry whose id is in the library but not in `shared` is
 * one whose flag was just turned off.
 */
export function syncSharedFromLibrary(shared: Persona[], libraryIds: string[]): void {
	const ids = new Set(libraryIds);
	const kept = sharedPersonas().filter((persona) => !ids.has(persona.id));
	write([...kept, ...shared]);
}

/** Add one, or replace it where it already is, keeping the order stable. */
export function upsertSharedPersona(persona: Persona): void {
	const list = sharedPersonas();
	const index = list.findIndex((existing) => existing.id === persona.id);
	write(index === -1 ? [...list, persona] : list.with(index, persona));
}

export function removeSharedPersona(id: string): void {
	write(sharedPersonas().filter((persona) => persona.id !== id));
}

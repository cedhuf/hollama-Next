/**
 * What a persona remembers about you, between conversations.
 *
 * Not a summary of what was said: a small set of things the persona decided were
 * worth keeping, written by calling a tool and readable by you at any time. It
 * belongs to the pair (persona, person): a persona an admin shares is one object
 * read by everybody, so a memory living on it would be everybody's.
 *
 * Two tiers. The **profile** is one block always in the context: what is true
 * most of the time. The **notes** are everything else, and only their index goes
 * into the context, the body being read on demand. That is what keeps the cost
 * of remembering a hundred things equal to listing a hundred titles.
 */

export interface MemoryNote {
	id: string;
	/** What it is about, short enough to scan a list of them. */
	title: string;
	/** When this note matters. The line that decides whether to open it. */
	when: string;
	/** The note itself, read only when asked for. */
	body: string;
	createdAt: string;
	/** Separate from `createdAt`, because the interesting question is how long ago anybody checked it was still true. A note never revisited is a guess with a date on it. */
	confirmedAt: string;
}

export interface PersonaMemory {
	/** There is one memory per persona per person, so a separate identifier would be a second name for the same thing. Called `id` so this collection stores and restores like every other. */
	id: string;
	profile: string;
	notes: MemoryNote[];
	updatedAt: string;
}

/**
 * One number to tune, and the rest follows. `alwaysInContext` is the only budget
 * that matters, being the only part paid on every turn; the per-item caps stop
 * any single item eating it, not to be tuned separately.
 *
 * `body` is generous: it is paid only when the persona asks for it, so the cap
 * only stops one note filling a context window by itself.
 */
export const MEMORY_LIMITS = {
	/** Profile + every index line, in characters. The real ceiling. */
	alwaysInContext: 4000,
	profile: 2000,
	title: 60,
	when: 120,
	body: 4000,
	/** How many notes may be opened in a single turn. */
	openPerTurn: 3
} as const;

export function emptyMemory(personaId: string): PersonaMemory {
	return { id: personaId, profile: '', notes: [], updatedAt: new Date().toISOString() };
}

/** One note's cost in the always-present index: what the model reads to choose. */
export function indexLine(note: MemoryNote): string {
	return `- [${note.id}] ${note.title}: ${note.when}`;
}

/** What the memory costs on every turn, whether or not anything is opened. */
export function contextCost(memory: PersonaMemory): number {
	const index = memory.notes.reduce((total, note) => total + indexLine(note).length + 1, 0);
	return memory.profile.trim().length + index;
}

export function hasContent(memory: PersonaMemory | null | undefined): boolean {
	return !!memory && (!!memory.profile.trim() || memory.notes.length > 0);
}

/**
 * Refusals are returned rather than fixed. Truncating silently leaves a model
 * believing it wrote something it did not, and evicting an old note throws away
 * a memory nobody agreed to lose. Over budget, it has to merge or forget, and
 * say which.
 */
export type MemoryRefusal = { ok: false; reason: string };
export type MemoryResult<T> = { ok: true; value: T } | MemoryRefusal;

const over = (what: string, limit: number, actual: number): MemoryRefusal => ({
	ok: false,
	reason: `${what} is ${actual} characters, over the ${limit} allowed. Shorten it, or merge it into an existing note, or forget one you no longer need.`
});

export function setProfile(memory: PersonaMemory, text: string): MemoryResult<PersonaMemory> {
	const profile = text.trim();
	if (profile.length > MEMORY_LIMITS.profile) {
		return over('The profile', MEMORY_LIMITS.profile, profile.length);
	}
	const next = { ...memory, profile, updatedAt: new Date().toISOString() };
	return budgeted(next);
}

export function writeNote(
	memory: PersonaMemory,
	input: { id?: string; title: string; when: string; body: string },
	newId: () => string
): MemoryResult<PersonaMemory> {
	const title = input.title.trim();
	const when = input.when.trim();
	const body = input.body.trim();

	if (!title) return { ok: false, reason: 'A note needs a title.' };
	if (!when) {
		return {
			ok: false,
			reason:
				'A note needs a line saying when it matters. That line is what you will read later to decide whether to open it, so write it for your future self, not as a second title.'
		};
	}
	if (title.length > MEMORY_LIMITS.title) {
		return over('The title', MEMORY_LIMITS.title, title.length);
	}
	if (when.length > MEMORY_LIMITS.when)
		return over('The "when" line', MEMORY_LIMITS.when, when.length);
	if (body.length > MEMORY_LIMITS.body) return over('The note', MEMORY_LIMITS.body, body.length);

	const now = new Date().toISOString();
	const existing = input.id ? memory.notes.find((note) => note.id === input.id) : undefined;

	if (input.id && !existing) {
		return {
			ok: false,
			reason: `There is no note ${input.id}. Write it without an id to create one.`
		};
	}

	const note: MemoryNote = {
		id: existing?.id ?? newId(),
		title,
		when,
		body,
		createdAt: existing?.createdAt ?? now,
		confirmedAt: now
	};

	const notes = existing
		? memory.notes.map((it) => (it.id === note.id ? note : it))
		: [...memory.notes, note];

	return budgeted({ ...memory, notes, updatedAt: now });
}

export function forgetNote(memory: PersonaMemory, id: string): MemoryResult<PersonaMemory> {
	if (!memory.notes.some((note) => note.id === id)) {
		return { ok: false, reason: `There is no note ${id}.` };
	}
	return {
		ok: true,
		value: {
			...memory,
			notes: memory.notes.filter((note) => note.id !== id),
			updatedAt: new Date().toISOString()
		}
	};
}

/** The one ceiling, checked after every write rather than per field. */
function budgeted(memory: PersonaMemory): MemoryResult<PersonaMemory> {
	const cost = contextCost(memory);
	if (cost <= MEMORY_LIMITS.alwaysInContext) return { ok: true, value: memory };
	return {
		ok: false,
		reason: `This would put ${cost} characters in every message of every conversation, over the ${MEMORY_LIMITS.alwaysInContext} allowed. Everything you keep is read again on every turn, so forget a note you no longer need, or merge two that overlap, before adding this one.`
	};
}

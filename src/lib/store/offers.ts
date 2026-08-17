import { personaOrigin, type Persona } from '$lib/personas';
import { personaState, type PersonaState } from '$lib/personaState';
import type { CatalogEntry } from '$lib/personaStore';
import { playbookState } from '$lib/playbookCatalog';
import { playbookSteps, type Playbook } from '$lib/playbooks';
import type { PlaybookCatalogEntry } from '$lib/playbookStore';
import { copyAction, isEdited, packageAction, type Offer } from '$lib/storeOffer';

/**
 * What the store has on its shelves, built from what a catalogue lists and what
 * a library holds.
 *
 * Plain functions over plain arguments: no stores read here, no components, no
 * runes. The browser passes in what it has and hands back the actions, which is
 * what makes these two the only place that knows the difference between a
 * persona and a playbook once a card is drawn.
 */

/** A card that carries a face. */
export type PersonaOffer = Offer & {
	avatar: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
};

export interface PersonaActions {
	install: (entry: CatalogEntry) => Promise<void>;
	installShared: (persona: Persona) => Promise<void>;
	restore: (persona: Persona, ask: boolean) => Promise<void>;
	toggleOwn: (persona: Persona) => Promise<void>;
	toggleRelay: (id: string, relay: boolean) => Promise<void>;
}

export interface PersonaInput {
	entries: CatalogEntry[];
	library: Persona[];
	/** Personas an administrator wrote and offers to everyone. */
	shared: Persona[];
	/** Catalogue ids this instance relays. */
	relayed: Set<string>;
	/** A curated store holds what the instance offers and nothing else. */
	curated: boolean;
	avatarOf: (entry: CatalogEntry) => PersonaOffer['avatar'];
}

/**
 * The catalogue row a persona answers to, by provenance or, failing that, by name.
 *
 * The name is what rescues the personas the app used to write into every library
 * at boot: they carry no provenance at all, so nothing links them to the store,
 * and without this they read as written from scratch while the store
 * simultaneously calls them installed.
 */
function entryFor(persona: Persona, entries: CatalogEntry[]): CatalogEntry | undefined {
	const from = personaOrigin(persona);
	if (from) return entries.find((entry) => entry.id === from);
	const name = persona.name.trim().toLowerCase();
	return entries.find((entry) => entry.name.trim().toLowerCase() === name);
}

export function personaStateIn(persona: Persona, entries: CatalogEntry[]): PersonaState {
	return personaState(persona, entryFor(persona, entries)?.contentDigest);
}

export function personaOffers(input: PersonaInput, actions: PersonaActions) {
	const { entries, library, relayed, curated } = input;

	const stateOf = (persona: Persona) => personaStateIn(persona, entries);

	const copiesOf = (entry: CatalogEntry) => {
		const name = entry.name.trim().toLowerCase();
		return library.filter(
			(persona) =>
				personaOrigin(persona) === entry.id ||
				(!personaOrigin(persona) && persona.name.trim().toLowerCase() === name)
		);
	};

	const copyOffer = (persona: Persona): PersonaOffer => {
		const state = stateOf(persona);
		const edited = isEdited(state);
		const outdated = state === 'outdated';

		return {
			key: `persona:copy:${persona.id}`,
			kind: 'copy',
			family: 'personas',
			name: persona.name,
			line: persona.tagline,
			avatar: {
				avatarColor: persona.avatarColor,
				avatarGlyph: persona.avatarGlyph,
				avatarImage: persona.avatarImage
			},
			tags: persona.tags ?? [],
			action: copyAction(state),
			run: edited || outdated ? () => actions.restore(persona, edited) : undefined,
			edited,
			shared: !!persona.shared,
			toggleShare: () => actions.toggleOwn(persona)
		};
	};

	const packageOffer = (entry: CatalogEntry): PersonaOffer => {
		const untouched = copiesOf(entry).some((persona) => !isEdited(stateOf(persona)));
		return {
			key: `persona:package:${entry.id}`,
			kind: 'package',
			family: 'personas',
			name: entry.name,
			line: entry.tagline,
			avatar: input.avatarOf(entry),
			tags: entry.tags,
			action: packageAction(untouched),
			run: untouched ? undefined : () => actions.install(entry),
			edited: false,
			shared: relayed.has(entry.id),
			toggleShare: () => actions.toggleRelay(entry.id, !relayed.has(entry.id))
		};
	};

	/**
	 * The personas an administrator shares that are not in the catalogue.
	 *
	 * Theirs, so what a user gets is a copy of it. Left out of your own store when
	 * it is already in your library, which for the administrator who shared it is
	 * always: the store is what you can add, and you cannot add what you wrote.
	 */
	const fromAdmin = input.shared
		.filter((persona) => !library.some((own) => own.id === persona.id))
		.map(
			(persona): PersonaOffer => ({
				key: `persona:shared:${persona.id}`,
				kind: 'package',
				family: 'personas',
				name: persona.name,
				line: persona.tagline,
				avatar: {
					avatarColor: persona.avatarColor,
					avatarGlyph: persona.avatarGlyph,
					avatarImage: persona.avatarImage
				},
				tags: persona.tags ?? [],
				action: library.some((own) => personaOrigin(own) === persona.id) ? 'installed' : 'install',
				run: () => actions.installShared(persona),
				edited: false,
				shared: true,
				toggleShare: async () => {
					const own = library.find((p) => p.id === persona.id);
					if (own) await actions.toggleOwn(own);
				}
			})
		);

	return {
		/** What the catalogue contributes, which on a curated instance is not all of it. */
		store: [
			...fromAdmin,
			...entries.filter((entry) => !curated || relayed.has(entry.id)).map(packageOffer)
		],
		/** Written here, or taken and changed. Untouched installs are the store's, not yours. */
		mine: library
			.filter((persona) => {
				const state = stateOf(persona);
				return state === 'own' || isEdited(state);
			})
			.map(copyOffer),
		/** Everything this instance hands out, each entry drawn as whatever it is. */
		offered: [
			...entries.filter((entry) => relayed.has(entry.id)).map(packageOffer),
			...library.filter((persona) => persona.shared).map(copyOffer)
		],
		/** Copies that could take a newer published version right now. */
		updatable: library.filter((persona) => stateOf(persona) === 'outdated')
	};
}

export interface PlaybookActions {
	install: (entry: PlaybookCatalogEntry) => Promise<void>;
	installShared: (playbook: Playbook) => Promise<void>;
	restore: (playbook: Playbook, ask: boolean) => Promise<void>;
	toggleOwn: (playbook: Playbook) => Promise<void>;
	toggleRelay: (id: string, relay: boolean) => Promise<void>;
}

export interface PlaybookInput {
	entries: PlaybookCatalogEntry[];
	library: Playbook[];
	shared: Playbook[];
	relayed: Set<string>;
	curated: boolean;
	/** How the "N sections" line is worded, which only the interface knows. */
	sections: (count: number) => string;
}

export function playbookOffers(input: PlaybookInput, actions: PlaybookActions) {
	const { entries, library, relayed, curated } = input;

	const stateOf = (playbook: Playbook) =>
		playbookState(
			playbook,
			entries.find((entry) => entry.id === playbook.source?.id)?.contentDigest
		);

	const copyOffer = (playbook: Playbook): Offer => {
		const state = stateOf(playbook);
		const edited = isEdited(state);
		const outdated = state === 'outdated';

		return {
			key: `playbook:copy:${playbook.id}`,
			kind: 'copy',
			family: 'playbooks',
			name: playbook.name,
			line: playbook.summary,
			tags: playbook.tags ?? [],
			action: copyAction(state),
			run: edited || outdated ? () => actions.restore(playbook, edited) : undefined,
			edited,
			shared: !!playbook.shared,
			toggleShare: () => actions.toggleOwn(playbook),
			meta: input.sections(playbookSteps(playbook.instructions))
		};
	};

	const packageOffer = (entry: PlaybookCatalogEntry): Offer => {
		const untouched = library
			.filter((playbook) => playbook.source?.id === entry.id)
			.some((playbook) => !isEdited(stateOf(playbook)));

		return {
			key: `playbook:package:${entry.id}`,
			kind: 'package',
			family: 'playbooks',
			name: entry.name,
			line: entry.summary,
			tags: entry.tags,
			action: packageAction(untouched),
			run: untouched ? undefined : () => actions.install(entry),
			edited: false,
			shared: relayed.has(entry.id),
			toggleShare: () => actions.toggleRelay(entry.id, !relayed.has(entry.id)),
			meta: input.sections(entry.steps ?? 0)
		};
	};

	/**
	 * The playbooks an administrator shares that are not in the catalogue.
	 *
	 * Theirs, so what a user gets is a copy of it. Left out of your own store when
	 * it is already in your library, which for the administrator who shared it is
	 * always: the store is what you can add, and you cannot add what you wrote.
	 */
	const fromAdmin = input.shared
		.filter((playbook) => !library.some((own) => own.id === playbook.id))
		.map((playbook): Offer => {
			const held = library.some((own) => own.source?.id === playbook.id);
			return {
				...copyOffer(playbook),
				key: `playbook:shared:${playbook.id}`,
				kind: 'package',
				action: held ? 'installed' : 'install',
				// A button that says Install and does nothing is worse than no button.
				run: held ? undefined : () => actions.installShared(playbook),
				edited: false,
				shared: true
			};
		});

	return {
		store: [
			...fromAdmin,
			...entries.filter((entry) => !curated || relayed.has(entry.id)).map(packageOffer)
		],
		mine: library
			.filter((playbook) => {
				const state = stateOf(playbook);
				return state === 'own' || isEdited(state);
			})
			.map(copyOffer),
		offered: [
			...entries.filter((entry) => relayed.has(entry.id)).map(packageOffer),
			...library.filter((playbook) => playbook.shared).map(copyOffer)
		],
		updatable: library.filter((playbook) => stateOf(playbook) === 'outdated')
	};
}

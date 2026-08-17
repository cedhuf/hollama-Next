<script lang="ts">
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
	import StoreModal from '$lib/components/StoreModal.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { applyBundleToPersona, avatarFields, installPersonaBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { installPersona, personaOrigin, savePersona, type Persona } from '$lib/personas';
	import { personasConfig, publishSharedPersonas, relayCatalogPersona } from '$lib/personasConfig';
	import { personaState, type PersonaState } from '$lib/personaState';
	import type { CatalogEntry } from '$lib/personaStore';
	import { copyAction, packageAction, type Offer, type OfferView } from '$lib/storeOffer';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	/**
	 * One card, and one rule for what its button says.
	 *
	 * This page grew a rule per view, and then a rule per case inside each view,
	 * and the result was a store showing personas that were not in the store and a
	 * "share" list telling you to install what you had written yourself. So the
	 * rule is stated once, here, and every card is built through it.
	 *
	 * A card is about one of exactly two things, and that is the only distinction
	 * that matters:
	 *
	 * - a **package**, which is a persona the store publishes. You install it. It
	 *   says `installed` only while you hold an untouched copy of it, because that
	 *   is the only case where installing again would give you what you already
	 *   have.
	 * - a **copy**, which is a persona in your library. You wrote it, or you took a
	 *   package and changed it. There is nothing to install; what it offers is to
	 *   go back to what was published.
	 *
	 * Every view is then a selection of those two, never a third behaviour.
	 *
	 * The rule itself now lives in `storeOffer`, where the playbook store reads the
	 * same one. What stays here is what is genuinely about personas: which listing,
	 * what installing means, and the face on the card.
	 */

	/** What a persona card needs on top of the shared offer: a face. */
	type PersonaOffer = Offer & {
		avatar: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
	};

	let view = $state<OfferView>('store');

	// Opening is what asks for the listing, not mounting: the modal lives on the
	// Library page whether or not anyone opens it, and a page load is not a reason
	// to go and fetch a catalogue nobody asked to see.
	$effect(() => {
		if (open) void loadCatalog();
	});

	const catalog = $derived($catalogState);
	const entries = $derived(catalog.status === 'ready' ? catalog.catalog.entries : []);
	const library = $derived($personasStore ?? []);

	/**
	 * The catalogue row a persona answers to, by provenance or, failing that, by name.
	 *
	 * The name is what rescues the four personas the app used to write into every
	 * library at boot: they carry no provenance at all, so nothing links them to the
	 * store, and without this they read as written from scratch while the store
	 * simultaneously calls them installed.
	 */
	function entryFor(persona: Persona): CatalogEntry | undefined {
		const from = personaOrigin(persona);
		if (from) return entries.find((entry) => entry.id === from);
		const name = persona.name.trim().toLowerCase();
		return entries.find((entry) => entry.name.trim().toLowerCase() === name);
	}

	/** Your copies of a package, by the id or the name that ties them to it. */
	function copiesOf(entry: CatalogEntry): Persona[] {
		const name = entry.name.trim().toLowerCase();
		return library.filter(
			(persona) =>
				personaOrigin(persona) === entry.id ||
				(!personaOrigin(persona) && persona.name.trim().toLowerCase() === name)
		);
	}

	function stateOf(persona: Persona): PersonaState {
		return personaState(persona, entryFor(persona)?.contentDigest);
	}

	/** A copy that says something other than what was published. */
	const isEdited = (state: PersonaState) => state === 'edited' || state === 'edited-outdated';

	/** The store personas this instance relays. */
	const relayed = $derived(new Set($personasConfig.sharedFromStore));

	async function installEntry(entry: CatalogEntry) {
		const bundle = await fetchBundle(entry);
		installPersonaBundle(bundle, { origin: entry.origin, id: entry.id, revision: entry.revision });
		toast.success($LL.installedPersona({ name: entry.name }));
	}

	/**
	 * Put the published text back over a copy.
	 *
	 * Everything of yours that is not text is kept: the id, the model you chose, the
	 * conversation you are having with it, the knowledge you attached. It asks
	 * first when there is something of yours to lose, because there is no merge to
	 * offer and pretending otherwise would be worse than the question.
	 */
	async function restore(persona: Persona, ask: boolean) {
		const entry = entryFor(persona);
		if (!entry) return;
		if (ask && !confirm($LL.personaStoreUpdateConfirm({ name: persona.name }))) return;

		const bundle = await fetchBundle(entry);
		applyBundleToPersona(persona, bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.personaStoreUpdated({ name: entry.name }));
	}

	/** Offer one of your own personas to the instance, or stop. */
	async function toggleOwn(persona: Persona) {
		savePersona({ ...persona, shared: !persona.shared });
		await publishSharedPersonas();
	}

	/**
	 * A package, as a card.
	 *
	 * `installed` only while an untouched copy is held: with one you have edited,
	 * installing again is the way to get the published one back alongside yours,
	 * which is the whole reason both are allowed to exist.
	 */
	function packageOffer(entry: CatalogEntry): PersonaOffer {
		const copies = copiesOf(entry);
		const untouched = copies.some((persona) => !isEdited(stateOf(persona)));

		return {
			key: `package:${entry.id}`,
			kind: 'package',
			name: entry.name,
			line: entry.tagline,
			avatar: avatarFields(entry.avatar, entry.name),
			tags: entry.tags,
			action: packageAction(untouched),
			run: untouched ? undefined : () => installEntry(entry),
			edited: false,
			shared: relayed.has(entry.id),
			toggleShare: () => relayCatalogPersona(entry.id, !relayed.has(entry.id))
		};
	}

	/**
	 * One of your personas, as a card.
	 *
	 * Written here, or taken from a package and changed. Either way there is
	 * nothing to install, so the button either states that it is yours or offers to
	 * put the published version back.
	 */
	function copyOffer(persona: Persona): PersonaOffer {
		const state = stateOf(persona);
		const edited = isEdited(state);
		const outdated = state === 'outdated';

		return {
			key: `copy:${persona.id}`,
			kind: 'copy',
			name: persona.name,
			line: persona.tagline,
			avatar: {
				avatarColor: persona.avatarColor,
				avatarGlyph: persona.avatarGlyph,
				avatarImage: persona.avatarImage
			},
			tags: persona.tags ?? [],
			action: copyAction(state),
			run: edited || outdated ? () => restore(persona, edited) : undefined,
			edited,
			shared: !!persona.shared,
			toggleShare: () => toggleOwn(persona)
		};
	}

	/**
	 * What the catalogue contributes, which is not always all of it.
	 *
	 * On a curated instance a user's store holds what their administrator shares
	 * and nothing else. The door is the same door, in the same place, with the same
	 * gestures; only what is behind it is the instance's decision.
	 */
	const curated = $derived($personasConfig.storeMode === 'curated');
	const packages = $derived(
		entries.filter((entry) => !curated || relayed.has(entry.id)).map(packageOffer)
	);

	/**
	 * The personas an administrator shares that are not in the catalogue.
	 *
	 * Theirs, so what a user gets is a copy of it. Left out of your own store when
	 * it is already in your library, which for the administrator who shared it is
	 * always: the store is what you can add, and you cannot add what you wrote.
	 */
	const shared = $derived(
		$personasConfig.shared
			.filter((persona) => !library.some((own) => own.id === persona.id))
			.map(
				(persona): PersonaOffer => ({
					key: `shared:${persona.id}`,
					kind: 'package',
					name: persona.name,
					line: persona.tagline,
					avatar: {
						avatarColor: persona.avatarColor,
						avatarGlyph: persona.avatarGlyph,
						avatarImage: persona.avatarImage
					},
					tags: persona.tags ?? [],
					action: library.some((own) => personaOrigin(own) === persona.id)
						? 'installed'
						: 'install',
					run: async () => {
						installPersona(persona);
						toast.success($LL.installedPersona({ name: persona.name }));
					},
					edited: false,
					shared: true,
					toggleShare: async () => {
						const own = library.find((p) => p.id === persona.id);
						if (own) await toggleOwn(own);
					}
				})
			)
	);

	/** Written here, or taken and changed. Untouched installs are the store's, not yours. */
	const mine = $derived(
		library
			.filter((persona) => {
				const state = stateOf(persona);
				return state === 'own' || isEdited(state);
			})
			.map(copyOffer)
	);

	/** Everything this instance hands out, each entry drawn as whatever it is. */
	const offered = $derived([
		...packages.filter((offer) => offer.shared),
		...library.filter((persona) => persona.shared).map(copyOffer)
	]);

	const offers = $derived(
		view === 'mine' ? mine : view === 'shared' ? offered : [...shared, ...packages]
	);

	/**
	 * Every copy that could take a newer published version right now.
	 *
	 * Untouched ones only. Offering "update all" and having it quietly overwrite
	 * everything someone had rewritten would be the one press nobody could undo.
	 */
	const updatable = $derived(library.filter((persona) => stateOf(persona) === 'outdated'));

	async function updateAll() {
		let done = 0;
		for (const persona of updatable) {
			try {
				await restore(persona, false);
				done += 1;
			} catch {
				// One that will not fetch is not a reason to stop the rest.
			}
		}
		toast.success($LL.personaStoreUpdatedAll({ count: done }));
	}
</script>

<StoreModal
	bind:open
	bind:view
	title={$LL.personaStore()}
	{offers}
	views={$personasConfig.canShare ? ['store', 'mine', 'shared'] : ['store', 'mine']}
	counts={{ mine: mine.length, shared: offered.length }}
	layout={$settingsStore.personaStoreLayout}
	tint={0}
	status={catalog.status}
	errorMessage={catalog.status === 'error' ? catalog.message : undefined}
	searchPlaceholder={$LL.personaStoreSearch()}
	emptyMine={$LL.personaStoreNothingMine()}
	emptyShared={$LL.personaStoreNothingOffered()}
	unreachable={$LL.personaStoreUnreachable()}
	updatableCount={updatable.length}
	onUpdateAll={updateAll}
	sharing={isServerMode}
	shareAllowed={$personasConfig.canShare}
	onRefresh={() => loadCatalog(true)}
	onLayout={(value) => ($settingsStore.personaStoreLayout = value)}
	{card}
/>

{#snippet card(offer: Offer, storeActions: import('svelte').Snippet<[Offer]>)}
	<LibraryCard
		name={offer.name}
		tagline={offer.line}
		avatar={(offer as PersonaOffer).avatar}
		tags={offer.tags}
		layout={$settingsStore.personaStoreLayout}
	>
		<!-- One label, on one kind of card. A copy you have changed is the only thing
		     here that is not simply what it says it is, so it is the only thing that
		     says so. Everything else the card could announce is already in the button
		     under it. -->
		{#snippet badges()}
			{#if offer.edited}
				<span
					class="rounded border border-accent/30 bg-accent/10 px-1 text-[9px] font-medium leading-[15px] text-accent"
				>
					{$LL.personaStateEdited()}
				</span>
			{/if}
		{/snippet}

		{#snippet actions()}
			{@render storeActions(offer)}
		{/snippet}
	</LibraryCard>
{/snippet}

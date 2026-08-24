<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { confirmAction } from '$lib/components/ConfirmDialog.svelte';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
	import StoreModal from '$lib/components/StoreModal.svelte';
	import { personasStore, playbooksStore, settingsStore } from '$lib/localStorage';
	import { applyBundleToPersona, avatarFields, installPersonaBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { installPersona, savePersona, type Persona } from '$lib/personas';
	import { personasConfig, publishSharedPersonas, relayCatalogPersona } from '$lib/personasConfig';
	import type { CatalogEntry } from '$lib/personaStore';
	import {
		applyBundleToPlaybook,
		fetchPlaybookBundle,
		installPlaybookBundle,
		loadPlaybookCatalog,
		playbookCatalogState
	} from '$lib/playbookCatalog';
	import { installSharedPlaybook, savePlaybook, type Playbook } from '$lib/playbooks';
	import {
		playbooksConfig,
		publishSharedPlaybooks,
		relayCatalogPlaybook
	} from '$lib/playbooksConfig';
	import type { PlaybookCatalogEntry } from '$lib/playbookStore';
	import type { StoreKind } from '$lib/store';
	import { personaOffers, playbookOffers, type PersonaOffer } from '$lib/store/offers';
	import type { Offer, OfferView } from '$lib/storeOffer';
	import { toast } from '$lib/toast';

	/**
	 * The store: one door, several catalogues.
	 *
	 * There were two of these, one per catalogue, and the mechanism was the same
	 * in both. The argument that settled it is the one nobody thinks of as design:
	 * "is anything of mine out of date" was a question you had to ask twice, in two
	 * windows, with two buttons and two settings, and three times once plugins
	 * arrive. A store that holds everything answers it once.
	 *
	 * The views follow: what you can install, what is yours, what this instance
	 * hands out. None of them is about a *type*, which is why splitting them by
	 * type was arbitrary. The type is a filter, and the shelf groups by it so
	 * nobody has to skim playbooks looking for a persona.
	 */
	interface Props {
		open: boolean;
		/** Which catalogue to open on. Empty means everything. */
		family?: StoreKind | '';
	}

	let { open = $bindable(false), family = $bindable('' as StoreKind | '') }: Props = $props();

	let view = $state<OfferView>('store');

	// Opening is what asks for the listings, not mounting: this lives on the
	// Library page whether or not anyone opens it, and a page load is not a reason
	// to fetch a catalogue nobody asked to see.
	$effect(() => {
		if (!open) return;
		void loadCatalog();
		void loadPlaybookCatalog();
	});

	const personaCatalog = $derived($catalogState);
	const playbookCatalog = $derived($playbookCatalogState);

	/**
	 * One status for two listings.
	 *
	 * Failing means both failed: with one of them answering there is a shelf to
	 * show, and an error page over a store that has something on it would be a
	 * lie about the half that worked.
	 */
	const status = $derived(
		personaCatalog.status === 'ready' || playbookCatalog.status === 'ready'
			? ('ready' as const)
			: personaCatalog.status === 'loading' || playbookCatalog.status === 'loading'
				? ('loading' as const)
				: personaCatalog.status === 'error' && playbookCatalog.status === 'error'
					? ('error' as const)
					: ('idle' as const)
	);
	const errorMessage = $derived(
		personaCatalog.status === 'error' ? personaCatalog.message : undefined
	);

	// --- personas -------------------------------------------------------------

	async function installEntry(entry: CatalogEntry) {
		const bundle = await fetchBundle(entry);
		installPersonaBundle(bundle, { origin: entry.origin, id: entry.id, revision: entry.revision });
		toast.success($LL.installedPersona({ name: entry.name }));
	}

	/**
	 * Put the published text back over a copy.
	 *
	 * Everything of yours that is not text is kept: the id, the model you chose,
	 * the conversation you are having with it, the knowledge you attached. It asks
	 * first when there is something of yours to lose, because there is no merge to
	 * offer and pretending otherwise would be worse than the question.
	 */
	async function restorePersona(persona: Persona, ask: boolean) {
		const entry = (personaCatalog.status === 'ready' ? personaCatalog.catalog.entries : []).find(
			(row) => row.id === persona.source?.id || row.name.trim() === persona.name.trim()
		);
		if (!entry) return;
		if (
			ask &&
			!(await confirmAction({
				title: $LL.personaStoreUpdateConfirm({ name: persona.name }),
				action: $LL.personaStoreUpdate()
			}))
		) {
			return;
		}

		const bundle = await fetchBundle(entry);
		applyBundleToPersona(persona, bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.personaStoreUpdated({ name: entry.name }));
	}

	const personas = $derived(
		personaOffers(
			{
				entries: personaCatalog.status === 'ready' ? personaCatalog.catalog.entries : [],
				library: $personasStore ?? [],
				shared: $personasConfig.shared,
				relayed: new Set($personasConfig.sharedFromStore),
				curated: $personasConfig.storeMode === 'curated',
				avatarOf: (entry) => avatarFields(entry.avatar, entry.name)
			},
			{
				install: installEntry,
				installShared: async (persona) => {
					installPersona(persona);
					toast.success($LL.installedPersona({ name: persona.name }));
				},
				restore: restorePersona,
				toggleOwn: async (persona) => {
					savePersona({ ...persona, shared: !persona.shared });
					await publishSharedPersonas();
				},
				toggleRelay: relayCatalogPersona
			}
		)
	);

	// --- playbooks ------------------------------------------------------------

	async function installPlaybook(entry: PlaybookCatalogEntry) {
		const bundle = await fetchPlaybookBundle(entry);
		installPlaybookBundle(bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.playbookInstalled({ name: entry.name }));
	}

	async function restorePlaybook(playbook: Playbook, ask: boolean) {
		const entry = (playbookCatalog.status === 'ready' ? playbookCatalog.catalog.entries : []).find(
			(row) => row.id === playbook.source?.id
		);
		if (!entry) return;
		if (
			ask &&
			!(await confirmAction({
				title: $LL.personaStoreUpdateConfirm({ name: playbook.name }),
				action: $LL.personaStoreUpdate()
			}))
		) {
			return;
		}

		const bundle = await fetchPlaybookBundle(entry);
		applyBundleToPlaybook(playbook, bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.personaStoreUpdated({ name: entry.name }));
	}

	const playbooks = $derived(
		playbookOffers(
			{
				entries: playbookCatalog.status === 'ready' ? playbookCatalog.catalog.entries : [],
				library: $playbooksStore ?? [],
				shared: $playbooksConfig.shared,
				relayed: new Set($playbooksConfig.sharedFromStore),
				curated: $playbooksConfig.storeMode === 'curated',
				sections: (count) => $LL.playbookSections({ count })
			},
			{
				install: installPlaybook,
				installShared: async (playbook) => {
					installSharedPlaybook(playbook);
					toast.success($LL.playbookInstalled({ name: playbook.name }));
				},
				restore: restorePlaybook,
				toggleOwn: async (playbook) => {
					savePlaybook({ ...playbook, shared: !playbook.shared });
					await publishSharedPlaybooks();
				},
				toggleRelay: relayCatalogPlaybook
			}
		)
	);

	/**
	 * Whether this person may hand anything out.
	 *
	 * Both catalogues answer it, and both answer it the same way, because it is a
	 * property of the account rather than of the shelf: an administrator shares,
	 * everybody else does not. Read from one of them, once, so a card in a store
	 * that holds two catalogues is never gated on the config of the other.
	 */
	const canShare = $derived($personasConfig.canShare || $playbooksConfig.canShare);

	// --- the shelf ------------------------------------------------------------

	const all = $derived(
		view === 'mine'
			? [...personas.mine, ...playbooks.mine]
			: view === 'shared'
				? [...personas.offered, ...playbooks.offered]
				: [...personas.store, ...playbooks.store]
	);
	const offers = $derived(family ? all.filter((offer) => offer.family === family) : all);

	const counts = $derived({
		mine: personas.mine.length + playbooks.mine.length,
		shared: personas.offered.length + playbooks.offered.length
	});

	/**
	 * One "update all", over both catalogues.
	 *
	 * The whole reason the two stores became one. Untouched copies only: a single
	 * press that quietly overwrote everything somebody had rewritten would be the
	 * one nobody could undo.
	 */
	const updatableCount = $derived(personas.updatable.length + playbooks.updatable.length);

	async function updateAll() {
		let done = 0;
		for (const persona of personas.updatable) {
			try {
				await restorePersona(persona, false);
				done += 1;
			} catch {
				// One that will not fetch is not a reason to stop the rest.
			}
		}
		for (const playbook of playbooks.updatable) {
			try {
				await restorePlaybook(playbook, false);
				done += 1;
			} catch {
				/* likewise */
			}
		}
		toast.success($LL.personaStoreUpdatedAll({ count: done }));
	}

	const families = $derived([
		{
			value: 'personas' as const,
			label: $LL.personas(),
			tint: 0,
			count: all.filter((offer) => offer.family === 'personas').length
		},
		{
			value: 'playbooks' as const,
			label: $LL.playbooks(),
			tint: 150,
			count: all.filter((offer) => offer.family === 'playbooks').length
		}
	]);
</script>

<StoreModal
	bind:open
	bind:view
	bind:family
	title={$LL.store()}
	{offers}
	{families}
	{counts}
	{status}
	{errorMessage}
	{updatableCount}
	views={canShare ? ['store', 'mine', 'shared'] : ['store', 'mine']}
	layout={$settingsStore.personaStoreLayout}
	searchPlaceholder={$LL.storeSearch()}
	emptyMine={$LL.personaStoreNothingMine()}
	emptyShared={$LL.personaStoreNothingOffered()}
	unreachable={$LL.personaStoreUnreachable()}
	sharing={true}
	shareAllowed={canShare}
	onUpdateAll={updateAll}
	onRefresh={() => {
		void loadCatalog(true);
		void loadPlaybookCatalog(true);
	}}
	onLayout={(value) => ($settingsStore.personaStoreLayout = value)}
	{card}
/>

{#snippet card(offer: Offer, storeActions: import('svelte').Snippet<[Offer]>)}
	<LibraryCard
		name={offer.name}
		tagline={offer.line}
		avatar={offer.family === 'personas' ? (offer as PersonaOffer).avatar : undefined}
		tags={offer.tags}
		meta={offer.meta}
		layout={$settingsStore.personaStoreLayout}
	>
		<!-- One label, on one kind of card. A copy you have changed is the only thing
		     here that is not simply what it says it is, so it is the only thing that
		     says so. Everything else the card could announce is already in the button
		     under it. -->
		{#snippet badges()}
			{#if offer.edited}
				<span
					class="border-accent/30 bg-accent/10 text-accent rounded border px-1 text-[9px] leading-[15px] font-medium"
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

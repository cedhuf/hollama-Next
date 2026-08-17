<script lang="ts">
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import PlaybookCard from '$lib/components/PlaybookCard.svelte';
	import StoreModal from '$lib/components/StoreModal.svelte';
	import { playbooksStore, settingsStore } from '$lib/localStorage';
	import {
		applyBundleToPlaybook,
		fetchPlaybookBundle,
		installPlaybookBundle,
		loadPlaybookCatalog,
		playbookCatalogState,
		playbookState
	} from '$lib/playbookCatalog';
	import { savePlaybook, type Playbook } from '$lib/playbooks';
	import type { PlaybookCatalogEntry } from '$lib/playbookStore';
	import { copyAction, isEdited, packageAction, type Offer, type OfferView } from '$lib/storeOffer';

	/**
	 * The playbook store.
	 *
	 * Thin on purpose. What a card offers is decided by the rules in `storeOffer`,
	 * the page around it is `StoreModal`, and what is left here is the part that is
	 * genuinely about playbooks: which listing to read, what installing means, and
	 * what a card looks like when the thing on it is a procedure rather than a
	 * character.
	 */
	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let view = $state<OfferView>('store');

	// Opening is what asks for the listing, not mounting: the modal lives on the
	// Library page whether or not anyone opens it.
	$effect(() => {
		if (open) void loadPlaybookCatalog();
	});

	const catalog = $derived($playbookCatalogState);
	const entries = $derived(catalog.status === 'ready' ? catalog.catalog.entries : []);
	const library = $derived($playbooksStore ?? []);

	function entryFor(playbook: Playbook): PlaybookCatalogEntry | undefined {
		const from = playbook.source?.id;
		return from ? entries.find((entry) => entry.id === from) : undefined;
	}

	const stateOf = (playbook: Playbook) =>
		playbookState(playbook, entryFor(playbook)?.contentDigest);

	const copiesOf = (entry: PlaybookCatalogEntry) =>
		library.filter((playbook) => playbook.source?.id === entry.id);

	async function install(entry: PlaybookCatalogEntry) {
		const bundle = await fetchPlaybookBundle(entry);
		installPlaybookBundle(bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.playbookInstalled({ name: entry.name }));
	}

	/**
	 * Put the published text back over a copy.
	 *
	 * It asks first when there is something of yours to lose, because there is no
	 * merge to offer and pretending otherwise would be worse than the question.
	 */
	async function restore(playbook: Playbook, ask: boolean) {
		const entry = entryFor(playbook);
		if (!entry) return;
		if (ask && !confirm($LL.personaStoreUpdateConfirm({ name: playbook.name }))) return;

		const bundle = await fetchPlaybookBundle(entry);
		applyBundleToPlaybook(playbook, bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});
		toast.success($LL.personaStoreUpdated({ name: entry.name }));
	}

	async function toggleOwn(playbook: Playbook) {
		savePlaybook({ ...playbook, shared: !playbook.shared });
	}

	function packageOffer(entry: PlaybookCatalogEntry): Offer<Playbook> {
		const copies = copiesOf(entry);
		const untouched = copies.some((playbook) => !isEdited(stateOf(playbook)));

		return {
			key: `package:${entry.id}`,
			kind: 'package',
			name: entry.name,
			line: entry.summary,
			tags: entry.tags,
			action: packageAction(untouched),
			run: untouched ? undefined : () => install(entry),
			edited: false,
			shared: false,
			toggleShare: async () => {},
			// Enough of a playbook for the card, without the procedure: the listing
			// does not carry it, and a card never shows it.
			item: {
				id: entry.id,
				name: entry.name,
				summary: entry.summary,
				instructions: '#\n'.repeat(entry.steps ?? 0),
				color: entry.color ?? '#888780',
				glyph: entry.glyph,
				tags: entry.tags,
				createdAt: '',
				updatedAt: ''
			}
		};
	}

	function copyOffer(playbook: Playbook): Offer<Playbook> {
		const state = stateOf(playbook);
		const edited = isEdited(state);
		const outdated = state === 'outdated';

		return {
			key: `copy:${playbook.id}`,
			kind: 'copy',
			name: playbook.name,
			line: playbook.summary,
			tags: playbook.tags ?? [],
			action: copyAction(state),
			run: edited || outdated ? () => restore(playbook, edited) : undefined,
			edited,
			shared: !!playbook.shared,
			toggleShare: () => toggleOwn(playbook),
			item: playbook
		};
	}

	const packages = $derived(entries.map(packageOffer));
	/** Written here, or taken and changed. Untouched installs are the store's, not yours. */
	const mine = $derived(
		library
			.filter((playbook) => {
				const state = stateOf(playbook);
				return state === 'own' || isEdited(state);
			})
			.map(copyOffer)
	);

	const offers = $derived(view === 'mine' ? mine : packages);
</script>

<StoreModal
	bind:open
	bind:view
	title={$LL.playbookStore()}
	{offers}
	views={['store', 'mine']}
	layout={$settingsStore.personaStoreLayout}
	status={catalog.status}
	errorMessage={catalog.status === 'error' ? catalog.message : undefined}
	searchPlaceholder={$LL.playbookStoreSearch()}
	emptyMine={$LL.playbookStoreNothingMine()}
	emptyShared={$LL.personaStoreNothingOffered()}
	unreachable={$LL.playbookStoreUnreachable()}
	onRefresh={() => loadPlaybookCatalog(true)}
	onLayout={(layout) => ($settingsStore.personaStoreLayout = layout)}
	{card}
/>

{#snippet card(offer: Offer, actions: import('svelte').Snippet<[Offer]>)}
	<PlaybookCard playbook={offer.item as Playbook}>
		{#snippet trailing()}
			<span class="flex w-28 shrink-0 justify-end">{@render actions(offer)}</span>
		{/snippet}
	</PlaybookCard>
{/snippet}

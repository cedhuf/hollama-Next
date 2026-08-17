<script lang="ts">
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
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
	import { playbookSteps, savePlaybook, type Playbook } from '$lib/playbooks';
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

	function packageOffer(entry: PlaybookCatalogEntry): Offer {
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
			// How long the procedure is, which is all a card shows of it. The listing
			// carries the count rather than the text, so nothing has to be downloaded
			// to draw the shelf.
			meta: $LL.playbookSections({ count: entry.steps ?? 0 })
		};
	}

	function copyOffer(playbook: Playbook): Offer {
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
			meta: $LL.playbookSections({ count: playbookSteps(playbook.instructions) })
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

	/**
	 * Every copy that could take a newer published version right now.
	 *
	 * Untouched ones only, and counted over the library rather than over what is
	 * on screen: the answer must not change because a filter was typed.
	 */
	const updatable = $derived(library.filter((playbook) => stateOf(playbook) === 'outdated'));

	async function updateAll() {
		let done = 0;
		for (const playbook of updatable) {
			try {
				await restore(playbook, false);
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
	title={$LL.playbookStore()}
	{offers}
	views={['store', 'mine']}
	counts={{ mine: mine.length }}
	layout={$settingsStore.personaStoreLayout}
	tint={150}
	status={catalog.status}
	errorMessage={catalog.status === 'error' ? catalog.message : undefined}
	searchPlaceholder={$LL.playbookStoreSearch()}
	emptyMine={$LL.playbookStoreNothingMine()}
	emptyShared={$LL.personaStoreNothingOffered()}
	unreachable={$LL.playbookStoreUnreachable()}
	updatableCount={updatable.length}
	onUpdateAll={updateAll}
	onRefresh={() => loadPlaybookCatalog(true)}
	onLayout={(layout) => ($settingsStore.personaStoreLayout = layout)}
	{card}
/>

{#snippet card(offer: Offer, storeActions: import('svelte').Snippet<[Offer]>)}
	<LibraryCard
		name={offer.name}
		tagline={offer.line}
		tags={offer.tags}
		meta={offer.meta}
		layout={$settingsStore.personaStoreLayout}
	>
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

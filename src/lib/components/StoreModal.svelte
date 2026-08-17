<script lang="ts">
	import {
		ArrowDownToLine,
		Check,
		Download,
		LayoutGrid,
		List,
		LoaderCircle,
		RefreshCw,
		RotateCcw,
		Search,
		Users,
		X
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { matches, type Offer, type OfferAction, type OfferView } from '$lib/storeOffer';

	/**
	 * The store, as a page: search, views, layout, refresh, and a grid of cards.
	 *
	 * Everything here is true of any store — what a view is, what the one button
	 * says, when "update all" appears, what an unreachable store looks like. What
	 * differs between the personas and the playbooks is the card, and the card is
	 * a snippet the caller supplies.
	 *
	 * The offers are built by the caller too, through the rules in `storeOffer`.
	 * That split is deliberate: the machinery that decides what a card offers is
	 * shared and testable, the drawing is per kind, and the shell in the middle
	 * never asks what it is selling.
	 */
	interface Props {
		open: boolean;
		title: string;
		offers: Offer[];
		/** Which views to show. `shared` only where somebody hands things out. */
		views: OfferView[];
		view: OfferView;
		/** How many entries each view holds, so a chip can say so without switching to it. */
		counts?: Partial<Record<OfferView, number>>;
		layout: 'grid' | 'list';
		/** Whether the listing is being fetched, and what went wrong if it did. */
		status: 'idle' | 'loading' | 'ready' | 'error';
		errorMessage?: string;
		/**
		 * The section's turn of the accent, so a card in the store is tinted like the
		 * same card in the library. Degrees as a plain number: see `library-section`.
		 */
		tint?: number;
		searchPlaceholder: string;
		emptyMine: string;
		emptyShared: string;
		unreachable: string;
		onRefresh: () => void;
		onLayout: (layout: 'grid' | 'list') => void;
		/**
		 * How many copies could take a newer published version, and how to take them.
		 *
		 * Counted by the caller rather than from what is on screen: the answer is
		 * about the whole library, and it must not change because a filter is typed
		 * or a view is switched.
		 */
		updatableCount?: number;
		onUpdateAll?: () => Promise<void> | void;
		/**
		 * Whether sharing exists here at all — it does not in local mode, where there
		 * is one person and nobody to share with — and whether this person may.
		 *
		 * Drawn for everyone and refused where it is not allowed, rather than
		 * absent: a card that loses a control depending on who is looking is a
		 * different card, and the two then have to be designed twice.
		 */
		sharing?: boolean;
		shareAllowed?: boolean;
		/**
		 * One card. Handed the offer and the shell's own action row, so the button
		 * is the same button in both stores and only its surroundings differ.
		 */
		card: Snippet<[Offer, Snippet<[Offer]>]>;
	}

	let {
		open = $bindable(false),
		title,
		offers,
		views,
		view = $bindable('store'),
		counts,
		layout,
		status,
		errorMessage,
		tint = 0,
		searchPlaceholder,
		emptyMine,
		emptyShared,
		unreachable,
		onRefresh,
		onLayout,
		updatableCount = 0,
		onUpdateAll,
		sharing = false,
		shareAllowed = false,
		card
	}: Props = $props();

	let query = $state('');
	/** The card being worked on, so only its own button spins. */
	let working = $state<string | null>(null);
	let toggling = $state<string | null>(null);
	let updatingAll = $state(false);

	const filtered = $derived(offers.filter((offer) => matches(offer, query)));

	const layouts = $derived([
		{ value: 'grid' as const, icon: LayoutGrid, label: $LL.personaStoreGridView() },
		{ value: 'list' as const, icon: List, label: $LL.personaStoreListView() }
	]);

	const actionLabel = (action: OfferAction) =>
		action === 'install'
			? $LL.install()
			: action === 'update'
				? $LL.personaStoreUpdate()
				: action === 'restore'
					? $LL.personaStoreReset()
					: $LL.personaStoreInstalled();

	const viewLabel = (name: OfferView) =>
		name === 'store'
			? $LL.personaStoreViewStore()
			: name === 'mine'
				? $LL.personaStoreViewMine()
				: $LL.personaStoreViewShared();

	async function run(offer: Offer) {
		if (!offer.run || working) return;
		working = offer.key;
		try {
			await offer.run();
		} catch (error) {
			toast.error($LL.personaStoreInstallFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			working = null;
		}
	}

	async function share(offer: Offer) {
		toggling = offer.key;
		try {
			await offer.toggleShare();
		} catch (error) {
			toast.error($LL.requestFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			toggling = null;
		}
	}

	async function updateAll() {
		if (!onUpdateAll) return;
		updatingAll = true;
		try {
			await onUpdateAll();
		} finally {
			updatingAll = false;
		}
	}
</script>

{#snippet chip(label: string, active: boolean, onclick: () => void)}
	<button
		type="button"
		{onclick}
		class="shrink-0 rounded-full border px-3 py-1 text-xs transition-colors {active
			? 'border-accent bg-accent/10 text-accent'
			: 'border-shade-3 text-muted hover:border-shade-4 hover:text-active'}"
	>
		{label}
	</button>
{/snippet}

{#snippet actions(offer: Offer)}
	<!-- One button, and what it says was decided when the card was built. Nothing
	     here asks which view it is in. -->
	{#if offer.run}
		<button
			type="button"
			disabled={working !== null}
			onclick={() => run(offer)}
			title={offer.action === 'update'
				? $LL.personaStoreUpdateTooltip()
				: offer.action === 'restore'
					? $LL.personaStoreResetTooltip()
					: undefined}
			class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-50 {offer.action ===
			'update'
				? 'border border-accent text-accent hover:bg-accent/10'
				: 'text-muted hover:bg-shade-2 hover:text-active'}"
		>
			{#if working === offer.key}
				<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
			{:else if offer.action === 'install'}
				<Download class="h-3.5 w-3.5" />
			{:else if offer.action === 'update'}
				<ArrowDownToLine class="h-3.5 w-3.5" />
			{:else}
				<RotateCcw class="h-3.5 w-3.5" />
			{/if}
			{actionLabel(offer.action)}
		</button>
	{:else}
		<!-- A statement rather than a control: you have it, and installing it again
		     would hand you what you already hold. -->
		<span
			class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs text-muted"
		>
			<Check class="h-3.5 w-3.5" />
			{actionLabel(offer.action)}
		</span>
	{/if}

	{#if sharing}
		{@const label = !shareAllowed
			? $LL.personaStoreShareForbidden()
			: offer.shared
				? $LL.personaStoreUnshare()
				: $LL.personaStoreShare()}
		<Tooltip>
			{#snippet trigger({ props })}
				<button
					{...props}
					type="button"
					disabled={toggling !== null || !shareAllowed}
					onclick={() => share(offer)}
					aria-pressed={offer.shared}
					aria-label={label}
					class="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 {offer.shared
						? 'bg-accent/10 text-accent hover:bg-accent/20'
						: 'text-muted hover:bg-shade-2 hover:text-active'}"
				>
					{#if toggling === offer.key}
						<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<Users class="h-3.5 w-3.5" />
					{/if}
				</button>
			{/snippet}
			{label}
		</Tooltip>
	{/if}
{/snippet}

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">{title}</span>
			<div class="flex shrink-0 items-center gap-1">
				{#if updatableCount > 0 && onUpdateAll}
					<button
						type="button"
						disabled={updatingAll}
						onclick={updateAll}
						class="flex items-center gap-1.5 rounded-lg border border-accent px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
					>
						{#if updatingAll}
							<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
						{:else}
							<ArrowDownToLine class="h-3.5 w-3.5" />
						{/if}
						{$LL.personaStoreUpdateAll()}
						<span class="opacity-70">{updatableCount}</span>
					</button>
				{/if}
				<button
					type="button"
					onclick={onRefresh}
					aria-label={$LL.personaStoreRefresh()}
					title={$LL.personaStoreRefresh()}
					class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				>
					<RefreshCw class="h-4 w-4 {status === 'loading' ? 'animate-spin' : ''}" />
				</button>
				<button
					type="button"
					onclick={() => (open = false)}
					aria-label={$LL.close()}
					class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<!-- Search and filters above the grid rather than beside it: a phone has no
		     room for a sidebar of facets, and the same row works at every width. -->
		<div class="shrink-0 border-b border-shade-2 px-4 py-3">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
				<input
					bind:value={query}
					type="search"
					placeholder={searchPlaceholder}
					class="settings-field w-full pl-9"
				/>
			</div>

			<div class="mt-2 flex items-start gap-2">
				<div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
					<!-- Views, not filters. They are not the same control wearing two hats:
					     a view decides what the page is about, a filter narrows what is
					     already there. -->
					{#each views as name (name)}
						{@const count = counts?.[name] ?? 0}
						{@render chip(
							`${viewLabel(name)}${count ? ` · ${count}` : ''}`,
							view === name,
							() => (view = name)
						)}
					{/each}
				</div>

				<!-- At the end of the filters, because it is one: how much of each entry
				     you want to see at a time. -->
				<div class="flex shrink-0 items-center rounded-lg border border-shade-3 p-0.5">
					{#each layouts as option (option.value)}
						<button
							type="button"
							onclick={() => onLayout(option.value)}
							aria-label={option.label}
							title={option.label}
							aria-pressed={layout === option.value}
							class="rounded-md p-1.5 transition-colors {layout === option.value
								? 'bg-shade-2 text-active'
								: 'text-muted hover:text-active'}"
						>
							<option.icon class="h-4 w-4" />
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-auto p-4">
			{#if status === 'loading' && offers.length === 0}
				<div class="flex h-full items-center justify-center text-muted">
					<LoaderCircle class="h-5 w-5 animate-spin" />
				</div>
			{:else if status === 'error' && offers.length === 0}
				<!-- Nothing ships inside the app, so an unreachable store is an empty
				     library. Say which of the two it is, and offer the retry. -->
				<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
					<p class="text-sm text-muted">{unreachable}</p>
					{#if errorMessage}
						<p class="max-w-[40ch] text-xs text-muted">{errorMessage}</p>
					{/if}
					<button
						type="button"
						onclick={onRefresh}
						class="rounded-lg border border-shade-3 px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-active"
					>
						{$LL.personaStoreRefresh()}
					</button>
				</div>
			{:else if filtered.length === 0}
				<p class="pt-8 text-center text-sm text-muted">
					{#if query.trim()}
						{$LL.noMatches()}
					{:else if view === 'shared'}
						{emptyShared}
					{:else if view === 'mine'}
						{emptyMine}
					{:else}
						{$LL.noMatches()}
					{/if}
				</p>
			{:else}
				<div
					class="library-section {layout === 'list'
						? 'flex flex-col gap-2'
						: 'grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3'}"
					style="--section-turn: {tint}"
				>
					{#each filtered as offer (offer.key)}
						{@render card(offer, actions)}
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>

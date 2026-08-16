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
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import Modal from '$lib/components/Modal.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { applyBundleToPersona, avatarFields, installPersonaBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { installPersona, personaOrigin, savePersona, type Persona } from '$lib/personas';
	import { personasConfig, publishSharedPersonas, relayCatalogPersona } from '$lib/personasConfig';
	import { personaState, type PersonaState } from '$lib/personaState';
	import type { CatalogEntry } from '$lib/personaStore';

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
	 */
	type OfferKind = 'package' | 'copy';

	/** What the one button in the footer does. Computed once, per card. */
	type Action = 'install' | 'installed' | 'restore' | 'update';

	interface Offer {
		key: string;
		kind: OfferKind;
		name: string;
		tagline: string;
		avatar: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
		tags: string[];
		action: Action;
		/** Absent for `installed`, which is a statement rather than a control. */
		run?: () => Promise<void>;
		/** Only a copy you have changed carries a label, and it is the only label. */
		edited: boolean;
		shared: boolean;
		toggleShare: () => Promise<void>;
	}

	/**
	 * What you are looking at.
	 *
	 * Two for everyone: what you can install, and what is yours. A third for an
	 * administrator, because only somebody who hands personas out has a list of
	 * what they hand out.
	 */
	type View = 'store' | 'mine' | 'shared';

	let view = $state<View>('store');
	let query = $state('');
	/** The card being worked on, so only its own button spins. */
	let working = $state<string | null>(null);
	let sharing = $state<string | null>(null);

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
	function packageOffer(entry: CatalogEntry): Offer {
		const copies = copiesOf(entry);
		const untouched = copies.some((persona) => !isEdited(stateOf(persona)));

		return {
			key: `package:${entry.id}`,
			kind: 'package',
			name: entry.name,
			tagline: entry.tagline,
			avatar: avatarFields(entry.avatar, entry.name),
			tags: entry.tags,
			action: untouched ? 'installed' : 'install',
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
	function copyOffer(persona: Persona): Offer {
		const state = stateOf(persona);
		const edited = isEdited(state);
		const outdated = state === 'outdated';

		return {
			key: `copy:${persona.id}`,
			kind: 'copy',
			name: persona.name,
			tagline: persona.tagline,
			avatar: {
				avatarColor: persona.avatarColor,
				avatarGlyph: persona.avatarGlyph,
				avatarImage: persona.avatarImage
			},
			tags: persona.tags ?? [],
			action: edited ? 'restore' : outdated ? 'update' : 'installed',
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
				(persona): Offer => ({
					key: `shared:${persona.id}`,
					kind: 'package',
					name: persona.name,
					tagline: persona.tagline,
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

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return offers;
		return offers.filter(
			(offer) =>
				offer.name.toLowerCase().includes(q) ||
				offer.tagline.toLowerCase().includes(q) ||
				offer.tags.some((tag) => tag.toLowerCase().includes(q))
		);
	});

	/**
	 * Every copy that could take a newer published version right now.
	 *
	 * Untouched ones only. Offering "update all" and having it quietly overwrite
	 * everything someone had rewritten would be the one press nobody could undo.
	 */
	const updatable = $derived(library.filter((persona) => stateOf(persona) === 'outdated'));

	let updatingAll = $state(false);
	async function updateAll() {
		updatingAll = true;
		let done = 0;
		try {
			for (const persona of updatable) {
				try {
					await restore(persona, false);
					done += 1;
				} catch {
					// One that will not fetch is not a reason to stop the rest.
				}
			}
			toast.success($LL.personaStoreUpdatedAll({ count: done }));
		} finally {
			updatingAll = false;
		}
	}

	async function run(offer: Offer) {
		if (!offer.run) return;
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
		sharing = offer.key;
		try {
			await offer.toggleShare();
		} catch (error) {
			toast.error($LL.requestFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			sharing = null;
		}
	}

	const layouts = $derived([
		{ value: 'grid' as const, icon: LayoutGrid, label: $LL.personaStoreGridView() },
		{ value: 'list' as const, icon: List, label: $LL.personaStoreListView() }
	]);

	const actionLabel = (action: Action) =>
		action === 'install'
			? $LL.install()
			: action === 'installed'
				? $LL.personaStoreInstalled()
				: action === 'update'
					? $LL.personaStoreUpdate()
					: $LL.personaStoreReset();
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

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<!-- Header: the same shape as every other dialog's, so the close is where it
		     always is and the title reads before the controls. -->
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">{$LL.personaStore()}</span>
			<div class="flex shrink-0 items-center gap-1">
				<!-- Only when there is something to do, and never for the ones you have
				     edited: a single press that quietly overwrote everything someone had
				     rewritten would be the one nobody could undo. -->
				{#if updatable.length > 0}
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
						<span class="opacity-70">{updatable.length}</span>
					</button>
				{/if}
				<button
					type="button"
					onclick={() => loadCatalog(true)}
					aria-label={$LL.personaStoreRefresh()}
					title={$LL.personaStoreRefresh()}
					class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				>
					<RefreshCw class="h-4 w-4 {catalog.status === 'loading' ? 'animate-spin' : ''}" />
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

		<!-- Search and filters, above the grid rather than beside it: a phone has no
		     room for a sidebar of facets, and the same row works at every width.
		     A filter with one possible value is not a choice, so it is not drawn. -->
		<div class="shrink-0 border-b border-shade-2 px-4 py-3">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
				<input
					bind:value={query}
					type="search"
					placeholder={$LL.personaStoreSearch()}
					class="settings-field w-full pl-9"
				/>
			</div>

			<div class="mt-2 flex items-start gap-2">
				<div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
					<!-- Views, not filters. They are not the same control wearing two hats:
					     a view decides what the page is about, a filter narrows what is
					     already there. The third is an administrator's, because only
					     somebody who hands personas out has a list of what they hand out. -->
					{@render chip($LL.personaStoreViewStore(), view === 'store', () => (view = 'store'))}
					{@render chip(
						`${$LL.personaStoreViewMine()}${mine.length ? ` · ${mine.length}` : ''}`,
						view === 'mine',
						() => (view = 'mine')
					)}
					{#if $personasConfig.canShare}
						{@render chip(
							`${$LL.personaStoreViewShared()}${offered.length ? ` · ${offered.length}` : ''}`,
							view === 'shared',
							() => (view = 'shared')
						)}
					{/if}
				</div>

				<!-- At the end of the filters, because it is one: how much of each entry
				     you want to see at a time. Remembered, since it is a reading habit
				     rather than a decision about this particular visit. -->
				<div class="flex shrink-0 items-center rounded-lg border border-shade-3 p-0.5">
					{#each layouts as option (option.value)}
						<button
							type="button"
							onclick={() => ($settingsStore.personaStoreLayout = option.value)}
							aria-label={option.label}
							title={option.label}
							aria-pressed={$settingsStore.personaStoreLayout === option.value}
							class="rounded-md p-1.5 transition-colors {$settingsStore.personaStoreLayout ===
							option.value
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
			{#if catalog.status === 'loading'}
				<div class="flex h-full items-center justify-center text-muted">
					<LoaderCircle class="h-5 w-5 animate-spin" />
				</div>
			{:else if catalog.status === 'error' && offers.length === 0}
				<!-- Nothing ships inside the app, so an unreachable store is an empty
				     library. Say which of the two it is, and offer the retry. -->
				<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
					<p class="text-sm text-muted">{$LL.personaStoreUnreachable()}</p>
					<p class="max-w-[40ch] text-xs text-muted">{catalog.message}</p>
					<button
						type="button"
						onclick={() => loadCatalog(true)}
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
						{$LL.personaStoreNothingOffered()}
					{:else if view === 'mine'}
						{$LL.personaStoreNothingMine()}
					{:else}
						{$LL.noMatches()}
					{/if}
				</p>
			{:else}
				<div
					class={$settingsStore.personaStoreLayout === 'list'
						? 'flex flex-col gap-2'
						: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3'}
				>
					{#each filtered as offer (offer.key)}
						<PersonaCard
							name={offer.name}
							tagline={offer.tagline}
							avatar={offer.avatar}
							tags={offer.tags}
							layout={$settingsStore.personaStoreLayout}
						>
							<!-- One label, on one kind of card. A copy you have changed is the
							     only thing here that is not simply what it says it is, so it is the
							     only thing that says so. Everything else the card could announce
							     is already in the button under it. -->
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
								<!-- One button, and what it says was decided when the card was
								     built. Nothing here asks which view it is in. -->
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
									<!-- A statement rather than a control: you have it, and installing
									     it again would hand you what you already hold. -->
									<span
										class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs text-muted"
									>
										<Check class="h-3.5 w-3.5" />
										{actionLabel(offer.action)}
									</span>
								{/if}

								<!-- Drawn for everyone and refused where it is not allowed, rather
								     than absent: a card that loses a control depending on who is
								     looking is a different card, and the two then have to be
								     designed twice. Hidden only where sharing is not a thing at
								     all, which is local mode: one person, nobody to share with. -->
								{#if isServerMode}
									{@const allowed = $personasConfig.canShare}
									{@const label = !allowed
										? $LL.personaStoreShareForbidden()
										: offer.shared
											? $LL.personaStoreUnshare()
											: $LL.personaStoreShare()}
									<Tooltip>
										{#snippet trigger({ props })}
											<button
												{...props}
												type="button"
												disabled={sharing !== null || !allowed}
												onclick={() => share(offer)}
												aria-pressed={offer.shared}
												aria-label={label}
												class="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 {offer.shared
													? 'bg-accent/10 text-accent hover:bg-accent/20'
													: 'text-muted hover:bg-shade-2 hover:text-active'}"
											>
												{#if sharing === offer.key}
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
						</PersonaCard>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>

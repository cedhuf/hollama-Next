<script lang="ts">
	import {
		ArrowDownToLine,
		Check,
		Download,
		LayoutGrid,
		List,
		LoaderCircle,
		RefreshCw,
		Search,
		Users,
		X
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { avatarFields, installPersonaBundle, personaFromBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { contentDigest, personaAuthored } from '$lib/personaDigest';
	import { installPersona, personaOrigin, savePersona, type Persona } from '$lib/personas';
	import { personasConfig, publishSharedPersonas, relayCatalogPersona } from '$lib/personasConfig';
	import { offeredVersion, personaState, type PersonaState } from '$lib/personaState';
	import type { CatalogEntry } from '$lib/personaStore';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	/**
	 * One card, whatever it came from.
	 *
	 * The store and the personas an administrator shares with their instance are
	 * two different places, and were two different grids on the page. That is one
	 * grid too many: the question a reader has is "what can I add?", and answering
	 * it twice means reading both, searching both, and knowing beforehand which
	 * kind of thing they were after. Provenance is a label and a filter here, not a
	 * second page.
	 */
	type Origin = 'official' | 'community' | 'admin';

	interface Offer {
		key: string;
		name: string;
		tagline: string;
		avatar: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
		tags: string[];
		author?: string;
		origin: Origin;
		/**
		 * What the library holds of it, if anything.
		 *
		 * Not a boolean any more: "installed" is four states once a persona can be
		 * edited and the store can publish a new revision, and the card has something
		 * different to say in each.
		 */
		state?: PersonaState;
		install: () => Promise<void>;
		/** Take the published version over the installed one. */
		update?: () => Promise<void>;
		/** For an admin's own offer: is this the store's persona, or their rewrite. */
		version?: 'own' | 'same' | 'modified';
		/**
		 * Whether this instance relays it, for an admin, and only for the store's
		 * own: what an admin wrote is shared from its own editor, and what is already
		 * shared with them is not theirs to hand on.
		 */
		relayed?: boolean;
		toggleRelay?: () => Promise<void>;
	}

	/**
	 * What an admin is looking at, and the whole of the curation interface.
	 *
	 * Sharing used to be two gestures in two places, a checkbox in a persona's
	 * editor and a button on a store card, with nowhere at all that listed the
	 * result. So nobody could answer "what am I actually offering?", which is the
	 * only question an administrator has.
	 *
	 * One place now, with three views: the store to browse, their own personas to
	 * hand out, and everything currently offered. The same button in all three.
	 *
	 * A user sees none of this. Their store is one list, composed for them.
	 */
	type View = 'store' | 'mine' | 'shared';

	let view = $state<View>('store');
	let query = $state('');
	let origin = $state<Origin | 'all'>('all');
	/** The card being worked on, so only its own button spins. */
	let installing = $state<string | null>(null);
	let relaying = $state<string | null>(null);

	// Opening is what asks for the listing, not mounting: the modal lives on the
	// Library page whether or not anyone opens it, and a page load is not a reason
	// to go and fetch a catalogue nobody asked to see.
	$effect(() => {
		if (open) void loadCatalog();
	});

	const catalog = $derived($catalogState);
	const entries = $derived(catalog.status === 'ready' ? catalog.catalog.entries : []);

	/** What the library already holds, by the id it was installed from. */
	const installedIds = $derived(
		new Map(
			($personasStore ?? [])
				.map((p) => [personaOrigin(p), p] as const)
				.filter((pair): pair is [string, Persona] => !!pair[0])
		)
	);

	/**
	 * And by name, for the ones that predate the store.
	 *
	 * Four personas used to be written into the library at boot, so anyone who has
	 * been here a while already has a Max and a Nova with no provenance at all.
	 * Matched by id alone the store would offer them a second copy of each, which
	 * is a poor showing from a page whose whole job is to say what you have and
	 * what you do not.
	 */
	const byName = $derived(
		new Map(($personasStore ?? []).map((p) => [p.name.trim().toLowerCase(), p] as const))
	);

	/** The copy in the library that answers for a catalogue entry, if there is one. */
	function installedCopy(id: string, name: string): Persona | undefined {
		return installedIds.get(id) ?? byName.get(name.trim().toLowerCase());
	}

	/** The store personas this instance relays, so a card can untick it. */
	const relayed = $derived(new Set($personasConfig.sharedFromStore));

	/**
	 * Offer one of your own personas, or stop.
	 *
	 * The flag lives on the persona, as it always did; what changed is where it is
	 * reached from. It was a checkbox buried in an editor, which is why an admin
	 * had to remember which of their personas they had ticked.
	 */
	async function toggleOwn(persona: Persona) {
		savePersona({ ...persona, shared: !persona.shared });
		await publishSharedPersonas();
	}

	async function installEntry(entry: CatalogEntry) {
		const bundle = await fetchBundle(entry);
		installPersonaBundle(bundle, { origin: entry.origin, id: entry.id, revision: entry.revision });
		toast.success($LL.installedPersona({ name: entry.name }));
	}

	/**
	 * Take the published version over the one in the library.
	 *
	 * The authored fields are replaced and everything of yours is kept: the id, the
	 * model you chose, the conversation you are having with it, the knowledge you
	 * attached. Updating a persona is not reinstalling it.
	 *
	 * When you have edited it, this replaces your edits, so it asks first. There is
	 * no merge to offer and pretending otherwise would be worse than the question.
	 */
	async function updateEntry(entry: CatalogEntry, persona: Persona, edited: boolean) {
		if (edited && !confirm($LL.personaStoreUpdateConfirm({ name: persona.name }))) return;

		const bundle = await fetchBundle(entry);
		const fresh = personaFromBundle(bundle, {
			origin: entry.origin,
			id: entry.id,
			revision: entry.revision
		});

		savePersona({
			...persona,
			name: fresh.name,
			tagline: fresh.tagline,
			avatarColor: fresh.avatarColor,
			avatarGlyph: fresh.avatarGlyph,
			avatarImage: fresh.avatarImage,
			systemPrompt: fresh.systemPrompt,
			greeting: fresh.greeting,
			params: fresh.params,
			webSearch: fresh.webSearch,
			suggestions: fresh.suggestions,
			tags: fresh.tags,
			source: fresh.source
		});
		toast.success($LL.personaStoreUpdated({ name: fresh.name }));
	}

	/**
	 * What the catalogue contributes, which is not always all of it.
	 *
	 * On a curated instance a user's store holds what their administrator offers
	 * and nothing else. The door is the same door, in the same place, with the same
	 * gestures; only what is behind it is the instance's decision. That is what
	 * replaced a permission switch and a grid of locked cards, which showed people
	 * a catalogue in order to refuse it to them.
	 *
	 * An admin always gets the whole thing, because it is what they choose from.
	 */
	const curated = $derived($personasConfig.storeMode === 'curated');

	const fromCatalog = $derived(
		entries
			.filter((entry) => !curated || relayed.has(entry.id))
			.map((entry): Offer => {
				const copy = installedCopy(entry.id, entry.name);
				const state = copy ? personaState(copy, entry.contentDigest) : undefined;
				const stale = state === 'outdated' || state === 'edited-outdated';

				return {
					key: `catalog:${entry.id}`,
					name: entry.name,
					tagline: entry.tagline,
					avatar: avatarFields(entry.avatar, entry.name),
					tags: entry.tags,
					author: entry.author,
					origin: entry.origin,
					state,
					install: () => installEntry(entry),
					update:
						stale && copy ? () => updateEntry(entry, copy, state === 'edited-outdated') : undefined,
					relayed: relayed.has(entry.id),
					toggleRelay: $personasConfig.canShare
						? () => relayCatalogPersona(entry.id, !relayed.has(entry.id))
						: undefined
				};
			})
	);

	/**
	 * The personas the admin wrote and shared, which are objects of their own.
	 *
	 * Not the ones they relay: a relay is a reference to a store persona, so it is
	 * already on this page, once, with its own badge. Copying it into a second card
	 * is exactly the duplicate this list used to produce, and the copy carried the
	 * "shared by admin" label into the place the "official" one belonged.
	 *
	 * An admin who installs a store persona and rewrites it does get a card of
	 * their own here, and should: that is their persona now, not the store's.
	 */
	const fromAdmin = $derived(
		$personasConfig.shared.map(
			(persona): Offer => ({
				key: `admin:${persona.id}`,
				name: persona.name,
				tagline: persona.tagline,
				avatar: {
					avatarColor: persona.avatarColor,
					avatarGlyph: persona.avatarGlyph,
					avatarImage: persona.avatarImage
				},
				tags: persona.tags ?? [],
				origin: 'admin',
				// The published fingerprint is the admin's persona as it stands now, so
				// their edits reach the people who installed it exactly the way a store
				// revision does: as an update on offer, never applied behind anyone.
				state: (() => {
					const copy =
						installedIds.get(persona.id) ?? ($personasStore ?? []).find((p) => p.id === persona.id);
					return copy ? personaState(copy, contentDigest(personaAuthored(persona))) : undefined;
				})(),
				install: async () => {
					installPersona(persona);
					toast.success($LL.installedPersona({ name: persona.name }));
				},
				// Deduced from the listing alone: recompute what they are handing out and
				// compare it with what the store publishes. No flag to set, and editing
				// it back makes it the store's persona again instead of leaving a mark
				// that lies.
				version: offeredVersion(persona, entries)
			})
		)
	);

	/**
	 * The admin's own personas, offered or not.
	 *
	 * Untouched installs are left out on purpose: handing out a byte-identical copy
	 * of a store persona is worse than relaying it, since the copy freezes and its
	 * takers never see the next revision. Those are already in the store view, with
	 * the same button, doing the better thing.
	 */
	const mine = $derived(
		($personasStore ?? [])
			.filter((persona) => personaState(persona, publishedDigest(persona)) !== 'clean')
			.map(
				(persona): Offer => ({
					key: `mine:${persona.id}`,
					name: persona.name,
					tagline: persona.tagline,
					avatar: {
						avatarColor: persona.avatarColor,
						avatarGlyph: persona.avatarGlyph,
						avatarImage: persona.avatarImage
					},
					tags: persona.tags ?? [],
					origin: 'admin',
					install: async () => {},
					relayed: persona.shared,
					toggleRelay: () => toggleOwn(persona),
					version: offeredVersion(persona, entries)
				})
			)
	);

	const publishedDigest = (persona: Persona) =>
		entries.find((entry) => entry.id === personaOrigin(persona))?.contentDigest;

	/** Everything this instance currently offers, whichever way it got there. */
	const offered = $derived([...fromAdmin, ...fromCatalog.filter((offer) => offer.relayed)]);

	/**
	 * What the grid shows.
	 *
	 * An admin picks a view. Everyone else gets one list, composed for them: the
	 * catalogue their instance allows, plus whatever it offers on top.
	 */
	const offers = $derived(
		!$personasConfig.canShare
			? [...fromAdmin, ...fromCatalog]
			: view === 'mine'
				? mine
				: view === 'shared'
					? offered
					: fromCatalog
	);

	/**
	 * Only offered when there is something to choose between.
	 *
	 * There is no language filter, and that is a decision rather than an omission:
	 * a persona is written in one language and answers in whichever you ask it to,
	 * so what it was written in tells a reader nothing about whether it is for
	 * them. Models stopped being monolingual; the filter followed.
	 */
	const origins = $derived([...new Set(offers.map((o) => o.origin))]);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return offers.filter((offer) => {
			if (origin !== 'all' && offer.origin !== origin) return false;
			if (!q) return true;
			return (
				offer.name.toLowerCase().includes(q) ||
				offer.tagline.toLowerCase().includes(q) ||
				offer.tags.some((tag) => tag.toLowerCase().includes(q))
			);
		});
	});

	function originLabel(value: Origin): string {
		if (value === 'admin') return $LL.sharedByAdmin();
		return value === 'community' ? $LL.personaStoreCommunity() : $LL.personaStoreOfficial();
	}

	async function run(offer: Offer, update = false) {
		installing = offer.key;
		try {
			await (update ? offer.update?.() : offer.install());
		} catch (error) {
			toast.error($LL.personaStoreInstallFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			installing = null;
		}
	}

	async function relay(offer: Offer) {
		relaying = offer.key;
		try {
			await offer.toggleRelay?.();
		} catch (error) {
			toast.error($LL.requestFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			relaying = null;
		}
	}

	const layouts = $derived([
		{ value: 'grid' as const, icon: LayoutGrid, label: $LL.personaStoreGridView() },
		{ value: 'list' as const, icon: List, label: $LL.personaStoreListView() }
	]);
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
					<!-- An admin gets views, everyone else gets filters. They are not the
					     same control wearing two hats: a view decides what the page is
					     about, a filter narrows what is already there. -->
					{#if $personasConfig.canShare}
						{@render chip($LL.personaStoreViewStore(), view === 'store', () => (view = 'store'))}
						{@render chip(
							`${$LL.personaStoreViewMine()}${mine.length ? ` · ${mine.length}` : ''}`,
							view === 'mine',
							() => (view = 'mine')
						)}
						{@render chip(
							`${$LL.personaStoreViewShared()}${offered.length ? ` · ${offered.length}` : ''}`,
							view === 'shared',
							() => (view = 'shared')
						)}
					{:else if origins.length > 1}
						{@render chip($LL.personaStoreAll(), origin === 'all', () => (origin = 'all'))}
						{#each origins as value (value)}
							{@render chip(originLabel(value), origin === value, () => (origin = value))}
						{/each}
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
							meta={offer.version === 'modified'
								? $LL.personaOfferedVersionModified()
								: offer.version === 'same'
									? $LL.personaOfferedVersionSame()
									: undefined}
							layout={$settingsStore.personaStoreLayout}
						>
							<!-- No badge at all. An admin's three views each hold one kind of
							     thing, so a label repeating the view is noise; and for a user, what
							     a persona is called and what it says is what they are choosing on,
							     not who published it. Provenance stays where it is a choice rather
							     than a decoration: the filter above. -->
							{#snippet actions()}
								<!-- In "my personas" there is nothing to install: it is already
								     yours, and the only control that matters is the one that hands
								     it out. So it takes the whole footer and says what it does in
								     words rather than in an icon. -->
								{#if view === 'mine'}
									<button
										type="button"
										disabled={relaying !== null}
										onclick={() => relay(offer)}
										aria-pressed={offer.relayed}
										class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-50 {offer.relayed
											? 'bg-accent/10 text-accent hover:bg-accent/20'
											: 'text-muted hover:bg-shade-2 hover:text-active'}"
									>
										{#if relaying === offer.key}
											<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
										{:else}
											<Users class="h-3.5 w-3.5" />
										{/if}
										{offer.relayed ? $LL.shared() : $LL.share()}
									</button>
								{:else}
									{#if offer.update}
										<button
											type="button"
											disabled={installing !== null}
											onclick={() => run(offer, true)}
											class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-accent px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
										>
											{#if installing === offer.key}
												<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
											{:else}
												<ArrowDownToLine class="h-3.5 w-3.5" />
											{/if}
											{$LL.personaStoreUpdate()}
										</button>
									{:else if offer.state}
										<span
											class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs text-muted"
										>
											<Check class="h-3.5 w-3.5" />
											{offer.state === 'edited'
												? $LL.personaStoreInstalledEdited()
												: $LL.personaStoreInstalled()}
										</span>
									{:else}
										<button
											type="button"
											disabled={installing !== null}
											onclick={() => run(offer)}
											class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-shade-2 hover:text-active"
										>
											{#if installing === offer.key}
												<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
											{:else}
												<Download class="h-3.5 w-3.5" />
											{/if}
											{$LL.install()}
										</button>
									{/if}

									{#if offer.toggleRelay}
										{@const label = offer.relayed
											? $LL.personaStoreUnshare()
											: $LL.personaStoreShare()}
										<Tooltip>
											{#snippet trigger({ props })}
												<button
													{...props}
													type="button"
													disabled={relaying !== null}
													onclick={() => relay(offer)}
													aria-pressed={offer.relayed}
													aria-label={label}
													class="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 {offer.relayed
														? 'bg-accent/10 text-accent hover:bg-accent/20'
														: 'text-muted hover:bg-shade-2 hover:text-active'}"
												>
													{#if relaying === offer.key}
														<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
													{:else}
														<Users class="h-3.5 w-3.5" />
													{/if}
												</button>
											{/snippet}
											{label}
										</Tooltip>
									{/if}
								{/if}
							{/snippet}
						</PersonaCard>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>

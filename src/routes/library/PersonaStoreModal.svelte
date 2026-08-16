<script lang="ts">
	import {
		Check,
		Download,
		LayoutGrid,
		List,
		LoaderCircle,
		Lock,
		RefreshCw,
		Search,
		Users,
		X
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { avatarFields, installPersonaBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { installPersona, personaOrigin, type Persona } from '$lib/personas';
	import { personasConfig, relayCatalogPersona } from '$lib/personasConfig';
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
		locale?: string;
		author?: string;
		origin: Origin;
		/** Already in the library, so the card says so instead of offering it again. */
		installed: boolean;
		install: () => Promise<void>;
		/**
		 * Whether this instance relays it, for an admin, and only for the store's
		 * own: what an admin wrote is shared from its own editor, and what is already
		 * shared with them is not theirs to hand on.
		 */
		relayed?: boolean;
		toggleRelay?: () => Promise<void>;
		/**
		 * Whether this one may be taken.
		 *
		 * Per offer rather than once for the page: an instance that has turned the
		 * public store off is saying "take what I offer you", not "take nothing", so
		 * what the admin shares or relays stays reachable inside the same catalogue.
		 */
		installable: boolean;
	}

	let query = $state('');
	let origin = $state<Origin | 'all'>('all');
	let locale = $state('all');
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
		new Set(($personasStore ?? []).map((p) => personaOrigin(p)).filter((id): id is string => !!id))
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
	const installedNames = $derived(
		new Set(($personasStore ?? []).map((p) => p.name.trim().toLowerCase()).filter(Boolean))
	);

	const isInstalled = (id: string, name: string) =>
		installedIds.has(id) || installedNames.has(name.trim().toLowerCase());

	/** The store personas this instance relays, so a card can say so and untick it. */
	const relayed = $derived(new Set($personasConfig.sharedFromStore));

	async function installEntry(entry: CatalogEntry) {
		const bundle = await fetchBundle(entry);
		installPersonaBundle(bundle, { origin: entry.origin, id: entry.id, revision: entry.revision });
		toast.success($LL.installedPersona({ name: entry.name }));
	}

	const fromCatalog = $derived(
		entries.map(
			(entry): Offer => ({
				key: `catalog:${entry.id}`,
				name: entry.name,
				tagline: entry.tagline,
				avatar: avatarFields(entry.avatar, entry.name),
				tags: entry.tags,
				locale: entry.locale,
				author: entry.author,
				origin: entry.origin,
				installed: isInstalled(entry.id, entry.name),
				install: () => installEntry(entry),
				installable: $personasConfig.canInstall || relayed.has(entry.id),
				relayed: relayed.has(entry.id),
				toggleRelay: $personasConfig.canShare
					? () => relayCatalogPersona(entry.id, !relayed.has(entry.id))
					: undefined
			})
		)
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
				installed:
					installedIds.has(persona.id) || ($personasStore ?? []).some((p) => p.id === persona.id),
				install: async () => {
					installPersona(persona);
					toast.success($LL.installedPersona({ name: persona.name }));
				},
				installable: true
			})
		)
	);

	const offers = $derived([...fromAdmin, ...fromCatalog]);

	/** Only offered when there is something to choose between. */
	const origins = $derived([...new Set(offers.map((o) => o.origin))]);
	const locales = $derived([...new Set(offers.map((o) => o.locale).filter(Boolean))] as string[]);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return offers.filter((offer) => {
			if (origin !== 'all' && offer.origin !== origin) return false;
			if (locale !== 'all' && offer.locale !== locale) return false;
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

	async function run(offer: Offer) {
		installing = offer.key;
		try {
			await offer.install();
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
					{#if origins.length > 1}
						{@render chip($LL.personaStoreAll(), origin === 'all', () => (origin = 'all'))}
						{#each origins as value (value)}
							{@render chip(originLabel(value), origin === value, () => (origin = value))}
						{/each}
					{/if}
					{#if locales.length > 1}
						{#each locales as value (value)}
							{@render chip(value.toUpperCase(), locale === value, () =>
								locale === value ? (locale = 'all') : (locale = value)
							)}
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
				<p class="pt-8 text-center text-sm text-muted">{$LL.noMatches()}</p>
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
							meta={offer.author}
							layout={$settingsStore.personaStoreLayout}
						>
							{#snippet badges()}
								<span
									class="rounded-full px-2 py-0.5 text-[10px] font-medium {offer.origin ===
									'official'
										? 'bg-accent/10 text-accent'
										: 'bg-shade-2 text-muted'}"
								>
									{originLabel(offer.origin)}
								</span>
								{#if offer.relayed}
									<span
										class="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive"
										title={$LL.personaStoreRelayed()}
									>
										{$LL.personaStoreRelayedShort()}
									</span>
								{/if}
							{/snippet}

							{#snippet actions()}
								{#if offer.installed}
									<span
										class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-muted"
									>
										<Check class="h-3.5 w-3.5" />
										{$LL.personaStoreInstalled()}
									</span>
								{:else if !offer.installable}
									<!-- Shown rather than hidden. Someone who cannot install still
									     benefits from seeing what exists and from being told who to
									     ask; a store that silently loses most of its contents just
									     looks broken. -->
									<span
										class="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted opacity-50"
										title={$LL.personaStoreInstallDisabled()}
									>
										<Lock class="h-3.5 w-3.5" />
										{$LL.install()}
									</span>
								{:else}
									<button
										type="button"
										disabled={installing !== null}
										onclick={() => run(offer)}
										class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-active disabled:opacity-50"
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
									<button
										type="button"
										disabled={relaying !== null}
										onclick={() => relay(offer)}
										aria-pressed={offer.relayed}
										title={offer.relayed ? $LL.personaStoreUnshare() : $LL.personaStoreShare()}
										aria-label={offer.relayed ? $LL.personaStoreUnshare() : $LL.personaStoreShare()}
										class="flex shrink-0 items-center justify-center rounded-lg border px-2 py-1.5 transition-colors disabled:opacity-50 {offer.relayed
											? 'border-accent bg-accent/10 text-accent'
											: 'border-shade-3 text-muted hover:border-accent hover:text-active'}"
									>
										{#if relaying === offer.key}
											<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
										{:else}
											<Users class="h-3.5 w-3.5" />
										{/if}
									</button>
								{/if}
							{/snippet}
						</PersonaCard>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>

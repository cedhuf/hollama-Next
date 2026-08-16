<script lang="ts">
	import { Check, Download, LoaderCircle, Lock, RefreshCw, Search, Users, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { personasStore } from '$lib/localStorage';
	import { avatarFields, installPersonaBundle, personaFromBundle } from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import { installPersona, personaOrigin, type Persona } from '$lib/personas';
	import { personasConfig, sharePersona, unsharePersona } from '$lib/personasConfig';
	import type { CatalogEntry } from '$lib/personaStore';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	/**
	 * One card, whatever it came from.
	 *
	 * The store and the personas an administrator shares with their instance are
	 * two different places, and were two different lists on the page. That is one
	 * list too many: the question a reader has is "what can I add?", and answering
	 * it in two grids means reading both, searching both, and knowing beforehand
	 * which kind of thing they were after. Provenance is a label and a filter here,
	 * not a second page.
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
		 * Offering it to everyone on the instance, for an admin, and only for the
		 * ones that came from the store: what is already shared is being offered by
		 * definition, and what an admin owns is shared from its own editor.
		 */
		shared?: boolean;
		toggleShare?: () => Promise<void>;
	}

	let query = $state('');
	let origin = $state<Origin | 'all'>('all');
	let locale = $state('all');
	/** The one being fetched, so only its own button spins. */
	let installing = $state<string | null>(null);
	let sharing = $state<string | null>(null);

	// Opening is what asks for the listing, not mounting: the modal lives on the
	// Library page whether or not anyone opens it, and a page load is not a reason
	// to go and fetch a catalogue nobody asked to see.
	$effect(() => {
		if (open) void loadCatalog();
	});

	onMount(() => {
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
	 * is a poor first impression of a page whose whole job is to say what you have
	 * and what you do not. Two personas can share a name, but "you already have one
	 * called this" is exactly the thing worth saying here.
	 */
	const installedNames = $derived(
		new Set(($personasStore ?? []).map((p) => p.name.trim().toLowerCase()).filter(Boolean))
	);

	const isInstalled = (id: string, name: string) =>
		installedIds.has(id) || installedNames.has(name.trim().toLowerCase());

	async function installEntry(entry: CatalogEntry) {
		const bundle = await fetchBundle(entry);
		installPersonaBundle(bundle, { origin: entry.origin, id: entry.id, revision: entry.revision });
		toast.success($LL.installedPersona({ name: entry.name }));
	}

	/**
	 * Installing, with the card that asked for it marked while it happens.
	 *
	 * The spinner belongs to one card, so what is remembered is the card rather
	 * than a persona id: two of them can name the same persona, one shared by the
	 * instance and one in the store, and both would have spun.
	 */
	async function share(offer: Offer) {
		sharing = offer.key;
		try {
			await offer.toggleShare?.();
		} catch (error) {
			toast.error($LL.requestFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			sharing = null;
		}
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

	/** What the instance already offers, by the store id it was taken from. */
	const sharedIds = $derived(
		new Map(
			$personasConfig.shared
				.map((persona) => [personaOrigin(persona), persona.id] as const)
				.filter(([from]) => !!from) as [string, string][]
		)
	);

	async function toggleShare(entry: CatalogEntry) {
		const already = sharedIds.get(entry.id);
		if (already) return unsharePersona(already);
		const bundle = await fetchBundle(entry);
		await sharePersona(
			personaFromBundle(bundle, {
				origin: entry.origin,
				id: entry.id,
				revision: entry.revision
			})
		);
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
				shared: $personasConfig.canShare ? sharedIds.has(entry.id) : undefined,
				toggleShare: $personasConfig.canShare ? () => toggleShare(entry) : undefined
			})
		)
	);

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
					isInstalled(persona.id, persona.name) ||
					($personasStore ?? []).some((p) => p.id === persona.id),
				install: async () => {
					installPersona(persona);
					toast.success($LL.installedPersona({ name: persona.name }));
				}
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

			{#if origins.length > 1 || locales.length > 1}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#if origins.length > 1}
						{@render chip($LL.personaStoreAll(), origin === 'all', () => (origin = 'all'))}
						{#each origins as value (value)}
							{@render chip(originLabel(value), origin === value, () => (origin = value))}
						{/each}
					{/if}
					{#if locales.length > 1}
						{#each locales as value (value)}
							{@render chip(
								value.toUpperCase(),
								locale === value,
								() => (locale = locale === value ? 'all' : value)
							)}
						{/each}
					{/if}
				</div>
			{/if}
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
				<div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
					{#each filtered as offer (offer.key)}
						<div class="flex flex-col rounded-xl border border-shade-3 bg-shade-0 p-3.5">
							<div class="mb-2.5 flex items-start justify-between gap-2">
								<PersonaAvatar persona={{ name: offer.name, ...offer.avatar }} size={40} />
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium {offer.origin ===
									'official'
										? 'bg-accent/10 text-accent'
										: 'bg-shade-2 text-muted'}"
								>
									{originLabel(offer.origin)}
								</span>
							</div>

							<p class="truncate text-sm font-medium text-active">{offer.name}</p>
							{#if offer.tagline}
								<p class="mb-2 line-clamp-2 text-xs text-muted">{offer.tagline}</p>
							{/if}

							{#if offer.tags.length}
								<div class="mb-2 flex flex-wrap gap-1">
									{#each offer.tags.slice(0, 3) as tag (tag)}
										<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[10px] text-muted"
											>{tag}</span
										>
									{/each}
								</div>
							{/if}

							<!-- The row of actions, and on a card this narrow there is room for two
							     at most: taking it, and for an admin, handing it out. -->
							<div class="mt-auto flex items-stretch gap-1.5">
								{#if offer.installed}
									<span
										class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted"
									>
										<Check class="h-3.5 w-3.5" />
										{$LL.personaStoreInstalled()}
									</span>
								{:else if !$personasConfig.canInstall}
									<!-- Shown rather than hidden. Someone who cannot install still benefits
									     from seeing what exists, and from being told who to ask; a store
									     that silently loses most of its contents just looks broken. -->
									<span
										class="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted opacity-50"
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
										class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-active disabled:opacity-50"
									>
										{#if installing === offer.key}
											<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
										{:else}
											<Download class="h-3.5 w-3.5" />
										{/if}
										{$LL.install()}
									</button>
								{/if}

								{#if offer.toggleShare}
									<button
										type="button"
										disabled={sharing !== null}
										onclick={() => share(offer)}
										aria-pressed={offer.shared}
										title={offer.shared ? $LL.personaStoreUnshare() : $LL.personaStoreShare()}
										aria-label={offer.shared ? $LL.personaStoreUnshare() : $LL.personaStoreShare()}
										class="flex shrink-0 items-center justify-center rounded-lg border px-2 py-1.5 transition-colors disabled:opacity-50 {offer.shared
											? 'border-accent bg-accent/10 text-accent'
											: 'border-shade-3 text-muted hover:border-accent hover:text-active'}"
									>
										{#if sharing === offer.key}
											<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
										{:else}
											<Users class="h-3.5 w-3.5" />
										{/if}
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>

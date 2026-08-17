<script lang="ts">
	import {
		ArrowDownToLine,
		ChevronDown,
		FileText,
		Folder,
		FolderOpen,
		FolderPlus,
		LoaderCircle,
		MessageSquare,
		Pencil,
		Plus,
		RotateCcw,
		Store,
		Trash2,
		Upload,
		UserRound
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Head from '$lib/components/Head.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import PlaybookCard from '$lib/components/PlaybookCard.svelte';
	import {
		createCollection,
		deleteCollection,
		knowledgeInCollection,
		parseKnowledgeImport,
		renameCollection,
		saveKnowledge,
		type Knowledge
	} from '$lib/knowledge';
	import { knowledgeStore, personasStore, playbooksStore, settingsStore } from '$lib/localStorage';
	import {
		applyBundleToPersona,
		installPersonaBundle,
		parsePersonaBundle,
		type PersonaBundle
	} from '$lib/personaBundle';
	import { catalogState, fetchBundle, loadCatalog } from '$lib/personaCatalog';
	import {
		launchPersona,
		newPersona,
		parsePersonasImport,
		personaOrigin,
		savePersona,
		type Persona
	} from '$lib/personas';
	import { personasConfig } from '$lib/personasConfig';
	import { personaState } from '$lib/personaState';
	import { newPlaybook, type Playbook } from '$lib/playbooks';
	import { openKnowledge } from '$lib/stores/modal';
	import { formatTimestampToNow } from '$lib/utils';

	import PersonaModal from './PersonaModal.svelte';
	import PersonaStoreModal from './PersonaStoreModal.svelte';
	import PlaybookModal from './PlaybookModal.svelte';
	import PlaybookStoreModal from './PlaybookStoreModal.svelte';

	let editing = $state<Persona | null>(null);
	let modalOpen = $state(false);
	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	/** Knowledge in no collection, which is where everything starts out. */
	const looseKnowledge = $derived($knowledgeStore.filter((k) => !k.collectionId));

	/**
	 * Naming a collection happens where the collection will appear, not in a
	 * dialog stacked on the page: the card turns into a field, you type, you press
	 * Enter. Creating and renaming share it, since they are the same act.
	 */
	let namingNew = $state(false);
	let renamingId = $state<string | null>(null);
	let draftName = $state('');
	let nameField = $state<HTMLInputElement | null>(null);
	let confirmingDeleteId = $state<string | null>(null);

	const isCollapsed = (id: string) => ($settingsStore.collapsedCollections ?? []).includes(id);

	function toggleCollapsed(id: string) {
		const current = $settingsStore.collapsedCollections ?? [];
		$settingsStore.collapsedCollections = current.includes(id)
			? current.filter((it) => it !== id)
			: [...current, id];
	}

	async function focusName() {
		await tick();
		nameField?.select();
		nameField?.focus();
	}

	function startNamingNew() {
		namingNew = true;
		renamingId = null;
		draftName = '';
		void focusName();
	}

	function startRenaming(id: string, name: string) {
		renamingId = id;
		namingNew = false;
		draftName = name;
		void focusName();
	}

	function stopNaming() {
		namingNew = false;
		renamingId = null;
		draftName = '';
	}

	function commitName() {
		const name = draftName.trim();
		if (!name) return stopNaming();
		if (renamingId) renameCollection(renamingId, name);
		else if (namingNew) createCollection(name);
		stopNaming();
	}

	function onNameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') commitName();
		if (event.key === 'Escape') stopNaming();
	}

	/** Deletes the grouping only: its knowledge comes back to the top level. */
	function removeCollection(id: string) {
		deleteCollection(id);
		confirmingDeleteId = null;
	}

	/**
	 * The listing, for the badges on your own cards.
	 *
	 * Without it a persona installed before the fingerprint existed has nothing to
	 * be compared against and is reported as untouched, whatever you have done to
	 * it. With it the comparison falls back to what the store publishes today,
	 * which answers the question for every copy, however old.
	 *
	 * Cached after the first fetch, and this page is about personas, so asking for
	 * it here is not a request anyone is paying for twice.
	 */
	$effect(() => {
		void loadCatalog();
	});

	const catalogEntries = $derived(
		$catalogState.status === 'ready' ? $catalogState.catalog.entries : []
	);

	const entryFor = (persona: Persona) =>
		catalogEntries.find((entry) => entry.id === personaOrigin(persona));

	const publishedDigest = (persona: Persona) => entryFor(persona)?.contentDigest;

	/**
	 * Take the published version back, from the card that owns the copy.
	 *
	 * Here as well as in the store, and not by duplication: a user who is not an
	 * administrator has no "my personas" view, so this is the only place their own
	 * copy is drawn. An action that lives on an object has to be reachable wherever
	 * that object is.
	 */
	let restoring = $state<string | null>(null);

	async function restore(persona: Persona) {
		const entry = entryFor(persona);
		if (!entry) return;
		if (
			personaState(persona, entry.contentDigest) !== 'outdated' &&
			!confirm($LL.personaStoreUpdateConfirm({ name: persona.name }))
		) {
			return;
		}

		restoring = persona.id;
		try {
			const bundle = await fetchBundle(entry);
			applyBundleToPersona(persona, bundle, {
				origin: entry.origin,
				id: entry.id,
				revision: entry.revision
			});
			toast.success($LL.personaStoreUpdated({ name: entry.name }));
		} catch (error) {
			toast.error($LL.personaStoreInstallFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			restoring = null;
		}
	}

	let personaFileInput = $state<HTMLInputElement | undefined>();
	let knowledgeFileInput = $state<HTMLInputElement | undefined>();
	let storeOpen = $state(false);

	const canCreate = $derived($personasConfig.canCreate);

	function createPersona() {
		editing = newPersona();
		modalOpen = true;
	}

	function editPersona(persona: Persona) {
		editing = { ...persona };
		modalOpen = true;
	}

	function chatWith(persona: Persona) {
		goto(resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) }));
	}

	function readJsonFile(input: HTMLInputElement, onData: (data: unknown) => void) {
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				onData(JSON.parse(e.target?.result as string));
			} catch (error) {
				toast.error($LL.importError(), {
					description: error instanceof Error ? error.message : $LL.invalidFile()
				});
			} finally {
				input.value = '';
			}
		};
		reader.readAsText(file);
	}

	/**
	 * A dropped file, which is one of three things.
	 *
	 * Bundles first, because that is what the app itself exports and what the store
	 * serves, and because they are the only form that carries its documents: read
	 * as anything else, a persona with knowledge attached arrives with the
	 * attachment pointing nowhere. The older shapes, our raw records and OpenWebUI
	 * models, still import behind it.
	 */
	function onImportPersonas(event: Event) {
		readJsonFile(event.target as HTMLInputElement, (data) => {
			const bundles = (Array.isArray(data) ? data : [data])
				.map(parsePersonaBundle)
				.filter((b): b is PersonaBundle => !!b);

			if (bundles.length) {
				for (const bundle of bundles) installPersonaBundle(bundle, { origin: 'file' });
				return toast.success($LL.importedPersonas({ count: bundles.length }));
			}

			const personas = parsePersonasImport(data);
			if (personas.length === 0) return toast.error($LL.noPersonasInFile());
			for (const persona of personas) savePersona(persona);
			toast.success($LL.importedPersonas({ count: personas.length }));
		});
	}

	let playbookModalOpen = $state(false);
	let playbookStoreOpen = $state(false);
	let editingPlaybook = $state<Playbook>(newPlaybook());

	function editPlaybook(playbook: Playbook) {
		editingPlaybook = playbook;
		playbookModalOpen = true;
	}

	/**
	 * A new playbook is saved as soon as it is named, like a persona: the modal
	 * writes through on every keystroke, so there is no draft to lose and no Save
	 * button to forget.
	 */
	function createPlaybook() {
		editingPlaybook = newPlaybook();
		playbookModalOpen = true;
	}

	function onImportKnowledge(event: Event) {
		readJsonFile(event.target as HTMLInputElement, (data) => {
			const items = parseKnowledgeImport(data);
			if (items.length === 0) return toast.error($LL.noKnowledgeInFile());
			for (const item of items) saveKnowledge(item);
			toast.success($LL.importedCollections({ count: items.length }));
		});
	}
</script>

{#snippet knowledgeCard(knowledge: Knowledge)}
	<button
		type="button"
		onclick={() => openKnowledge({ id: knowledge.id })}
		class="flex items-center gap-2.5 rounded-xl border border-shade-3 bg-shade-0 p-3.5 text-left transition-colors hover:border-shade-4"
	>
		<FileText class="h-5 w-5 shrink-0 text-muted" />
		<div class="min-w-0">
			<p class="truncate text-sm font-medium text-active">{knowledge.name || $LL.untitled()}</p>
			<p class="text-[11px] text-muted">{formatTimestampToNow(knowledge.updatedAt)}</p>
		</div>
	</button>
{/snippet}

<Head title={$LL.library()} />

<!-- Frameless like the sessions landing, and for the same reason it still carries a
     surface: see the comment there. -->
<div
	class="app-panel [--surface-color:var(--color-shade-1)] lg:[--surface-color:var(--color-shade-2)] flex h-full flex-col surface-pane lg:rounded-xl"
>
	<div class="min-h-0 flex-1 overflow-auto">
		<MobileMenuBar />
		<div class="mx-auto w-full max-w-4xl px-6 py-8">
			<!-- Header -->
			<div class="mb-1 flex items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-1">
					<h1 class="truncate text-xl font-semibold tracking-tight text-active">{$LL.library()}</h1>
				</div>

				<div class="shrink-0">
					<Menu class="w-48">
						{#snippet trigger({ props })}
							<button
								{...props}
								type="button"
								class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
							>
								<Upload class="h-4 w-4" />
								{$LL.import()}
								<ChevronDown class="h-3.5 w-3.5 opacity-80" />
							</button>
						{/snippet}

						{#if canCreate}
							<MenuItem icon={UserRound} onclick={() => personaFileInput?.click()}>
								{$LL.importPersona()}
							</MenuItem>
						{/if}
						<MenuItem icon={FolderOpen} onclick={() => knowledgeFileInput?.click()}>
							{$LL.importKnowledge()}
						</MenuItem>
					</Menu>
				</div>
			</div>
			<p class="mb-7 text-sm text-muted">{$LL.librarySubtitle()}</p>

			<!-- Personas -->
			<!-- The shortcut in the heading and the one at the end of the grid are both
			     worth having: the heading is where you look when you arrive knowing what
			     you want, the tile is where you end up having scrolled and found nothing
			     that suits. -->
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-sm font-medium text-active">{$LL.personas()}</h2>
					<span class="text-xs text-muted">{$personasStore.length}</span>
				</div>
				<button
					type="button"
					onclick={() => (storeOpen = true)}
					class="flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
				>
					<Store class="h-3.5 w-3.5" />
					{$LL.personaStore()}
				</button>
			</div>

			<div class="mb-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
				{#each $personasStore as persona (persona.id)}
					{@const state = personaState(persona, publishedDigest(persona))}
					<PersonaCard
						name={persona.name || $LL.untitled()}
						tagline={persona.tagline}
						avatar={persona}
						tags={persona.tags}
						actionLabel={$LL.editPersona()}
						onclick={() => editPersona(persona)}
					>
						{#snippet badges()}
							<!-- What it is now, not where it came from.
							     "Official" said nothing on a card in your own library: everything
							     here is either the store's or yours, and the useful signal is
							     whether it still says what it said when it arrived. One badge, and
							     none at all in the ordinary case. -->
							{#if state === 'edited' || state === 'outdated' || state === 'edited-outdated'}
								<!-- Thin, and tinted rather than grey. Kept at the weight of a
								     footnote, but in the accent: it is the one thing on the card that
								     is worth catching an eye, and a grey annotation on a grey card
								     catches none. -->
								<span
									class="rounded border border-accent/30 bg-accent/10 px-1 text-[9px] font-medium leading-[15px] text-accent"
								>
									{state === 'edited'
										? $LL.personaStateEdited()
										: state === 'outdated'
											? $LL.personaStateOutdated()
											: $LL.personaStateEditedOutdated()}
								</span>
							{/if}
						{/snippet}

						{#snippet actions()}
							{#if state === 'edited' || state === 'outdated' || state === 'edited-outdated'}
								{@const outdated = state === 'outdated'}
								<button
									type="button"
									disabled={restoring !== null}
									onclick={() => restore(persona)}
									title={outdated
										? $LL.personaStoreUpdateTooltip()
										: $LL.personaStoreResetTooltip()}
									aria-label={outdated
										? $LL.personaStoreUpdateTooltip()
										: $LL.personaStoreResetTooltip()}
									class="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 {outdated
										? 'text-accent hover:bg-accent/10'
										: 'text-muted hover:bg-shade-2 hover:text-active'}"
								>
									{#if restoring === persona.id}
										<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
									{:else if outdated}
										<ArrowDownToLine class="h-3.5 w-3.5" />
									{:else}
										<RotateCcw class="h-3.5 w-3.5" />
									{/if}
								</button>
							{/if}

							<!-- Both of them, spelled out. Talking to a persona is the frequent
							     act and editing it the rare one, but the Library is where you
							     manage them, so neither is left to a control that only exists
							     under a pointer. -->
							<button
								type="button"
								onclick={() => chatWith(persona)}
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-shade-2 hover:text-active"
							>
								<MessageSquare class="h-3.5 w-3.5" />
								{$LL.personaChat()}
							</button>
							<button
								type="button"
								onclick={() => editPersona(persona)}
								title={$LL.edit()}
								aria-label={$LL.editPersona()}
								class="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
						{/snippet}
					</PersonaCard>
				{/each}
			</div>

			<!-- On a row of its own after the cards, not among them. A grid stretches
			     every cell in a row to the tallest, so among the personas this control
			     was as tall as a card, which is neither what it is nor what its twin in
			     the knowledge section looks like. Its own grid gives it one column of
			     the same width and its natural height. -->
			<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
				<div
					class="flex items-stretch gap-1 rounded-xl border border-dashed border-shade-4 transition-colors hover:border-accent"
				>
					<button
						type="button"
						onclick={createPersona}
						disabled={!canCreate}
						class="flex flex-1 items-center justify-center gap-1.5 p-3.5 text-muted transition-colors hover:text-active disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Plus class="h-4 w-4" />
						<span class="text-xs">{$LL.personaStoreCreate()}</span>
					</button>
					<button
						type="button"
						onclick={() => (storeOpen = true)}
						title={$LL.personaStoreBrowse()}
						aria-label={$LL.personaStoreBrowse()}
						class="my-2.5 border-l border-shade-3 px-3 text-muted transition-colors hover:text-active"
					>
						<Store class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Playbooks -->
			<!-- Between the personas and the knowledge on purpose: who answers, how the
			     job is done, what it is done with. That is the order somebody builds
			     things up in. -->
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-sm font-medium text-active">{$LL.playbooks()}</h2>
					<span class="text-xs text-muted">{$playbooksStore.length}</span>
				</div>
				<button
					type="button"
					onclick={() => (playbookStoreOpen = true)}
					class="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
				>
					<Store class="h-3.5 w-3.5" />
					{$LL.playbookStoreBrowse()}
				</button>
			</div>

			<!-- One column rather than a grid of tiles: a playbook is chosen on its
			     summary, and a summary is a sentence. Two columns on a wide screen,
			     because thirty of them in a single stack is a scroll. -->
			<div class="mb-9 grid gap-3 lg:grid-cols-2">
				{#each $playbooksStore as playbook (playbook.id)}
					<PlaybookCard {playbook} onclick={() => editPlaybook(playbook)} />
				{/each}

				<div
					class="flex items-stretch gap-1 rounded-xl border border-dashed border-shade-4 transition-colors hover:border-accent"
				>
					<button
						type="button"
						onclick={createPlaybook}
						class="flex flex-1 items-center justify-center gap-1.5 p-3.5 text-muted transition-colors hover:text-active"
					>
						<Plus class="h-4 w-4" />
						<span class="text-xs">{$LL.newPlaybook()}</span>
					</button>
					<button
						type="button"
						onclick={() => (playbookStoreOpen = true)}
						title={$LL.playbookStoreBrowse()}
						aria-label={$LL.playbookStoreBrowse()}
						class="my-2.5 border-l border-shade-3 px-3 text-muted transition-colors hover:text-active"
					>
						<Store class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Knowledge -->
			<div class="mb-3 flex items-baseline gap-2">
				<h2 class="text-sm font-medium text-active">{$LL.knowledge()}</h2>
				<span class="text-xs text-muted">{$knowledgeStore.length}</span>
			</div>

			<!-- Loose knowledge first: it is where everything starts out, so it is what
			     you came to look at. No heading over it, because "everything not filed
			     anywhere" is not a category anyone thinks in. -->
			<div class="mb-6">
				<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
					{#each looseKnowledge as knowledge (knowledge.id)}
						{@render knowledgeCard(knowledge)}
					{/each}

					{#if namingNew}
						<!-- The card became the field it was going to create. Nothing opened,
						     nothing covered the grid, and the name is typed where the folder
						     will sit. -->
						<div
							class="flex items-center gap-2 rounded-xl border border-accent bg-shade-0 p-3.5 text-left"
						>
							<Folder class="h-5 w-5 shrink-0 text-muted" />
							<input
								bind:this={nameField}
								bind:value={draftName}
								onblur={commitName}
								onkeydown={onNameKeydown}
								placeholder={$LL.newCollection()}
								class="w-full min-w-0 bg-transparent text-sm font-medium text-active outline-none placeholder:font-normal placeholder:text-muted"
							/>
						</div>
					{:else}
						<div
							class="flex items-stretch gap-1 rounded-xl border border-dashed border-shade-4 transition-colors hover:border-accent"
						>
							<button
								type="button"
								onclick={() => openKnowledge()}
								class="flex flex-1 items-center justify-center gap-1.5 p-3.5 text-muted transition-colors hover:text-active"
							>
								<Plus class="h-4 w-4" />
								<span class="text-xs">{$LL.newKnowledge()}</span>
							</button>
							<button
								type="button"
								onclick={startNamingNew}
								title={$LL.newCollection()}
								aria-label={$LL.newCollection()}
								class="my-2.5 border-l border-shade-3 px-3 text-muted transition-colors hover:text-active"
							>
								<FolderPlus class="h-4 w-4" />
							</button>
						</div>
					{/if}
				</div>
			</div>
			<!-- One page, no navigation: a collection is a heading over its own grid,
			     and the cards below it are the same cards as everywhere else. Nothing to
			     enter, nothing to come back from, and what is where stays visible. -->
			{#each collections as collection (collection.id)}
				{@const items = knowledgeInCollection($knowledgeStore, collection.id)}
				{@const collapsed = isCollapsed(collection.id)}
				<div class="group/section mb-6">
					<div class="mb-2 flex items-center gap-2">
						{#if renamingId === collection.id}
							<input
								bind:this={nameField}
								bind:value={draftName}
								onblur={commitName}
								onkeydown={onNameKeydown}
								class="min-w-0 rounded-md border border-accent bg-shade-0 px-2 py-0.5 text-sm font-medium text-active outline-none"
							/>
						{:else}
							<button
								type="button"
								onclick={() => toggleCollapsed(collection.id)}
								aria-expanded={!collapsed}
								class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-active"
							>
								<ChevronDown
									class="h-3.5 w-3.5 shrink-0 text-muted transition-transform {collapsed
										? '-rotate-90'
										: ''}"
								/>
								<Folder class="h-4 w-4 shrink-0 text-muted" />
								<span class="truncate">{collection.name}</span>
								<span class="shrink-0 text-xs font-normal text-muted">{items.length}</span>
							</button>
						{/if}

						{#if confirmingDeleteId === collection.id}
							<!-- Says what survives, because "delete the folder" reads as "delete
							     what is in it" to most people, and here it does not. -->
							<span class="ml-auto flex items-center gap-2 text-xs text-muted">
								<span class="hidden sm:inline">
									{$LL.deleteCollectionConfirm({ name: collection.name })}
								</span>
								<button
									type="button"
									onclick={() => removeCollection(collection.id)}
									class="font-medium text-negative transition-opacity hover:opacity-80"
								>
									{$LL.delete()}
								</button>
								<button
									type="button"
									onclick={() => (confirmingDeleteId = null)}
									class="transition-colors hover:text-active"
								>
									{$LL.cancel()}
								</button>
							</span>
						{:else}
							<div
								class="ml-auto flex shrink-0 items-center gap-0.5 text-muted transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100"
							>
								<button
									type="button"
									onclick={() => startRenaming(collection.id, collection.name)}
									title={$LL.rename()}
									aria-label={$LL.rename()}
									class="rounded p-1 transition-colors hover:text-active"
								>
									<Pencil class="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									onclick={() => (confirmingDeleteId = collection.id)}
									title={$LL.delete()}
									aria-label={$LL.delete()}
									class="rounded p-1 transition-colors hover:text-negative"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							</div>
						{/if}
					</div>

					{#if !collapsed}
						<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
							{#each items as knowledge (knowledge.id)}
								{@render knowledgeCard(knowledge)}
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Hidden file inputs driven by the Import menu in the header -->
<input
	bind:this={personaFileInput}
	type="file"
	accept="application/json,.json"
	class="hidden"
	onchange={onImportPersonas}
/>
<input
	bind:this={knowledgeFileInput}
	type="file"
	accept="application/json,.json"
	class="hidden"
	onchange={onImportKnowledge}
/>

{#if editing}
	<PersonaModal bind:open={modalOpen} bind:persona={editing} />
	<PlaybookModal bind:open={playbookModalOpen} bind:playbook={editingPlaybook} />
	<PlaybookStoreModal bind:open={playbookStoreOpen} />
{/if}

<PersonaStoreModal bind:open={storeOpen} />

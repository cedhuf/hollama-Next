<script lang="ts">
	import {
		ArrowDownToLine,
		ChevronDown,
		FileText,
		Folder,
		FolderPlus,
		LoaderCircle,
		MessageSquare,
		Pencil,
		Plus,
		RotateCcw,
		Store,
		Upload
	} from '@lucide/svelte';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import Head from '$lib/components/Head.svelte';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import {
		createCollection,
		deleteCollection,
		knowledgeInCollection,
		renameCollection,
		type Knowledge
	} from '$lib/knowledge';
	import { importLibraryFiles, restorePersonaFromStore } from '$lib/libraryActions';
	import { knowledgeStore, personasStore, playbooksStore, settingsStore } from '$lib/localStorage';
	import { catalogState, loadCatalog } from '$lib/personaCatalog';
	import { launchPersona, newPersona, personaOrigin, type Persona } from '$lib/personas';
	import { personasConfig } from '$lib/personasConfig';
	import { personaState } from '$lib/personaState';
	import { newPlaybook, playbookSteps, type Playbook } from '$lib/playbooks';
	import { openKnowledge } from '$lib/stores/modal';
	import { formatTimestampToNow } from '$lib/utils';

	import LibraryStore from './LibraryStore.svelte';
	import PersonaModal from './PersonaModal.svelte';
	import PlaybookModal from './PlaybookModal.svelte';

	let editing = $state<Persona | null>(null);
	let modalOpen = $state(false);
	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	/** Knowledge in no collection, which is where everything starts out. */
	const looseKnowledge = $derived($knowledgeStore.filter((k) => !k.collectionId));

	/** Naming happens where the collection will appear, not in a dialog: the card turns into a field. Creating and renaming share it, being the same act. */
	let namingNew = $state(false);
	let renamingId = $state<string | null>(null);
	let draftName = $state('');
	let nameField = $state<HTMLInputElement | null>(null);

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
	}

	/** Without it, a persona installed before the fingerprint existed has nothing to compare against and is reported as untouched. Cached after the first fetch. */
	$effect(() => {
		void loadCatalog();
	});

	const catalogEntries = $derived(
		$catalogState.status === 'ready' ? $catalogState.catalog.entries : []
	);

	const entryFor = (persona: Persona) =>
		catalogEntries.find((entry) => entry.id === personaOrigin(persona));

	const publishedDigest = (persona: Persona) => entryFor(persona)?.contentDigest;

	/** Which persona is being taken back, so its own button can say so. */
	let restoring = $state<string | null>(null);

	async function restore(persona: Persona) {
		const entry = entryFor(persona);
		if (!entry) return;
		restoring = persona.id;
		try {
			await restorePersonaFromStore(persona, entry);
		} finally {
			restoring = null;
		}
	}

	let importInput = $state<HTMLInputElement | undefined>();
	let storeOpen = $state(false);
	/** The door is where you are: each section's button opens the store on its own shelf, the one at the top on everything. Same window, three ways in. */
	let storeFamily = $state<'' | 'personas' | 'playbooks'>('');

	function openStore(family: '' | 'personas' | 'playbooks' = '') {
		storeFamily = family;
		storeOpen = true;
	}

	const canCreate = $derived($personasConfig.canCreate);

	function createPersona() {
		editing = newPersona();
		modalOpen = true;
	}

	function editPersona(persona: Persona) {
		editing = { ...persona };
		modalOpen = true;
	}

	async function chatWith(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models);
		goto(resolve('/sessions/[id]', { id }));
	}

	/** The reading is `$lib/libraryActions`, shared with the phone interface's Library, so the day one learns a new format the other has already learnt it. */
	async function onImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		await importLibraryFiles(files);
	}

	let playbookModalOpen = $state(false);
	let editingPlaybook = $state<Playbook>(newPlaybook());

	function editPlaybook(playbook: Playbook) {
		editingPlaybook = playbook;
		playbookModalOpen = true;
	}

	/** Saved as soon as it is named, like a persona: the modal writes through on every keystroke, so there is no draft to lose. */
	function createPlaybook() {
		editingPlaybook = newPlaybook();
		playbookModalOpen = true;
	}
</script>

{#snippet knowledgeCard(knowledge: Knowledge)}
	<button
		type="button"
		onclick={() => openKnowledge({ id: knowledge.id })}
		class="section-tint bg-shade-0 hover:border-shade-4 flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition-colors"
	>
		<FileText class="text-muted h-5 w-5 shrink-0" />
		<div class="min-w-0">
			<p class="text-active truncate text-sm font-medium">{knowledge.name || $LL.untitled()}</p>
			<p class="text-muted text-[11px]">{formatTimestampToNow(knowledge.updatedAt)}</p>
		</div>
	</button>
{/snippet}

<Head title={$LL.library()} />

<!-- Frameless like the sessions landing, and carrying a surface for the same
     reason. -->
<div
	class="app-panel surface-pane flex h-full flex-col [--surface-color:var(--color-shade-1)] lg:rounded-xl lg:[--surface-color:var(--color-shade-2)]"
>
	<div class="min-h-0 flex-1 overflow-auto">
		<MobileMenuBar />
		<div class="mx-auto w-full max-w-5xl px-6 py-8">
			<!-- Header -->
			<div class="mb-1 flex items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-1">
					<h1 class="text-active truncate text-xl font-semibold tracking-tight">{$LL.library()}</h1>
				</div>

				<div class="flex shrink-0 items-center gap-2">
					<!-- One store, at the top of the page. The icon on each create tile opens the
					     same window on that shelf, which is where you are when you have just found
					     nothing that suits. -->
					<button
						type="button"
						onclick={() => openStore()}
						class="border-shade-3 text-muted hover:bg-shade-2 hover:text-active flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors"
					>
						<Store class="h-4 w-4" />
						{$LL.store()}
					</button>

					<button
						type="button"
						onclick={() => importInput?.click()}
						class="border-accent bg-accent text-shade-0 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
					>
						<Upload class="h-4 w-4" />
						{$LL.import()}
					</button>
				</div>
			</div>
			<p class="text-muted mb-7 text-sm">{$LL.librarySubtitle()}</p>

			<!-- Personas -->
			<!-- Each section carries its own turn of the accent, so three grids of
			     near-identical cards are separable without a legend.

			     The shortcut in the heading and the one at the end of the grid are both
			     worth having: one is where you look arriving, the other where you end up
			     having scrolled. -->
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-active text-sm font-medium">{$LL.personas()}</h2>
					<span class="text-muted text-xs">{$personasStore.length}</span>
				</div>
			</div>

			<!-- Equal rows: a card's height comes from how many lines its tags wrap onto.
			     Only within a section, since the three hold different things. -->
			<div
				class="library-section mb-3 grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
				style="--section-turn: 0"
			>
				{#each $personasStore as persona (persona.id)}
					{@const state = personaState(persona, publishedDigest(persona))}
					<LibraryCard
						name={persona.name || $LL.untitled()}
						tagline={persona.tagline}
						avatar={persona}
						tags={persona.tags}
						actionLabel={$LL.editPersona()}
						onclick={() => editPersona(persona)}
					>
						{#snippet badges()}
							<!-- What it is now, not where it came from: everything here is either the
							     store's or yours, and the useful signal is whether it still says what it
							     said when it arrived. -->
							{#if state === 'edited' || state === 'outdated' || state === 'edited-outdated'}
								<!-- Thin, and tinted rather than grey: a grey annotation on a grey card catches
								     no eye. -->
								<span
									class="border-accent/30 bg-accent/10 text-accent rounded border px-1 text-[9px] leading-[15px] font-medium"
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

							<!-- Both spelled out: the Library is where you manage them, so neither is left
							     to a control that only exists under a pointer. -->
							<button
								type="button"
								onclick={() => chatWith(persona)}
								class="text-muted hover:bg-shade-2 hover:text-active flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors"
							>
								<MessageSquare class="h-3.5 w-3.5" />
								{$LL.personaChat()}
							</button>
							<button
								type="button"
								onclick={() => editPersona(persona)}
								title={$LL.edit()}
								aria-label={$LL.editPersona()}
								class="text-muted hover:bg-shade-2 hover:text-active flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 transition-colors"
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
						{/snippet}
					</LibraryCard>
				{/each}
			</div>

			<!-- On a row of its own after the cards: a grid stretches every cell to the
			     tallest, so among the personas this control was as tall as a card. -->
			<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
				<div
					class="border-shade-4 hover:border-accent flex items-stretch gap-1 rounded-xl border border-dashed transition-colors"
				>
					<button
						type="button"
						onclick={createPersona}
						disabled={!canCreate}
						class="text-muted hover:text-active flex flex-1 items-center justify-center gap-1.5 p-3.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Plus class="h-4 w-4" />
						<span class="text-xs">{$LL.personaStoreCreate()}</span>
					</button>
					<button
						type="button"
						onclick={() => openStore('personas')}
						title={$LL.personaStoreBrowse()}
						aria-label={$LL.personaStoreBrowse()}
						class="border-shade-3 text-muted hover:text-active my-2.5 border-l px-3 transition-colors"
					>
						<Store class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Playbooks -->
			<!-- Between the personas and the knowledge on purpose: who answers, how the job
			     is done, what it is done with. -->
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-active text-sm font-medium">{$LL.playbooks()}</h2>
					<span class="text-muted text-xs">{$playbooksStore.length}</span>
				</div>
			</div>

			<div
				class="library-section mb-3 grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
				style="--section-turn: 150"
			>
				{#each $playbooksStore as playbook (playbook.id)}
					<LibraryCard
						name={playbook.name || $LL.untitled()}
						tagline={playbook.summary}
						tags={playbook.tags}
						meta={$LL.playbookSections({ count: playbookSteps(playbook.instructions) })}
						onclick={() => editPlaybook(playbook)}
					/>
				{/each}
			</div>

			<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
				<div
					class="border-shade-4 hover:border-accent flex items-stretch gap-1 rounded-xl border border-dashed transition-colors"
				>
					<button
						type="button"
						onclick={createPlaybook}
						class="text-muted hover:text-active flex flex-1 items-center justify-center gap-1.5 p-3.5 transition-colors"
					>
						<Plus class="h-4 w-4" />
						<span class="text-xs">{$LL.newPlaybook()}</span>
					</button>
					<button
						type="button"
						onclick={() => openStore('playbooks')}
						title={$LL.playbookStore()}
						aria-label={$LL.playbookStore()}
						class="border-shade-3 text-muted hover:text-active my-2.5 border-l px-3 transition-colors"
					>
						<Store class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Knowledge -->
			<div class="mb-3 flex items-baseline gap-2">
				<h2 class="text-active text-sm font-medium">{$LL.knowledge()}</h2>
				<span class="text-muted text-xs">{$knowledgeStore.length}</span>
			</div>

			<!-- Loose knowledge first: it is where everything starts out. No heading, since
			     "everything not filed anywhere" is not a category anyone thinks in. -->
			<div class="mb-6">
				<div
					class="library-section grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3"
					style="--section-turn: -110"
				>
					{#each looseKnowledge as knowledge (knowledge.id)}
						{@render knowledgeCard(knowledge)}
					{/each}

					{#if namingNew}
						<!-- The card became the field it was going to create: nothing opened, nothing
						     covered the grid. -->
						<div
							class="border-accent bg-shade-0 flex items-center gap-2 rounded-xl border p-3.5 text-left"
						>
							<Folder class="text-muted h-5 w-5 shrink-0" />
							<input
								bind:this={nameField}
								bind:value={draftName}
								onblur={commitName}
								onkeydown={onNameKeydown}
								placeholder={$LL.newCollection()}
								class="text-active placeholder:text-muted w-full min-w-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal"
							/>
						</div>
					{:else}
						<div
							class="border-shade-4 hover:border-accent flex items-stretch gap-1 rounded-xl border border-dashed transition-colors"
						>
							<button
								type="button"
								onclick={() => openKnowledge()}
								class="text-muted hover:text-active flex flex-1 items-center justify-center gap-1.5 p-3.5 transition-colors"
							>
								<Plus class="h-4 w-4" />
								<span class="text-xs">{$LL.newKnowledge()}</span>
							</button>
							<button
								type="button"
								onclick={startNamingNew}
								title={$LL.newCollection()}
								aria-label={$LL.newCollection()}
								class="border-shade-3 text-muted hover:text-active my-2.5 border-l px-3 transition-colors"
							>
								<FolderPlus class="h-4 w-4" />
							</button>
						</div>
					{/if}
				</div>
			</div>
			<!-- One page, no navigation: a collection is a heading over its own grid, and
			     the cards below are the same cards as everywhere else. -->
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
								class="border-accent bg-shade-0 text-active min-w-0 rounded-md border px-2 py-0.5 text-sm font-medium outline-none"
							/>
						{:else}
							<button
								type="button"
								onclick={() => toggleCollapsed(collection.id)}
								aria-expanded={!collapsed}
								class="text-active flex min-w-0 items-center gap-1.5 text-sm font-medium"
							>
								<ChevronDown
									class="text-muted h-3.5 w-3.5 shrink-0 transition-transform {collapsed
										? '-rotate-90'
										: ''}"
								/>
								<Folder class="text-muted h-4 w-4 shrink-0" />
								<span class="truncate">{collection.name}</span>
								<span class="text-muted shrink-0 text-xs font-normal">{items.length}</span>
							</button>
						{/if}

						<div
							class="text-muted ml-auto flex shrink-0 items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100"
						>
							<button
								type="button"
								onclick={() => startRenaming(collection.id, collection.name)}
								title={$LL.rename()}
								aria-label={$LL.rename()}
								class="hover:text-active rounded p-1 transition-colors"
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
							<!-- What survives is on the tooltip: "delete the folder" reads as "delete what
							     is in it" to most people, and here it does not. -->
							<ButtonConfirm
								compact
								onConfirm={() => removeCollection(collection.id)}
								label={$LL.deleteCollectionConfirm({ name: collection.name })}
							/>
						</div>
					</div>

					{#if !collapsed}
						<div
							class="library-section grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3"
							style="--section-turn: -110"
						>
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
<!-- Several at once, and text as readily as JSON: the button reads whatever it is
     handed. -->
<input
	bind:this={importInput}
	type="file"
	multiple
	accept=".json,.md,.markdown,.txt,.csv,application/json,text/plain,text/markdown"
	class="hidden"
	onchange={onImport}
/>

{#if editing}
	<PersonaModal bind:open={modalOpen} bind:persona={editing} />
{/if}

<PlaybookModal bind:open={playbookModalOpen} bind:playbook={editingPlaybook} />
<LibraryStore bind:open={storeOpen} bind:family={storeFamily} />

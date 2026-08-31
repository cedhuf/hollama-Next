<script lang="ts">
	import {
		ArrowDownToLine,
		ChevronDown,
		FileText,
		Folder,
		FolderPlus,
		LoaderCircle,
		Mic,
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
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
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

	import LibraryStore from '../../library/LibraryStore.svelte';
	import PersonaModal from '../../library/PersonaModal.svelte';
	import PlaybookModal from '../../library/PlaybookModal.svelte';

	/**
	 * The Library, on a phone.
	 *
	 * It exists because the alternative was worse than missing: the row in Profile
	 * used to leave for the full interface, which has a sidebar this one does not,
	 * and the redirect that keeps a phone on the phone then caught the next tap and
	 * threw you back. A door that only opens outwards, and closes by accident.
	 *
	 * Not the same page narrowed. The desktop Library is three grids of cards down
	 * one long scroll, which works because a wide screen shows all three at once and
	 * the eye picks the section. A phone shows one column, so three grids become
	 * three walls to scroll past, and the section headings stop being a map. Here
	 * the three are a switch at the top and one list at a time: a persona, a
	 * playbook and a document are different things, and this is the width where you
	 * only ever want one of them.
	 *
	 * Rows rather than cards, for the same reason. A 200px card holds an avatar, a
	 * name, a tagline and two buttons because it has two dimensions to put them in.
	 * At this width a card is a row with wasted air, so it is a row.
	 *
	 * What is not rewritten is everything behind it. The persona editor, the
	 * playbook editor, the knowledge editor and the store are the app's own dialogs,
	 * which already take the whole screen on a phone, and the import is
	 * `$lib/libraryActions`, shared with the full interface so the two cannot learn
	 * different formats.
	 */

	type Shelf = 'personas' | 'playbooks' | 'knowledge';

	/**
	 * Which of the three is showing.
	 *
	 * Kept here and not in the address. It is a view of one screen rather than a
	 * place, nobody links to "the library, on playbooks", and putting it in the URL
	 * would put a back button between two taps of a switch.
	 */
	let shelf = $state<Shelf>('personas');

	const shelves = $derived([
		{ id: 'personas' as const, label: $LL.personas(), count: $personasStore.length },
		{ id: 'playbooks' as const, label: $LL.playbooks(), count: $playbooksStore.length },
		{ id: 'knowledge' as const, label: $LL.knowledge(), count: $knowledgeStore.length }
	]);

	// --- personas -------------------------------------------------------------

	let editing = $state<Persona | null>(null);
	let personaOpen = $state(false);
	const canCreate = $derived($personasConfig.canCreate);

	function createPersona() {
		editing = newPersona();
		personaOpen = true;
	}

	function editPersona(persona: Persona) {
		editing = { ...persona };
		personaOpen = true;
	}

	/**
	 * Talking to a persona, which on a phone means out loud.
	 *
	 * The full interface opens their conversation to type in. Here the same tap goes
	 * to the voice screen, because that is where this interface sends you from every
	 * other place a persona is offered, and a library that disagreed with the home
	 * screen about what a persona is for would be the odd one.
	 *
	 * The rule below watches for unresolved paths, and this one is resolved.
	 * `resolve` has nowhere to put a query, which is the whole of the mismatch.
	 */
	async function talkTo(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models ?? []);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${resolve('/m/voice')}?session=${encodeURIComponent(id)}`);
	}

	/**
	 * The listing, for the badges on your own personas.
	 *
	 * Without it a persona installed before the fingerprint existed has nothing to
	 * be compared against and is reported as untouched, whatever you have done to
	 * it. Cached after the first fetch, and shared with the full interface's copy of
	 * this page, so asking here costs nothing twice.
	 */
	$effect(() => {
		void loadCatalog();
	});

	const catalogEntries = $derived(
		$catalogState.status === 'ready' ? $catalogState.catalog.entries : []
	);

	const entryFor = (persona: Persona) =>
		catalogEntries.find((entry) => entry.id === personaOrigin(persona));

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

	// --- playbooks ------------------------------------------------------------

	let playbookOpen = $state(false);
	let editingPlaybook = $state<Playbook>(newPlaybook());

	function editPlaybook(playbook: Playbook) {
		editingPlaybook = playbook;
		playbookOpen = true;
	}

	function createPlaybook() {
		editingPlaybook = newPlaybook();
		playbookOpen = true;
	}

	// --- knowledge ------------------------------------------------------------

	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	/** Knowledge in no collection, which is where everything starts out. */
	const looseKnowledge = $derived($knowledgeStore.filter((item) => !item.collectionId));

	/**
	 * Naming a collection happens where the collection will appear, not in a dialog
	 * stacked on the page: the row turns into a field, you type, you confirm.
	 * Creating and renaming share it, since they are the same act.
	 */
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

	// --- the store and the import ---------------------------------------------

	let storeOpen = $state(false);
	let storeFamily = $state<'' | 'personas' | 'playbooks'>('');

	/** The door is where you are: the shelf you are on decides which one opens. */
	function openStore() {
		storeFamily = shelf === 'knowledge' ? '' : shelf;
		storeOpen = true;
	}

	let importInput = $state<HTMLInputElement | undefined>();

	async function onImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		await importLibraryFiles(files);
	}
</script>

<Head title={$LL.library()} />

<div class="flex flex-col gap-4 px-5 pt-6 pb-32">
	<!-- The title, and the two things that bring something in from outside. Round
	     and in the same glass as the rest of this interface, because they are the
	     same kind of control as the search and settings keys on the home screen. -->
	<header class="flex items-center gap-2">
		<h1 class="text-active flex-1 text-2xl font-semibold tracking-tight">{$LL.library()}</h1>

		<button
			type="button"
			onclick={openStore}
			aria-label={$LL.store()}
			class="glass text-muted flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Store class="h-4 w-4" />
		</button>
		<button
			type="button"
			onclick={() => importInput?.click()}
			aria-label={$LL.import()}
			class="glass text-muted flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
		>
			<Upload class="h-4 w-4" />
		</button>
	</header>

	<!-- The three shelves, as a switch rather than as three headings down one
	     scroll. The count rides on the label: it is the one thing you want before
	     choosing, and it saves the empty shelf being a surprise. -->
	<div class="border-shade-3 bg-shade-0 flex gap-1 rounded-full border p-1">
		{#each shelves as entry (entry.id)}
			<button
				type="button"
				onclick={() => (shelf = entry.id)}
				aria-pressed={shelf === entry.id}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-medium transition-colors {shelf ===
				entry.id
					? 'bg-shade-3 text-active'
					: 'text-muted'}"
			>
				<span class="truncate">{entry.label}</span>
				<span class="text-muted text-[11px] font-normal">{entry.count}</span>
			</button>
		{/each}
	</div>

	{#if shelf === 'personas'}
		<section class="flex flex-col gap-2">
			{#each $personasStore as persona (persona.id)}
				{@const state = personaState(persona, entryFor(persona)?.contentDigest)}
				{@const stale = state === 'edited' || state === 'outdated' || state === 'edited-outdated'}
				<div class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-3 py-3">
					<!-- The row is the edit, and the buttons on it are the exceptions. A
					     persona is a thing you keep rather than a thing you run from here:
					     running it is the microphone, which is its own target. -->
					<button
						type="button"
						onclick={() => editPersona(persona)}
						class="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-70"
					>
						<PersonaAvatar {persona} size={40} />
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-1.5">
								<span class="text-active truncate text-sm font-medium">
									{persona.name || $LL.untitled()}
								</span>
								{#if stale}
									<!-- What it is now, not where it came from. Thin, and tinted
									     rather than grey: it is the one thing on the row worth
									     catching an eye. -->
									<span
										class="border-accent/30 bg-accent/10 text-accent shrink-0 rounded border px-1 text-[9px] leading-[15px] font-medium"
									>
										{state === 'edited'
											? $LL.personaStateEdited()
											: state === 'outdated'
												? $LL.personaStateOutdated()
												: $LL.personaStateEditedOutdated()}
									</span>
								{/if}
							</span>
							{#if persona.tagline}
								<span class="text-muted mt-0.5 block truncate text-xs">{persona.tagline}</span>
							{/if}
						</span>
					</button>

					{#if stale}
						{@const outdated = state === 'outdated'}
						<button
							type="button"
							disabled={restoring !== null}
							onclick={() => restore(persona)}
							aria-label={outdated
								? $LL.personaStoreUpdateTooltip()
								: $LL.personaStoreResetTooltip()}
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 {outdated
								? 'text-accent'
								: 'text-muted'}"
						>
							{#if restoring === persona.id}
								<LoaderCircle class="h-4 w-4 animate-spin" />
							{:else if outdated}
								<ArrowDownToLine class="h-4 w-4" />
							{:else}
								<RotateCcw class="h-4 w-4" />
							{/if}
						</button>
					{/if}

					<button
						type="button"
						onclick={() => talkTo(persona)}
						aria-label={$LL.personaChat()}
						class="border-shade-3 text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-95"
					>
						<Mic class="h-4 w-4" />
					</button>
				</div>
			{/each}

			{@render add($LL.personaStoreCreate(), createPersona, !canCreate)}
		</section>
	{:else if shelf === 'playbooks'}
		<section class="flex flex-col gap-2">
			{#each $playbooksStore as playbook (playbook.id)}
				<button
					type="button"
					onclick={() => editPlaybook(playbook)}
					class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-opacity active:opacity-70"
				>
					<span class="min-w-0 flex-1">
						<span class="text-active block truncate text-sm font-medium">
							{playbook.name || $LL.untitled()}
						</span>
						<span class="text-muted mt-0.5 block truncate text-xs">
							{playbook.summary ||
								$LL.playbookSections({ count: playbookSteps(playbook.instructions) })}
						</span>
					</span>
					<Pencil class="text-muted h-4 w-4 shrink-0" />
				</button>
			{/each}

			{@render add($LL.newPlaybook(), createPlaybook)}
		</section>
	{:else}
		<section class="flex flex-col gap-2">
			<!-- Loose knowledge first: it is where everything starts out, so it is what
			     you came to look at. No heading over it, because "everything not filed
			     anywhere" is not a category anyone thinks in. -->
			{#each looseKnowledge as knowledge (knowledge.id)}
				{@render document(knowledge)}
			{/each}

			{#if namingNew}
				{@render nameRow($LL.newCollection())}
			{:else}
				<div class="flex gap-2">
					{@render add($LL.newKnowledge(), () => openKnowledge())}
					<button
						type="button"
						onclick={startNamingNew}
						aria-label={$LL.newCollection()}
						class="border-shade-4 text-muted flex h-[46px] w-12 shrink-0 items-center justify-center rounded-2xl border border-dashed transition-opacity active:opacity-70"
					>
						<FolderPlus class="h-4 w-4" />
					</button>
				</div>
			{/if}

			<!-- A collection is a heading over its own rows, folded away when it is not
			     wanted. Nothing to enter and nothing to come back from, which is the one
			     thing this screen borrows unchanged from the full interface. -->
			{#each collections as collection (collection.id)}
				{@const items = knowledgeInCollection($knowledgeStore, collection.id)}
				{@const collapsed = isCollapsed(collection.id)}
				<div class="mt-2 flex flex-col gap-2">
					{#if renamingId === collection.id}
						{@render nameRow(collection.name)}
					{:else}
						<div class="flex items-center gap-1 px-1">
							<button
								type="button"
								onclick={() => toggleCollapsed(collection.id)}
								aria-expanded={!collapsed}
								class="text-active flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm font-medium"
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

							<!-- Always visible, unlike the full interface's, where they appear
							     under a pointer. There is no pointer here. -->
							<button
								type="button"
								onclick={() => startRenaming(collection.id, collection.name)}
								aria-label={$LL.rename()}
								class="text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
							<!-- What survives is on the label: "delete the folder" reads as
							     "delete what is in it" to most people, and here it does not. -->
							<ButtonConfirm
								compact
								onConfirm={() => deleteCollection(collection.id)}
								label={$LL.deleteCollectionConfirm({ name: collection.name })}
							/>
						</div>

						{#if !collapsed}
							{#each items as knowledge (knowledge.id)}
								{@render document(knowledge)}
							{/each}
						{/if}
					{/if}
				</div>
			{/each}
		</section>
	{/if}
</div>

{#snippet document(knowledge: Knowledge)}
	<button
		type="button"
		onclick={() => openKnowledge({ id: knowledge.id })}
		class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-opacity active:opacity-70"
	>
		<FileText class="text-muted h-4 w-4 shrink-0" />
		<span class="min-w-0 flex-1">
			<span class="text-active block truncate text-sm font-medium">
				{knowledge.name || $LL.untitled()}
			</span>
			<span class="text-muted mt-0.5 block text-[11px]">
				{formatTimestampToNow(knowledge.updatedAt)}
			</span>
		</span>
	</button>
{/snippet}

<!-- The way to add one more of whatever is on screen, at the end of the list where
     somebody arrives having scrolled and found nothing that suits. Dashed, so it
     reads as a slot rather than as another item. -->
{#snippet add(label: string, onclick: () => void, disabled = false)}
	<button
		type="button"
		{onclick}
		{disabled}
		class="border-shade-4 text-muted flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-3.5 text-xs transition-opacity active:opacity-70 disabled:opacity-50"
	>
		<Plus class="h-4 w-4" />
		{label}
	</button>
{/snippet}

<!-- The row became the field it is going to name. Nothing opened, nothing covered
     the list, and the name is typed where the folder will sit. -->
{#snippet nameRow(placeholder: string)}
	<div class="border-accent bg-shade-0 flex items-center gap-3 rounded-2xl border px-4 py-3.5">
		<Folder class="text-muted h-4 w-4 shrink-0" />
		<input
			bind:this={nameField}
			bind:value={draftName}
			onblur={commitName}
			onkeydown={onNameKeydown}
			{placeholder}
			class="text-active placeholder:text-muted w-full min-w-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal"
		/>
	</div>
{/snippet}

<!-- Several at once, and text as readily as JSON: the import reads whatever it is
     handed, so restricting the picker would be the one place still asking the
     question the rest of it stopped asking. -->
<input
	bind:this={importInput}
	type="file"
	multiple
	accept=".json,.md,.markdown,.txt,.csv,application/json,text/plain,text/markdown"
	class="hidden"
	onchange={onImport}
/>

{#if editing}
	<PersonaModal bind:open={personaOpen} bind:persona={editing} />
{/if}

<PlaybookModal bind:open={playbookOpen} bind:playbook={editingPlaybook} />
<LibraryStore bind:open={storeOpen} bind:family={storeFamily} />

<style lang="postcss">
	/* The same glass as everywhere else in this interface. Local to this file, like
	   its four siblings; the day it moves to one place, it moves for all five. */
	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 42%, transparent);
		backdrop-filter: blur(32px) saturate(190%);
		-webkit-backdrop-filter: blur(32px) saturate(190%);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-shade-4) 45%, transparent);
	}

	:global([data-color-theme='dark']) .glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 48%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
			0 0 0 1px color-mix(in srgb, white 8%, transparent);
	}
</style>

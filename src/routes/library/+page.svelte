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
		Trash2,
		Upload
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Head from '$lib/components/Head.svelte';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
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
		parsePersonaBundle
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
	import { installPlaybookBundle } from '$lib/playbookCatalog';
	import { newPlaybook, playbookSteps, type Playbook } from '$lib/playbooks';
	import { parsePlaybookBundle } from '$lib/playbookStore';
	import { openKnowledge } from '$lib/stores/modal';
	import { formatTimestampToNow, generateRandomId } from '$lib/utils';

	import LibraryStore from './LibraryStore.svelte';
	import PersonaModal from './PersonaModal.svelte';
	import PlaybookModal from './PlaybookModal.svelte';

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

	let importInput = $state<HTMLInputElement | undefined>();
	let storeOpen = $state(false);
	/**
	 * Which shelf the store opens on.
	 *
	 * The door is where you are: the button in the Personas section opens the
	 * store on the personas, the one in the Playbooks section on the playbooks,
	 * and the one at the top of the page on everything. Same window, three ways in.
	 */
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

	/**
	 * One Import, which reads the files rather than asking what is in them.
	 *
	 * Three menu entries all opened the same picker and then failed if you chose
	 * the wrong kind, which is a quiz about a format nobody memorises. Every one of
	 * these announces itself — a bundle says `llooma.persona` or `llooma.playbook`,
	 * an OpenWebUI export has its own shape, a knowledge file is a name and some
	 * text — so the file is asked instead.
	 *
	 * Anything that is not JSON at all is a document: a Markdown note dropped here
	 * becomes knowledge under its own file name, which is what somebody handing a
	 * `.md` to a library means by it. Guessing would be shaky over formats that had
	 * to be inferred; these say what they are, and what was shaky was the version
	 * where the right answer depended on having picked the right menu item first.
	 */
	async function onImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (!files.length) return;

		let personas = 0;
		let playbooks = 0;
		let documents = 0;
		let failed = 0;

		for (const file of files) {
			const text = await file.text();
			const json = parseJson(text);

			if (json === undefined) {
				// Not JSON, so it is what it looks like: a document.
				saveKnowledge({
					id: generateRandomId(),
					name: file.name.replace(/\.[^.]+$/, ''),
					content: text,
					updatedAt: new Date().toISOString()
				});
				documents += 1;
				continue;
			}

			for (const item of Array.isArray(json) ? json : [json]) {
				const personaBundle = parsePersonaBundle(item);
				if (personaBundle) {
					installPersonaBundle(personaBundle, { origin: 'file' });
					personas += 1;
					continue;
				}

				const playbookBundle = parsePlaybookBundle(item);
				if (playbookBundle) {
					installPlaybookBundle(playbookBundle, { origin: 'file' });
					playbooks += 1;
					continue;
				}

				// Native and OpenWebUI personas, recognised by their fields rather than
				// by a format line.
				const native = parsePersonasImport(item);
				if (native.length) {
					for (const persona of native) savePersona(persona);
					personas += native.length;
					continue;
				}

				const knowledge = parseKnowledgeImport(item);
				if (!knowledge.length) {
					failed += 1;
					continue;
				}
				for (const document of knowledge) saveKnowledge(document);
				documents += knowledge.length;
			}
		}

		const summary = [
			personas ? $LL.importedPersonas({ count: personas }) : '',
			playbooks ? $LL.importedPlaybooks({ count: playbooks }) : '',
			documents ? $LL.importedCollections({ count: documents }) : ''
		].filter(Boolean);

		if (!summary.length) return toast.error($LL.nothingImportable());
		toast.success(summary.join(' · '), {
			description: failed ? $LL.importSkipped({ count: failed }) : undefined
		});
	}

	/** `undefined` rather than a throw, so "is this JSON" is a question with an answer. */
	function parseJson(text: string): unknown {
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}

	let playbookModalOpen = $state(false);
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

<!-- Frameless like the sessions landing, and for the same reason it still carries a
     surface: see the comment there. -->
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
					<!-- One store, at the top of the page, because there is one store. The
					     small icon on each create tile opens the same window on that shelf,
					     which is where you are when you have just found nothing that suits. -->
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
			     near-identical cards are separable at a glance without a legend. -->
			<!-- The shortcut in the heading and the one at the end of the grid are both
			     worth having: the heading is where you look when you arrive knowing what
			     you want, the tile is where you end up having scrolled and found nothing
			     that suits. -->
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-active text-sm font-medium">{$LL.personas()}</h2>
					<span class="text-muted text-xs">{$personasStore.length}</span>
				</div>
			</div>

			<!-- Equal rows: a card's height comes from how many lines its tags wrap
			     onto, so two rows of personas ended up visibly different heights. Only
			     within a section — the three hold different things and forcing a
			     knowledge card to the height of a persona card would be padding, not
			     alignment. -->
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

							<!-- Both of them, spelled out. Talking to a persona is the frequent
							     act and editing it the rare one, but the Library is where you
							     manage them, so neither is left to a control that only exists
							     under a pointer. -->
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

			<!-- On a row of its own after the cards, not among them. A grid stretches
			     every cell in a row to the tallest, so among the personas this control
			     was as tall as a card, which is neither what it is nor what its twin in
			     the knowledge section looks like. Its own grid gives it one column of
			     the same width and its natural height. -->
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
			<!-- Between the personas and the knowledge on purpose: who answers, how the
			     job is done, what it is done with. That is the order somebody builds
			     things up in. -->
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

			<!-- Loose knowledge first: it is where everything starts out, so it is what
			     you came to look at. No heading over it, because "everything not filed
			     anywhere" is not a category anyone thinks in. -->
			<div class="mb-6">
				<div
					class="library-section grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3"
					style="--section-turn: -110"
				>
					{#each looseKnowledge as knowledge (knowledge.id)}
						{@render knowledgeCard(knowledge)}
					{/each}

					{#if namingNew}
						<!-- The card became the field it was going to create. Nothing opened,
						     nothing covered the grid, and the name is typed where the folder
						     will sit. -->
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

						{#if confirmingDeleteId === collection.id}
							<!-- Says what survives, because "delete the folder" reads as "delete
							     what is in it" to most people, and here it does not. -->
							<span class="text-muted ml-auto flex items-center gap-2 text-xs">
								<span class="hidden sm:inline">
									{$LL.deleteCollectionConfirm({ name: collection.name })}
								</span>
								<button
									type="button"
									onclick={() => removeCollection(collection.id)}
									class="text-negative font-medium transition-opacity hover:opacity-80"
								>
									{$LL.delete()}
								</button>
								<button
									type="button"
									onclick={() => (confirmingDeleteId = null)}
									class="hover:text-active transition-colors"
								>
									{$LL.cancel()}
								</button>
							</span>
						{:else}
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
								<button
									type="button"
									onclick={() => (confirmingDeleteId = collection.id)}
									title={$LL.delete()}
									aria-label={$LL.delete()}
									class="hover:text-negative rounded p-1 transition-colors"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							</div>
						{/if}
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
<!-- Several at once, and text as readily as JSON: the button reads whatever it
     is handed, so restricting the picker would be the one place still asking the
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
	<PersonaModal bind:open={modalOpen} bind:persona={editing} />
{/if}

<PlaybookModal bind:open={playbookModalOpen} bind:playbook={editingPlaybook} />
<LibraryStore bind:open={storeOpen} bind:family={storeFamily} />

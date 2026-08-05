<script lang="ts">
	import {
		ChevronDown,
		ChevronLeft,
		Cpu,
		Download,
		FileText,
		Folder,
		FolderOpen,
		FolderPlus,
		Pencil,
		Plus,
		Upload,
		UserRound,
		Users
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Head from '$lib/components/Head.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import {
		createCollection,
		deleteCollection,
		knowledgeInCollection,
		parseKnowledgeImport,
		renameCollection,
		saveKnowledge
	} from '$lib/knowledge';
	import { knowledgeStore, personasStore, settingsStore } from '$lib/localStorage';
	import {
		installPersona,
		launchPersona,
		newPersona,
		parsePersonasImport,
		savePersona,
		type Persona
	} from '$lib/personas';
	import { personasConfig } from '$lib/personasConfig';
	import { openKnowledge } from '$lib/stores/modal';
	import { formatTimestampToNow } from '$lib/utils';

	import PersonaModal from './PersonaModal.svelte';

	let editing = $state<Persona | null>(null);
	let modalOpen = $state(false);
	/** The collection being looked inside, or nothing for the top level. */
	let openCollectionId = $state<string | null>(null);

	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	const openCollection = $derived(collections.find((c) => c.id === openCollectionId) ?? null);
	// At the top level, loose knowledge only: what is filed shows inside its folder,
	// not twice.
	const visibleKnowledge = $derived(
		openCollectionId
			? knowledgeInCollection($knowledgeStore, openCollectionId)
			: $knowledgeStore.filter((k) => !k.collectionId)
	);

	function addCollection() {
		const name = window.prompt($LL.newCollection())?.trim();
		if (name) openCollectionId = createCollection(name).id;
	}

	function renameOpenCollection() {
		if (!openCollection) return;
		const name = window.prompt($LL.rename(), openCollection.name)?.trim();
		if (name) renameCollection(openCollection.id, name);
	}

	/** Deletes the grouping only: its knowledge comes back to the top level. */
	function removeOpenCollection() {
		if (!openCollection) return;
		if (!window.confirm($LL.deleteCollectionConfirm({ name: openCollection.name }))) return;
		deleteCollection(openCollection.id);
		openCollectionId = null;
	}
	let personaFileInput = $state<HTMLInputElement | undefined>();
	let knowledgeFileInput = $state<HTMLInputElement | undefined>();

	const canCreate = $derived($personasConfig.canCreate);
	// Admin-shared personas the user hasn't installed (or already owns) yet.
	const sharedToShow = $derived(
		$personasConfig.shared.filter(
			(sp) => !$personasStore.some((p) => p.id === sp.id || p.installedFrom === sp.id)
		)
	);

	function install(persona: Persona) {
		installPersona(persona);
		toast.success($LL.installedPersona({ name: persona.name }));
	}

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

	function onImportPersonas(event: Event) {
		readJsonFile(event.target as HTMLInputElement, (data) => {
			const personas = parsePersonasImport(data);
			if (personas.length === 0) return toast.error($LL.noPersonasInFile());
			for (const persona of personas) savePersona(persona);
			toast.success($LL.importedPersonas({ count: personas.length }));
		});
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

<Head title={$LL.library()} />

<div class="flex h-full flex-col">
	<MobileMenuBar />
	<div class="min-h-0 flex-1 overflow-auto">
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
			<div class="mb-3 flex items-baseline gap-2">
				<h2 class="text-sm font-medium text-active">{$LL.personas()}</h2>
				<span class="text-xs text-muted">{$personasStore.length}</span>
			</div>

			<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
				{#each $personasStore as persona (persona.id)}
					<div class="group relative">
						<button
							type="button"
							onclick={() => chatWith(persona)}
							class="flex h-full w-full flex-col rounded-xl border border-shade-3 bg-shade-0 p-3.5 text-left transition-colors hover:border-shade-4"
						>
							<div class="mb-2.5 flex items-start justify-between gap-2">
								<PersonaAvatar {persona} size={40} />
								{#if persona.shared}
									<span
										class="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent transition-opacity group-hover:opacity-0 [@media(hover:none)]:opacity-0"
										title={$LL.sharedWithUsers()}
									>
										<Users class="h-3 w-3" />
										{$LL.shared()}
									</span>
								{/if}
							</div>
							<p class="truncate text-sm font-medium text-active">
								{persona.name || $LL.untitled()}
							</p>
							{#if persona.tagline}
								<p class="mb-2 line-clamp-2 text-xs text-muted">{persona.tagline}</p>
							{/if}
							{#if persona.modelName}
								<span class="mt-auto flex items-center gap-1 truncate pt-1 text-[11px] text-muted">
									<Cpu class="h-3 w-3 shrink-0" />{persona.modelName}
								</span>
							{/if}
						</button>
						<button
							type="button"
							aria-label={$LL.editPersona()}
							title={$LL.edit()}
							onclick={() => editPersona(persona)}
							class="absolute right-2 top-2.5 rounded p-0.5 text-muted transition hover:text-active [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
						>
							<Pencil class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}

				<!-- New persona -->
				{#if canCreate}
					<button
						type="button"
						onclick={createPersona}
						class="flex min-h-[118px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-shade-4 p-3.5 text-muted transition-colors hover:border-accent hover:text-active"
					>
						<Plus class="h-5 w-5" />
						<span class="text-xs">{$LL.newPersona()}</span>
					</button>
				{/if}
			</div>

			<!-- Shared by admin -->
			{#if sharedToShow.length > 0}
				<div class="mb-3 flex items-baseline gap-2">
					<h2 class="text-sm font-medium text-active">{$LL.sharedByAdmin()}</h2>
					<span class="text-xs text-muted">{sharedToShow.length}</span>
				</div>
				<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
					{#each sharedToShow as persona (persona.id)}
						<div class="flex flex-col rounded-xl border border-shade-3 bg-shade-0 p-3.5">
							<div class="mb-2.5">
								<PersonaAvatar {persona} size={40} />
							</div>
							<p class="truncate text-sm font-medium text-active">
								{persona.name || $LL.untitled()}
							</p>
							{#if persona.tagline}
								<p class="mb-2 line-clamp-2 text-xs text-muted">{persona.tagline}</p>
							{/if}
							<button
								type="button"
								onclick={() => install(persona)}
								class="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-active"
							>
								<Download class="h-3.5 w-3.5" />
								{$LL.install()}
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Knowledge -->
			<div class="mb-3 flex items-baseline gap-2">
				{#if openCollection}
					<!-- Inside a collection: a way back, then its name. Two levels is the
					     whole hierarchy, so a breadcrumb is one button and a title. -->
					<button
						type="button"
						onclick={() => (openCollectionId = null)}
						class="flex items-center gap-1 text-sm text-muted transition-colors hover:text-active"
					>
						<ChevronLeft class="h-4 w-4" />
						{$LL.knowledge()}
					</button>
					<h2 class="min-w-0 truncate text-sm font-medium text-active">{openCollection.name}</h2>
					<span class="text-xs text-muted">{visibleKnowledge.length}</span>
					<button
						type="button"
						onclick={() => renameOpenCollection()}
						class="text-xs text-muted transition-colors hover:text-active"
					>
						{$LL.rename()}
					</button>
					<button
						type="button"
						onclick={() => removeOpenCollection()}
						class="text-xs text-muted transition-colors hover:text-negative"
					>
						{$LL.delete()}
					</button>
				{:else}
					<h2 class="text-sm font-medium text-active">{$LL.knowledge()}</h2>
					<span class="text-xs text-muted">{$knowledgeStore.length}</span>
				{/if}
			</div>

			<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
				{#if !openCollectionId}
					<!-- Collections first, as folders are shown everywhere else: a group is
					     not a peer of the things inside it. -->
					{#each collections as collection (collection.id)}
						{@const count = knowledgeInCollection($knowledgeStore, collection.id).length}
						<button
							type="button"
							onclick={() => (openCollectionId = collection.id)}
							class="flex items-center gap-2.5 rounded-xl border border-shade-3 bg-shade-2 p-3.5 text-left transition-colors hover:border-shade-4"
						>
							<Folder class="h-5 w-5 shrink-0 text-muted" />
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-active">{collection.name}</p>
								<p class="text-[11px] text-muted">{$LL.knowledgeCount({ count })}</p>
							</div>
						</button>
					{/each}
				{/if}

				{#each visibleKnowledge as knowledge (knowledge.id)}
					<button
						type="button"
						onclick={() => openKnowledge({ id: knowledge.id })}
						class="flex items-center gap-2.5 rounded-xl border border-shade-3 bg-shade-0 p-3.5 text-left transition-colors hover:border-shade-4"
					>
						<FileText class="h-5 w-5 shrink-0 text-muted" />
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-active">
								{knowledge.name || $LL.untitled()}
							</p>
							<p class="text-[11px] text-muted">{formatTimestampToNow(knowledge.updatedAt)}</p>
						</div>
					</button>
				{/each}

				<!-- One dashed card, two things: the main action fills it, and the folder
				     sits at its edge. Making a collection is rarer than writing a piece of
				     knowledge, so it gets the smaller half. -->
				<div
					class="group flex items-stretch gap-1 rounded-xl border border-dashed border-shade-4 transition-colors hover:border-accent"
				>
					<button
						type="button"
						onclick={() => openKnowledge({ collectionId: openCollectionId ?? undefined })}
						class="flex flex-1 items-center justify-center gap-1.5 p-3.5 text-muted transition-colors hover:text-active"
					>
						<Plus class="h-4 w-4" />
						<span class="text-xs">{$LL.newKnowledge()}</span>
					</button>
					{#if !openCollectionId}
						<button
							type="button"
							onclick={() => addCollection()}
							title={$LL.newCollection()}
							aria-label={$LL.newCollection()}
							class="my-2.5 border-l border-shade-3 px-3 text-muted transition-colors hover:text-active"
						>
							<FolderPlus class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>
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
{/if}

<script lang="ts">
	import {
		ChevronDown,
		Cpu,
		Download,
		FolderOpen,
		Pencil,
		Plus,
		Upload,
		UserRound,
		Users
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { fade } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { generateNewUrl } from '$lib/components/ButtonNew.js';
	import Head from '$lib/components/Head.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { parseKnowledgeImport, saveKnowledge } from '$lib/knowledge';
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
	import { Sitemap } from '$lib/sitemap';
	import { formatTimestampToNow } from '$lib/utils';

	import PersonaModal from './PersonaModal.svelte';

	let editing = $state<Persona | null>(null);
	let modalOpen = $state(false);
	let importOpen = $state(false);
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

				<div class="relative shrink-0">
					<button
						type="button"
						onclick={() => (importOpen = !importOpen)}
						class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
					>
						<Upload class="h-4 w-4" />
						{$LL.import()}
						<ChevronDown class="h-3.5 w-3.5 opacity-80" />
					</button>

					{#if importOpen}
						<button
							class="fixed inset-0 z-10 cursor-default"
							aria-label={$LL.dismiss()}
							onclick={() => (importOpen = false)}
						></button>
						<div
							class="absolute right-0 top-full z-20 mt-1.5 flex w-48 flex-col gap-0.5 rounded-lg border border-shade-3 bg-shade-0 p-1 shadow-lg"
							transition:fade={{ duration: 80 }}
						>
							{#if canCreate}
								<button
									type="button"
									onclick={() => {
										importOpen = false;
										personaFileInput?.click();
									}}
									class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
								>
									<UserRound class="h-4 w-4 shrink-0 text-muted" />
									{$LL.importPersona()}
								</button>
							{/if}
							<button
								type="button"
								onclick={() => {
									importOpen = false;
									knowledgeFileInput?.click();
								}}
								class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
							>
								<FolderOpen class="h-4 w-4 shrink-0 text-muted" />
								{$LL.importKnowledge()}
							</button>
						</div>
					{/if}
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
				<h2 class="text-sm font-medium text-active">{$LL.knowledge()}</h2>
				<span class="text-xs text-muted">{$knowledgeStore.length}</span>
			</div>

			<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
				{#each $knowledgeStore as knowledge (knowledge.id)}
					<a
						href={generateNewUrl(Sitemap.KNOWLEDGE, knowledge.id)}
						class="flex items-center gap-2.5 rounded-xl border border-shade-3 bg-shade-0 p-3.5 transition-colors hover:border-shade-4"
					>
						<FolderOpen class="h-5 w-5 shrink-0 text-muted" />
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-active">
								{knowledge.name || $LL.untitled()}
							</p>
							<p class="text-[11px] text-muted">{formatTimestampToNow(knowledge.updatedAt)}</p>
						</div>
					</a>
				{/each}

				<a
					href={generateNewUrl(Sitemap.KNOWLEDGE)}
					class="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-shade-4 p-3.5 text-muted transition-colors hover:border-accent hover:text-active"
				>
					<Plus class="h-4 w-4" />
					<span class="text-xs">{$LL.newCollection()}</span>
				</a>
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

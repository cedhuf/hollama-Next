<script lang="ts">
	import { Cpu, Download, FolderOpen, Pencil, Plus, Upload } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { generateNewUrl } from '$lib/components/ButtonNew.js';
	import Head from '$lib/components/Head.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
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
	let fileInput = $state<HTMLInputElement | undefined>();

	const canCreate = $derived($personasConfig.canCreate);
	// Admin-shared personas the user hasn't installed (or already owns) yet.
	const sharedToShow = $derived(
		$personasConfig.shared.filter(
			(sp) => !$personasStore.some((p) => p.id === sp.id || p.installedFrom === sp.id)
		)
	);

	function install(persona: Persona) {
		installPersona(persona);
		toast.success(`Installed “${persona.name}”`);
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
		goto(`/sessions/${launchPersona(persona, $settingsStore.models)}`);
	}

	function onImportFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const personas = parsePersonasImport(JSON.parse(e.target?.result as string));
				if (personas.length === 0) {
					toast.error('No personas found in this file');
					return;
				}
				for (const persona of personas) savePersona(persona);
				toast.success(`Imported ${personas.length} persona${personas.length === 1 ? '' : 's'}`);
			} catch (error) {
				toast.error('Import failed', {
					description: error instanceof Error ? error.message : 'Invalid file'
				});
			} finally {
				input.value = '';
			}
		};
		reader.readAsText(file);
	}
</script>

<Head title="Library" />

<div class="flex h-full flex-col overflow-auto">
	<div class="mx-auto w-full max-w-4xl px-6 py-8">
		<!-- Header -->
		<div class="mb-1 flex items-center justify-between gap-3">
			<h1 class="text-xl font-semibold tracking-tight text-active">Library</h1>
			{#if canCreate}
				<div class="flex items-center gap-2">
					<input
						bind:this={fileInput}
						type="file"
						accept="application/json,.json"
						class="hidden"
						onchange={onImportFile}
					/>
					<button
						type="button"
						onclick={() => fileInput?.click()}
						class="flex items-center gap-1.5 rounded-lg border border-shade-3 px-3 py-1.5 text-sm text-muted transition-colors hover:border-shade-4 hover:text-active"
					>
						<Upload class="h-3.5 w-3.5" /> Import
					</button>
				</div>
			{/if}
		</div>
		<p class="mb-7 text-sm text-muted">
			Everything you create lives here — your personas and your knowledge.
		</p>

		<!-- Personas -->
		<div class="mb-3 flex items-baseline gap-2">
			<h2 class="text-sm font-medium text-active">Personas</h2>
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
						<div class="mb-2.5">
							<PersonaAvatar {persona} size={40} />
						</div>
						<p class="truncate text-sm font-medium text-active">{persona.name || 'Untitled'}</p>
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
						aria-label="Edit persona"
						title="Edit"
						onclick={() => editPersona(persona)}
						class="absolute right-2 top-2.5 rounded p-0.5 text-muted opacity-0 transition-colors hover:text-active group-hover:opacity-100"
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
					<span class="text-xs">New persona</span>
				</button>
			{/if}
		</div>

		<!-- Shared by admin -->
		{#if sharedToShow.length > 0}
			<div class="mb-3 flex items-baseline gap-2">
				<h2 class="text-sm font-medium text-active">Shared by admin</h2>
				<span class="text-xs text-muted">{sharedToShow.length}</span>
			</div>
			<div class="mb-9 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
				{#each sharedToShow as persona (persona.id)}
					<div class="flex flex-col rounded-xl border border-shade-3 bg-shade-0 p-3.5">
						<div class="mb-2.5">
							<PersonaAvatar {persona} size={40} />
						</div>
						<p class="truncate text-sm font-medium text-active">{persona.name || 'Untitled'}</p>
						{#if persona.tagline}
							<p class="mb-2 line-clamp-2 text-xs text-muted">{persona.tagline}</p>
						{/if}
						<button
							type="button"
							onclick={() => install(persona)}
							class="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-shade-3 px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-active"
						>
							<Download class="h-3.5 w-3.5" /> Install
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
						<p class="truncate text-sm font-medium text-active">{knowledge.name || 'Untitled'}</p>
						<p class="text-[11px] text-muted">{formatTimestampToNow(knowledge.updatedAt)}</p>
					</div>
				</a>
			{/each}

			<a
				href={generateNewUrl(Sitemap.KNOWLEDGE)}
				class="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-shade-4 p-3.5 text-muted transition-colors hover:border-accent hover:text-active"
			>
				<Plus class="h-4 w-4" />
				<span class="text-xs">New collection</span>
			</a>
		</div>
	</div>
</div>

{#if editing}
	<PersonaModal bind:open={modalOpen} bind:persona={editing} />
{/if}

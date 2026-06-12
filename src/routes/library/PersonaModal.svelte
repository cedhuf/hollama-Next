<script lang="ts">
	import { Download, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import { env } from '$env/dynamic/public';
	import Modal from '$lib/components/Modal.svelte';
	import ModelPicker from '$lib/components/ModelPicker.svelte';
	import { knowledgeStore } from '$lib/localStorage';
	import {
		deletePersona,
		exportPersonas,
		PERSONA_AVATAR_COLORS,
		personaInitials,
		savePersona,
		type Persona
	} from '$lib/personas';
	import { publishSharedPersonas } from '$lib/personasConfig';
	import { currentRole } from '$lib/stores/auth';

	interface Props {
		open: boolean;
		persona: Persona;
	}

	let { open = $bindable(false), persona = $bindable() }: Props = $props();

	const field =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

	const initials = $derived(personaInitials(persona.name));
	const attached = $derived(persona.knowledgeIds ?? []);
	const canShare = $derived(env.PUBLIC_MODE === 'server' && $currentRole === 'admin');

	function onShareChange() {
		persist();
		publishSharedPersonas();
	}

	/** Persist only once the persona has a name, so empty drafts never clutter the Library. */
	function persist() {
		if (persona.name.trim()) savePersona(persona);
	}

	function toggleKnowledge(id: string) {
		const ids = persona.knowledgeIds ?? [];
		persona.knowledgeIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
		persist();
	}

	function removeImage() {
		persona.avatarImage = undefined;
		persist();
	}

	function exportThis() {
		const data = exportPersonas([persona]);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${persona.name.trim() || 'persona'}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function remove() {
		if (!confirm(`Delete “${persona.name.trim() || 'this persona'}”?`)) return;
		deletePersona(persona.id);
		toast.info('Persona deleted');
		open = false;
	}
</script>

<Modal bind:open>
	<div class="flex w-full flex-col gap-5 overflow-auto p-6">
		<!-- Identity -->
		<div class="flex items-center gap-3">
			<div
				class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-shade-0"
				style="background-color: {persona.avatarColor}"
			>
				{#if persona.avatarImage}
					<img src={persona.avatarImage} alt={persona.name} class="h-14 w-14 object-cover" />
				{:else}
					{initials}
				{/if}
			</div>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<input
					class={field}
					bind:value={persona.name}
					oninput={persist}
					placeholder="Name (e.g. Léa)"
				/>
				<input
					class={field}
					bind:value={persona.tagline}
					oninput={persist}
					placeholder="One-line description (e.g. Patient maths tutor)"
				/>
			</div>
		</div>

		<!-- Avatar colour / image -->
		<div class="flex items-center gap-2">
			<span class="text-xs text-muted">Avatar</span>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each PERSONA_AVATAR_COLORS as color (color)}
					<button
						type="button"
						aria-label="Choose avatar colour"
						onclick={() => {
							persona.avatarColor = color;
							persist();
						}}
						class="h-5 w-5 rounded-full ring-offset-1 ring-offset-shade-1 transition-all {persona.avatarColor ===
						color
							? 'ring-2 ring-active'
							: ''}"
						style="background-color: {color}"
					></button>
				{/each}
			</div>
			{#if persona.avatarImage}
				<button
					type="button"
					class="ml-auto text-xs text-link hover:underline"
					onclick={removeImage}
				>
					Remove image
				</button>
			{/if}
		</div>

		<!-- Model -->
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-muted">Model</span>
			<ModelPicker bind:value={persona.modelName} onSelect={persist} />
		</label>

		<!-- System prompt: the "soul" -->
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-muted">System prompt</span>
			<textarea
				class={field}
				rows="7"
				bind:value={persona.systemPrompt}
				oninput={persist}
				placeholder="Who they are, how they speak, what they do… (e.g. “You are Léa, a patient maths tutor…”)"
			></textarea>
			<span class="text-xs text-muted">The persona's personality lives here.</span>
		</label>

		<!-- Greeting -->
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-muted">Greeting <span class="text-muted">(optional)</span></span>
			<textarea
				class={field}
				rows="2"
				bind:value={persona.greeting}
				oninput={persist}
				placeholder="Opening line shown when the conversation starts…"
			></textarea>
		</label>

		<!-- Web search -->
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={persona.webSearch} onchange={persist} />
			<span>Allow web search</span>
		</label>

		<!-- Admin: share with users -->
		{#if canShare}
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={persona.shared} onchange={onShareChange} />
				<span>Share with users</span>
			</label>
		{/if}

		<!-- Knowledge -->
		{#if $knowledgeStore.length > 0}
			<div class="flex flex-col gap-1.5 text-sm">
				<span class="text-muted">Knowledge</span>
				<div class="flex flex-col gap-1 rounded-md border border-shade-3 bg-shade-0 p-2">
					{#each $knowledgeStore as k (k.id)}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={attached.includes(k.id)}
								onchange={() => toggleKnowledge(k.id)}
							/>
							<span class="truncate">{k.name || 'Untitled'}</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex items-center justify-between border-t border-shade-3 pt-4">
			<button
				type="button"
				class="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
				onclick={exportThis}
			>
				<Download class="h-3.5 w-3.5" /> Export
			</button>
			<button
				type="button"
				class="flex items-center gap-1.5 text-xs text-red-600 transition-colors hover:underline"
				onclick={remove}
			>
				<Trash2 class="h-3.5 w-3.5" /> Delete
			</button>
		</div>
	</div>
</Modal>

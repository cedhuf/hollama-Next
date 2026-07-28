<script lang="ts">
	import { Download, Trash2, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import { env } from '$env/dynamic/public';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
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

	import SettingsField from '../settings/SettingsField.svelte';
	import SettingsSection from '../settings/SettingsSection.svelte';

	interface Props {
		open: boolean;
		persona: Persona;
	}

	let { open = $bindable(false), persona = $bindable() }: Props = $props();

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

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<!-- Header: live title + close, aligned like the Settings modal -->
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">
				{persona.name.trim() || 'New persona'}
			</span>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label="Close"
				class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Body -->
		<div class="min-h-0 flex-1 overflow-auto p-4">
			<div class="mx-auto flex w-full max-w-[60ch] flex-col gap-6">
				<SettingsSection title="Identity">
					<div class="flex items-center gap-4">
						<AvatarEditor
							image={persona.avatarImage}
							color={persona.avatarColor}
							{initials}
							colors={PERSONA_AVATAR_COLORS}
							label={persona.name}
							onColorChange={(c) => {
								persona.avatarColor = c;
								persist();
							}}
							onImageChange={(url) => {
								persona.avatarImage = url;
								persist();
							}}
							onImageRemove={() => {
								persona.avatarImage = undefined;
								persist();
							}}
						/>

						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<input
								class="settings-field"
								bind:value={persona.name}
								oninput={persist}
								placeholder="Name (e.g. Léa)"
							/>
							<input
								class="settings-field"
								bind:value={persona.tagline}
								oninput={persist}
								placeholder="One-line description (e.g. Patient maths tutor)"
							/>
						</div>
					</div>
				</SettingsSection>

				<SettingsSection title="Behaviour">
					<SettingsField label="Model">
						<ModelPicker bind:value={persona.modelName} onSelect={persist} />
					</SettingsField>

					<SettingsField label="System prompt" hint="The persona's personality lives here.">
						<textarea
							class="settings-field min-h-40 resize-y"
							rows="7"
							bind:value={persona.systemPrompt}
							oninput={persist}
							placeholder="Who they are, how they speak, what they do… (e.g. “You are Léa, a patient maths tutor…”)"
						></textarea>
					</SettingsField>

					<SettingsField label="Greeting (optional)">
						<textarea
							class="settings-field resize-y"
							rows="2"
							bind:value={persona.greeting}
							oninput={persist}
							placeholder="Opening line shown when the conversation starts…"
						></textarea>
					</SettingsField>

					<FieldCheckbox
						label="Allow web search"
						bind:checked={persona.webSearch}
						onChange={persist}
					/>
					{#if canShare}
						<FieldCheckbox
							label="Share with users"
							bind:checked={persona.shared}
							onChange={onShareChange}
						/>
					{/if}
				</SettingsSection>

				{#if $knowledgeStore.length > 0}
					<SettingsSection title="Knowledge" description="Collections this persona can draw on.">
						<div class="flex flex-col gap-1 rounded-lg border border-shade-3 bg-shade-0 p-1.5">
							{#each $knowledgeStore as k (k.id)}
								<div class="rounded-md px-2 py-1.5 hover:bg-shade-1">
									<FieldCheckbox
										label={k.name || 'Untitled'}
										checked={attached.includes(k.id)}
										onChange={() => toggleKnowledge(k.id)}
									/>
								</div>
							{/each}
						</div>
					</SettingsSection>
				{/if}
			</div>
		</div>

		<!-- Footer: actions pinned so Delete/Export are always reachable -->
		<div class="flex shrink-0 items-center justify-between border-t border-shade-2 px-4 py-3">
			<button
				type="button"
				class="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
				onclick={exportThis}
			>
				<Download class="h-3.5 w-3.5" /> Export
			</button>
			<button
				type="button"
				class="flex items-center gap-1.5 text-xs text-negative transition-colors hover:underline"
				onclick={remove}
			>
				<Trash2 class="h-3.5 w-3.5" /> Delete
			</button>
		</div>
	</div>
</Modal>

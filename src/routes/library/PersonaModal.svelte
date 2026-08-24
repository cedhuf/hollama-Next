<script lang="ts">
	import { Eraser, Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import EditorModal from '$lib/components/EditorModal.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { LANGUAGE_LABELS } from '$lib/i18n';
	import { knowledgeStore, personaMemoryStore, settingsStore } from '$lib/localStorage';
	import { personaToBundle } from '$lib/personaBundle';
	import { PERSONA_GLYPHS } from '$lib/personaGlyphs';
	import { contextCost, emptyMemory, MEMORY_LIMITS, type PersonaMemory } from '$lib/personaMemory';
	import {
		deletePersona,
		PERSONA_AVATAR_COLORS,
		personaInitials,
		savePersona,
		type Persona
	} from '$lib/personas';
	import { personasConfig, publishSharedPersonas } from '$lib/personasConfig';
	import { toast } from '$lib/toast';

	import SettingsField from '../settings/SettingsField.svelte';
	import SettingsHint from '../settings/SettingsHint.svelte';
	import SettingsSection from '../settings/SettingsSection.svelte';

	interface Props {
		open: boolean;
		persona: Persona;
	}

	let { open = $bindable(false), persona = $bindable() }: Props = $props();

	const initials = $derived(personaInitials(persona.name));
	const attached = $derived(persona.knowledgeIds ?? []);
	/** What an empty language field means, spelled out where it is left empty. */
	const interfaceLanguage = $derived(
		LANGUAGE_LABELS[$settingsStore.userLanguage as keyof typeof LANGUAGE_LABELS] ?? 'English'
	);

	/**
	 * What this persona has remembered about you, shown so it can be corrected.
	 *
	 * The real guardrail against a memory going wrong is not a cap, it is that you
	 * can read it. A note nobody can see is a note nobody can fix, and a persona
	 * quietly working from something untrue about you is the failure this panel
	 * exists to make impossible.
	 *
	 * Never leaves with the persona: it is not in the bundle, not in the digest,
	 * and not in what an admin shares. It belongs to this pairing of persona and
	 * account, and to nothing else.
	 */
	const memory = $derived<PersonaMemory>(
		$personaMemoryStore.find((m) => m.id === persona.id) ?? emptyMemory(persona.id)
	);
	const memoryUsed = $derived(contextCost(memory));
	const memoryOn = $derived($personasConfig.memoryEnabled);

	function saveMemory(next: PersonaMemory) {
		personaMemoryStore.upsert({ ...next, updatedAt: new Date().toISOString() });
	}

	function setProfileText(text: string) {
		saveMemory({ ...memory, profile: text });
	}

	function forget(id: string) {
		saveMemory({ ...memory, notes: memory.notes.filter((note) => note.id !== id) });
	}

	function forgetEverything() {
		saveMemory({ ...memory, profile: '', notes: [] });
	}

	/**
	 * A shared persona that has been edited has to be republished.
	 *
	 * What users are offered is a snapshot taken when it was shared, and it was
	 * only ever retaken when the share switch itself moved. So renaming a shared
	 * persona, or rewriting its prompt, changed nothing for anybody: the store went
	 * on offering the old name and the old text, and the card comparing it with the
	 * store's original still found them identical, because the snapshot was still
	 * the original.
	 *
	 * Debounced, since this runs on every keystroke in every field.
	 */
	let publishTimer: ReturnType<typeof setTimeout> | undefined;
	function schedulePublish() {
		clearTimeout(publishTimer);
		publishTimer = setTimeout(() => void publishSharedPersonas(), 600);
	}

	/** Persist only once the persona has a name, so empty drafts never clutter the Library. */
	function persist() {
		if (!persona.name.trim()) return;
		savePersona(persona);
		if (persona.shared) schedulePublish();
	}

	function toggleKnowledge(id: string) {
		const ids = persona.knowledgeIds ?? [];
		persona.knowledgeIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
		persist();
	}

	/**
	 * What leaves is a bundle, not the stored record.
	 *
	 * The two used to be the same thing, which meant handing over an id, a
	 * conversation binding and a list of knowledge ids pointing at documents the
	 * recipient does not have. A bundle carries what was written, with its
	 * documents in it, and is the same file the store serves.
	 */
	function exportThis() {
		const data = JSON.stringify(personaToBundle(persona), null, 2);
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
		const wasShared = persona.shared;
		deletePersona(persona.id);
		// Deleting a shared persona has to stop offering it too, or it lingers in
		// everyone else's store with nothing behind it.
		if (wasShared) void publishSharedPersonas();
		toast.info('Persona deleted');
		open = false;
	}
</script>

<EditorModal
	bind:open
	title={persona.name}
	placeholder={$LL.newPersona()}
	onExport={exportThis}
	onDelete={remove}
>
	<SettingsSection title="Identity" card>
		<div class="flex items-center gap-4">
			<AvatarEditor
				image={persona.avatarImage}
				color={persona.avatarColor}
				{initials}
				colors={PERSONA_AVATAR_COLORS}
				glyph={persona.avatarGlyph}
				glyphs={PERSONA_GLYPHS}
				label={persona.name}
				onColorChange={(c) => {
					persona.avatarColor = c;
					persist();
				}}
				onGlyphChange={(id) => {
					persona.avatarGlyph = id;
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

	<SettingsSection title="Behaviour" card>
		<SettingsField label="Model">
			<!-- Naming no model is a legitimate answer, and the common one for a
						     persona that travels: it runs on whatever the reader's default is.
						     Said in the list rather than left as an empty field, which reads as
						     unfinished. -->
			<ModelSelect
				bind:value={persona.modelName}
				emptyLabel={$LL.personaDefaultModel()}
				onSelect={persist}
			/>
		</SettingsField>

		<SettingsField label={$LL.personaLanguageLabel()} hint={$LL.personaLanguageHint()}>
			<!-- Free text, not the list of locales the interface is translated into:
						     those are two different things. Empty follows the interface, and the
						     placeholder shows what that currently resolves to. -->
			<input
				class="settings-field"
				bind:value={persona.language}
				oninput={persist}
				placeholder={interfaceLanguage}
				spellcheck="false"
			/>
		</SettingsField>

		<SettingsField label="System prompt" hint="The persona's personality lives here.">
			<textarea
				class="settings-field field-grow min-h-40"
				rows="7"
				bind:value={persona.systemPrompt}
				oninput={persist}
				placeholder="Who they are, how they speak, what they do… (e.g. “You are Léa, a patient maths tutor…”)"
			></textarea>
		</SettingsField>

		<SettingsField label="Greeting (optional)">
			<textarea
				class="settings-field field-grow min-h-24"
				rows="2"
				bind:value={persona.greeting}
				oninput={persist}
				placeholder="Opening line shown when the conversation starts…"></textarea>
		</SettingsField>

		<FieldCheckbox label="Allow web search" bind:checked={persona.webSearch} onChange={persist} />
		<!-- No share switch here any more. Offering a persona to an instance is
					     done in the store, in one place, beside the button that offers the
					     store's own and beside the list of what is currently offered. A
					     checkbox buried in an editor meant an admin had to remember which of
					     their personas they had ticked, with nowhere to go and look. -->
	</SettingsSection>

	{#if memoryOn}
		<SettingsSection
			title={$LL.memorySectionTitle()}
			description={$LL.memorySectionDescription({ name: persona.name || $LL.thisPersona() })}
		>
			<SettingsField
				label={$LL.memoryProfileLabel()}
				hint={$LL.memoryProfileHint({ used: memoryUsed, total: MEMORY_LIMITS.alwaysInContext })}
			>
				<textarea
					class="settings-field min-h-24"
					value={memory.profile}
					placeholder={$LL.memoryProfilePlaceholder()}
					oninput={(e) => setProfileText(e.currentTarget.value)}></textarea>
			</SettingsField>

			{#if memory.notes.length}
				<div class="flex flex-col gap-2">
					{#each memory.notes as note (note.id)}
						<div class="border-shade-3 flex flex-col gap-1 rounded-md border p-2.5">
							<div class="flex items-start justify-between gap-2">
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{note.title}</span>
									<span class="text-muted block truncate text-xs">{note.when}</span>
								</span>
								<button
									type="button"
									class="text-muted hover:text-active shrink-0 transition-colors"
									onclick={() => forget(note.id)}
									aria-label={$LL.memoryForgetNote({ title: note.title })}
								>
									<Trash2 class="base-icon" />
								</button>
							</div>
							<p class="text-muted text-xs leading-snug whitespace-pre-wrap">{note.body}</p>
						</div>
					{/each}
				</div>
				<!-- Same two-click answer as everywhere else, rather than the browser's
				     own box: forgetting every note is a deletion like the others. -->
				<ButtonConfirm
					onConfirm={forgetEverything}
					icon={Eraser}
					text={$LL.memoryForgetAll()}
					label={$LL.memoryForgetAllConfirm({ name: persona.name || '' })}
				/>
			{:else}
				<SettingsHint>{$LL.memoryNoNotes()}</SettingsHint>
			{/if}
		</SettingsSection>
	{/if}

	{#if $knowledgeStore.length > 0}
		<SettingsSection title="Knowledge" description="Collections this persona can draw on.">
			<div class="border-shade-3 bg-shade-0 flex flex-col gap-1 rounded-lg border p-1.5">
				{#each $knowledgeStore as k (k.id)}
					<div class="hover:bg-shade-1 rounded-md px-2 py-1.5">
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
</EditorModal>

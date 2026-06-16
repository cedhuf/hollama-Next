<script lang="ts">
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import P from '$lib/components/P.svelte';
	import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptKey } from '$lib/defaultPrompts';
	import { settingsStore } from '$lib/localStorage';
	import { searchConfig } from '$lib/search';

	import SettingsSection from './SettingsSection.svelte';

	// Show the section unless we're a server user with nothing configured yet.
	const showSearch = $derived($searchConfig.editable || $searchConfig.available);
	const canOverride = $derived(
		$searchConfig.editable && $searchConfig.source === 'user' && !!$searchConfig.adminUrl
	);

	function restoreServerDefault() {
		$settingsStore.searchUrl = '';
	}

	// System-instruction editor: one prompt shown at a time. The textarea reflects the
	// override if set, else the built-in default; editing stores an override (cleared
	// again if it's blanked or matches the default).
	let selectedPrompt = $state<PromptKey>('currentDate');
	const selectedOverride = $derived($settingsStore.promptOverrides?.[selectedPrompt]);
	const selectedText = $derived(selectedOverride ?? DEFAULT_PROMPTS[selectedPrompt].default);

	function setOverride(key: PromptKey, value: string) {
		const next = { ...$settingsStore.promptOverrides };
		if (!value.trim() || value === DEFAULT_PROMPTS[key].default) delete next[key];
		else next[key] = value;
		$settingsStore.promptOverrides = next;
	}

	function resetOverride(key: PromptKey) {
		const next = { ...$settingsStore.promptOverrides };
		delete next[key];
		$settingsStore.promptOverrides = next;
	}
</script>

<div class="flex flex-col gap-5">
	<SettingsSection title="Web search">
		{#snippet badge()}
			{#if $searchConfig.source === 'env'}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">env</span>
			{:else if $searchConfig.source === 'admin' && !$searchConfig.editable}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">shared by admin</span>
			{/if}
		{/snippet}

		{#if showSearch}
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-muted">Backend URL (degoog / SearXNG)</span>
				<input
					class="settings-field disabled:opacity-60"
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchUrl : $searchConfig.url}
					placeholder={$searchConfig.adminUrl || 'http://localhost:4444'}
					oninput={(e) => ($settingsStore.searchUrl = e.currentTarget.value)}
				/>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-muted">Backend</span>
				<select
					class="settings-field disabled:opacity-60"
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchBackend : $searchConfig.backend}
					onchange={(e) =>
						($settingsStore.searchBackend = e.currentTarget.value as 'degoog' | 'searxng')}
				>
					<option value="degoog">degoog</option>
					<option value="searxng">SearXNG</option>
				</select>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-muted">API token (optional, for protected instances)</span>
				<input
					class="settings-field disabled:opacity-60"
					type="password"
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchToken : ''}
					placeholder={!$searchConfig.editable && $searchConfig.hasToken ? '•••••••• (set)' : ''}
					oninput={(e) => ($settingsStore.searchToken = e.currentTarget.value)}
				/>
			</label>

			{#if canOverride}
				<button
					type="button"
					onclick={restoreServerDefault}
					class="w-fit text-xs text-link hover:underline"
				>
					Restore server default
				</button>
			{/if}

			<div class="mt-1 flex flex-col gap-2">
				<FieldCheckbox
					label="Enable web search by default"
					bind:checked={$settingsStore.webSearchByDefault}
				/>
				<FieldCheckbox
					label="Let the model decide when to search the web automatically"
					bind:checked={$settingsStore.webSearchAuto}
				/>
				<FieldHelp>
					<P>
						The model first decides whether a question needs the web. Most modern models (even
						Ollama) handle this well, but a few small ones may not.
					</P>
				</FieldHelp>
			</div>
		{:else}
			<FieldHelp>
				<P>Web search isn't available yet. An admin can configure it for this instance.</P>
			</FieldHelp>
		{/if}
	</SettingsSection>

	<SettingsSection
		title="Interactive choices"
		description="When a request is ambiguous and depends on a preference, the model can present a few tappable options instead of guessing. Your selection is sent as a normal message."
	>
		<FieldCheckbox
			label="Let the model offer quick-choice buttons"
			bind:checked={$settingsStore.interactiveChoices}
		/>
	</SettingsSection>

	<SettingsSection
		title="Current date"
		description="A model has no clock and otherwise assumes its training-cutoff date — rejecting newer facts as impossible. This prepends the current date/time (your local timezone) to each request so it stays anchored in the present."
	>
		<FieldCheckbox
			label="Tell the model today's date and time"
			bind:checked={$settingsStore.sendCurrentDate}
		/>
	</SettingsSection>

	<SettingsSection
		title="System instructions"
		description="The behind-the-scenes prompts Hollama injects for the features above. Pick one to view or tweak it — leave it on the default unless you know what you're changing."
	>
		<select class="settings-field" bind:value={selectedPrompt} aria-label="Instruction to edit">
			{#each PROMPT_KEYS as key (key)}
				<option value={key}>{DEFAULT_PROMPTS[key].label}</option>
			{/each}
		</select>

		<p class="text-xs text-muted">{DEFAULT_PROMPTS[selectedPrompt].hint}</p>

		<textarea
			class="settings-field min-h-36 resize-y font-mono text-xs leading-relaxed"
			value={selectedText}
			oninput={(e) => setOverride(selectedPrompt, e.currentTarget.value)}
		></textarea>

		<div class="flex items-center justify-between gap-2">
			<span class="text-xs text-muted">
				{#if DEFAULT_PROMPTS[selectedPrompt].placeholders}
					Placeholders: {DEFAULT_PROMPTS[selectedPrompt].placeholders?.join(', ')}
				{/if}
			</span>
			{#if selectedOverride !== undefined}
				<button
					type="button"
					class="shrink-0 text-xs text-link hover:underline"
					onclick={() => resetOverride(selectedPrompt)}
				>
					Reset to default
				</button>
			{/if}
		</div>
	</SettingsSection>
</div>

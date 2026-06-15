<script lang="ts">
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { searchConfig } from '$lib/search';

	const input =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60';

	// Show the section unless we're a server user with nothing configured yet.
	const showSearch = $derived($searchConfig.editable || $searchConfig.available);
	const canOverride = $derived(
		$searchConfig.editable && $searchConfig.source === 'user' && !!$searchConfig.adminUrl
	);

	function restoreServerDefault() {
		$settingsStore.searchUrl = '';
	}
</script>

<Fieldset>
	<P><strong>Tools</strong></P>

	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<P><strong>Web search</strong></P>
			{#if $searchConfig.source === 'env'}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">env</span>
			{:else if $searchConfig.source === 'admin' && !$searchConfig.editable}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">shared by admin</span>
			{/if}
		</div>

		{#if showSearch}
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-muted">Backend URL (degoog / SearXNG)</span>
				<input
					class={input}
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchUrl : $searchConfig.url}
					placeholder={$searchConfig.adminUrl || 'http://localhost:4444'}
					oninput={(e) => ($settingsStore.searchUrl = e.currentTarget.value)}
				/>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-muted">Backend</span>
				<select
					class={input}
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
					class={input}
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
	</div>

	<div class="flex flex-col gap-2 border-t border-shade-3 pt-4">
		<P><strong>Interactive choices</strong></P>
		<FieldCheckbox
			label="Let the model offer quick-choice buttons"
			bind:checked={$settingsStore.interactiveChoices}
		/>
		<FieldHelp>
			<P>
				When a request is ambiguous and depends on a preference, the model can present a few
				tappable options instead of guessing. Your selection is sent as a normal message.
			</P>
		</FieldHelp>
	</div>

	<div class="flex flex-col gap-2 border-t border-shade-3 pt-4">
		<P><strong>Current date</strong></P>
		<FieldCheckbox
			label="Tell the model today's date and time"
			bind:checked={$settingsStore.sendCurrentDate}
		/>
		<FieldHelp>
			<P>
				A model has no clock and otherwise assumes its training-cutoff date — rejecting newer facts
				as impossible. This prepends the current date/time (your local timezone) to each request so
				it stays anchored in the present.
			</P>
		</FieldHelp>
	</div>
</Fieldset>

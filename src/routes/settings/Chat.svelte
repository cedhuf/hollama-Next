<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import FieldSelectModel from '$lib/components/FieldSelectModel.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { searchConfig } from '$lib/search';

	const defaultModelValue = $derived($settingsStore.defaultModel ?? undefined);
	const titleModelValue = $derived($settingsStore.titleModel ?? undefined);

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
	<P><strong>Chat</strong></P>

	<FieldSelectModel
		isLabelVisible={true}
		label={$LL.defaultModel()}
		value={defaultModelValue}
		onChange={(o) => ($settingsStore.defaultModel = o.value || null)}
	/>

	<FieldCheckbox
		label={$LL.generateTitlesWithAI()}
		bind:checked={$settingsStore.generateTitlesWithAI}
	/>
	<FieldHelp>
		<P>{$LL.generateTitlesWithAIHelp()}</P>
	</FieldHelp>

	{#if $settingsStore.generateTitlesWithAI}
		<FieldSelectModel
			isLabelVisible={true}
			label={$LL.titleModel()}
			value={titleModelValue}
			onChange={(o) => ($settingsStore.titleModel = o.value || null)}
		/>
	{/if}

	{#if showSearch}
		<div class="mt-2 flex flex-col gap-2 border-t border-shade-2 pt-3">
			<div class="flex items-center gap-2">
				<P><strong>Web search</strong></P>
				{#if $searchConfig.source === 'env'}
					<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">env</span>
				{:else if $searchConfig.source === 'admin' && !$searchConfig.editable}
					<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted"
						>shared by admin</span
					>
				{/if}
			</div>

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

			<label class="mt-1 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={$settingsStore.webSearchByDefault} />
				Enable web search by default
			</label>
		</div>
	{/if}
</Fieldset>

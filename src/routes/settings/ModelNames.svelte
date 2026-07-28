<script lang="ts">
	import { ArrowLeft, RotateCcw } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { modelLabel, serverBadge, type Server } from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';

	import SettingsPanel from './SettingsPanel.svelte';

	/**
	 * Rename a connection's models for display only — the real id is still what gets
	 * sent to the provider, matched by `modelFilter` and stored on sessions.
	 *
	 * Rendered as a sub-view of the Servers tab rather than a second modal: the
	 * settings panel is already a dialog, and stacking dialogs reads badly.
	 */
	interface Props {
		server: Server;
		onBack: () => void;
		/** Called after each edit so the parent can persist the connection. */
		onChange: () => void;
	}

	let { server, onBack, onChange }: Props = $props();

	const badge = $derived(serverBadge(server));
	// The catalogue is already loaded for the model picker; just take this server's.
	const models = $derived(
		($settingsStore.models ?? [])
			.filter((model) => model.serverId === server.id)
			.map((model) => model.name)
			.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
	);
	const renamedCount = $derived(models.filter((name) => server.modelLabels?.[name]?.trim()).length);

	function setLabel(name: string, value: string) {
		const labels = { ...(server.modelLabels ?? {}) };
		if (value.trim()) labels[name] = value;
		else delete labels[name];
		server.modelLabels = labels;
		onChange();
	}

	function resetAll() {
		server.modelLabels = {};
		onChange();
	}
</script>

<!-- The sub-view owns its shell, so both modes present it identically. -->
<SettingsPanel>
	<!-- Header: back to the connection list, plus which connection we're editing -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			onclick={onBack}
			class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted transition-colors hover:bg-shade-2 hover:text-active"
		>
			<ArrowLeft class="h-4 w-4" />
			{$LL.servers()}
		</button>
		<span
			class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
			style="background-color: {badge.color}"
		></span>
		<span class="truncate text-sm font-medium text-active">
			{server.label || badge.id || server.baseUrl}
		</span>
		{#if renamedCount}
			<button
				type="button"
				onclick={resetAll}
				class="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-active"
			>
				<RotateCcw class="h-3 w-3" />
				{$LL.reset()}
			</button>
		{/if}
	</div>

	<p class="text-xs leading-snug text-muted">{$LL.modelNamesHelp()}</p>

	{#if models.length}
		<div
			class="overflow-scrollbar flex min-h-0 flex-1 flex-col gap-1 rounded-xl border border-shade-3 p-1.5"
		>
			{#each models as name (name)}
				<div class="grid grid-cols-2 items-center gap-2 rounded px-1.5 py-1">
					<span class="truncate font-mono text-xs text-muted" title={name}>{name}</span>
					<input
						class="settings-field py-1 text-sm"
						value={server.modelLabels?.[name] ?? ''}
						placeholder={modelLabel(server, name)}
						oninput={(e) => setLabel(name, e.currentTarget.value)}
						aria-label={name}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<p class="rounded-xl border border-dashed border-shade-4 p-6 text-center text-sm text-muted">
			{$LL.noModelsToRename()}
		</p>
	{/if}
</SettingsPanel>

<script lang="ts">
	import { RotateCcw, Search, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { serverBadge, type Server } from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';
	import { settingsBack } from '$lib/stores/modal';

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

	// Hand the way out to the modal header for as long as this view is mounted.
	// Leaving by any route (back, another tab, closing the dialog) unmounts it,
	// which clears it.
	$effect(() => {
		settingsBack.set({ label: $LL.servers(), onBack });
		return () => settingsBack.set(null);
	});

	let query = $state('');
	let confirmingReset = $state(false);

	const badge = $derived(serverBadge(server));
	// The catalogue is already loaded for the model picker; just take this server's.
	const models = $derived(
		($settingsStore.models ?? [])
			.filter((model) => model.serverId === server.id)
			.map((model) => model.name)
			.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
	);
	const renamedCount = $derived(models.filter((name) => server.modelLabels?.[name]?.trim()).length);

	// Match on the id *and* the custom name: once a model is renamed, its new name
	// is the only one you remember.
	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return models;
		return models.filter(
			(name) =>
				name.toLowerCase().includes(needle) ||
				(server.modelLabels?.[name] ?? '').toLowerCase().includes(needle)
		);
	});

	function setLabel(name: string, value: string) {
		const labels = { ...(server.modelLabels ?? {}) };
		if (value.trim()) labels[name] = value;
		else delete labels[name];
		server.modelLabels = labels;
		onChange();
	}

	function resetAll() {
		server.modelLabels = {};
		confirmingReset = false;
		onChange();
	}
</script>

<!-- The sub-view owns its shell, so both modes present it identically. -->
<SettingsPanel>
	<!-- Which connection is being edited. The way back is in the modal's own header,
	     published above, so this row is not a second one. -->
	<div class="flex items-center gap-2">
		<span
			class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
			style="background-color: {badge.color}"
		></span>
		<span class="truncate text-sm font-medium text-active">
			{server.label || badge.id || server.baseUrl}
		</span>
		{#if models.length}
			<span class="ml-auto shrink-0 text-xs tabular-nums text-muted">
				{renamedCount} / {models.length}
			</span>
		{/if}
	</div>

	{#if models.length}
		<!-- Search first: past a couple of dozen models, scrolling isn't a way to
		     reach one. -->
		<div class="flex items-center gap-2">
			<div class="relative flex-1">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
				/>
				<input
					class="settings-field pl-8"
					type="search"
					bind:value={query}
					placeholder={$LL.searchModels()}
					aria-label={$LL.searchModels()}
				/>
			</div>

			{#if renamedCount}
				{#if confirmingReset}
					<button
						type="button"
						onclick={resetAll}
						class="shrink-0 rounded-md bg-negative px-2.5 py-1.5 text-xs font-medium text-shade-0"
					>
						{$LL.reset()}
					</button>
					<button
						type="button"
						onclick={() => (confirmingReset = false)}
						class="shrink-0 text-xs text-muted transition-colors hover:text-active"
					>
						{$LL.cancel()}
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-active"
					>
						<RotateCcw class="h-3 w-3" />
						{$LL.resetAllNames()}
					</button>
				{/if}
			{/if}
		</div>

		{#if confirmingReset}
			<p class="-mt-2 text-xs text-negative">{$LL.confirmResetNames()}</p>
		{/if}

		{#if visible.length}
			<!-- One row per model, one column at every width: the editable name on top,
			     the real id underneath. Side by side, both halves were too narrow to
			     read on a phone — and the id was printed twice, once as the
			     placeholder of its own field. -->
			<div class="flex flex-col gap-1.5">
				{#each visible as name (name)}
					{@const label = server.modelLabels?.[name] ?? ''}
					<div
						class="flex flex-col gap-1 rounded-lg border p-2 transition-colors {label.trim()
							? 'border-accent/40 bg-shade-0'
							: 'border-shade-3'}"
					>
						<div class="flex items-center gap-1.5">
							<input
								class="settings-field py-1 text-sm"
								value={label}
								placeholder={name}
								oninput={(e) => setLabel(name, e.currentTarget.value)}
								aria-label={name}
							/>
							{#if label.trim()}
								<button
									type="button"
									onclick={() => setLabel(name, '')}
									aria-label={$LL.clear()}
									title={$LL.clear()}
									class="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:text-active"
								>
									<X class="h-4 w-4" />
								</button>
							{/if}
						</div>
						<span class="truncate px-1 font-mono text-[11px] text-muted" title={name}>{name}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="rounded-xl border border-dashed border-shade-4 p-6 text-center text-sm text-muted">
				{$LL.searchEmpty()}
			</p>
		{/if}
	{:else}
		<p class="rounded-xl border border-dashed border-shade-4 p-6 text-center text-sm text-muted">
			{$LL.noModelsToRename()}
		</p>
	{/if}
</SettingsPanel>

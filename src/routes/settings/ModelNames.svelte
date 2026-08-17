<script lang="ts">
	import { ArrowDownLeft, ArrowUpRight, Coins, RotateCcw, Search, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Collapsible from '$lib/components/Collapsible.svelte';
	import { modelPrice, serverBadge, type Server } from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';
	import { settingsBack } from '$lib/stores/modal';

	import SettingsPanel from './SettingsPanel.svelte';

	/**
	 * What this connection knows about each of its models: what to call it, and
	 * what it costs.
	 *
	 * The name is display only — the real id is still what gets sent to the
	 * provider, matched by `modelFilter` and stored on sessions. The price is two
	 * numbers per million tokens, which is how every provider publishes them.
	 *
	 * Both live on one row because they answer the same question about the same
	 * model, and splitting them would mean finding the same model twice in a list
	 * of two hundred. Rendered as a sub-view of the Servers tab rather than a
	 * second modal: the settings panel is already a dialog.
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
	/** Folded until asked for, and what it reveals is the fields on every row. */
	let pricingOpen = $state(false);

	const badge = $derived(serverBadge(server));
	// The catalogue is already loaded for the model picker; just take this server's.
	const models = $derived(
		($settingsStore.models ?? [])
			.filter((model) => model.serverId === server.id)
			.map((model) => model.name)
			.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
	);
	const renamedCount = $derived(models.filter((name) => server.modelLabels?.[name]?.trim()).length);
	const pricedCount = $derived(models.filter((name) => !!modelPrice(server, name)).length);

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

	/**
	 * Write one half of a price, or clear it.
	 *
	 * An empty field means unpriced, not zero: a model nobody has given a figure
	 * for must not be counted as free, so the key is removed rather than set to 0.
	 * A model priced at genuinely nothing is written as 0 and stays counted.
	 */
	function setPrice(name: string, side: 'input' | 'output', raw: string) {
		const pricing = { ...(server.modelPricing ?? {}) };
		const value = raw.trim() === '' ? undefined : Number(raw);
		if (value !== undefined && !Number.isFinite(value)) return;

		const next = { ...(pricing[name] ?? {}), [side]: value };
		if (next.input == null && next.output == null) delete pricing[name];
		else pricing[name] = next;

		server.modelPricing = pricing;
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
				{$LL.modelsSummary({ renamed: renamedCount, priced: pricedCount, total: models.length })}
			</span>
		{/if}
	</div>

	{#if models.length}
		<!-- What a million tokens costs, folded: most connections never get a price,
		     and the row says how many have one so opening it is a decision. The unit
		     is stated once here rather than beside two hundred pairs of fields. -->
		<Collapsible
			title={$LL.pricing()}
			description={$LL.pricingHelp()}
			summary={$LL.pricedOf({ priced: pricedCount, total: models.length })}
			icon={Coins}
			bind:open={pricingOpen}
		>
			<label class="flex items-center gap-2 text-sm">
				<span class="shrink-0 text-muted">{$LL.currency()}</span>
				<input
					class="settings-field w-24 uppercase"
					value={server.currency ?? ''}
					maxlength="6"
					placeholder="EUR"
					aria-label={$LL.currency()}
					oninput={(e) => {
						server.currency = e.currentTarget.value.trim() || undefined;
						onChange();
					}}
				/>
				<span class="min-w-0 flex-1 text-xs text-muted">{$LL.currencyHelp()}</span>
			</label>
		</Collapsible>

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

						{#if pricingOpen}
							<!-- Only while the pricing block is open, so a list somebody came
							     to rename is a list of names. The arrows say which way the
							     tokens go, the words say it in full on hover and to a screen
							     reader, and the unit is stated once above. -->
							<div class="flex items-center gap-2 pt-1">
								{#each [{ side: 'input' as const, icon: ArrowUpRight, label: $LL.pricePerMillionIn() }, { side: 'output' as const, icon: ArrowDownLeft, label: $LL.pricePerMillionOut() }] as field (field.side)}
									{@const Icon = field.icon}
									<div
										class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-shade-3 bg-shade-1 py-1 pl-2 pr-1 focus-within:border-accent"
										title="{field.label} · {$LL.perMillionTokens()}"
									>
										<Icon class="h-3.5 w-3.5 shrink-0 text-muted" />
										<span class="shrink-0 text-[10px] uppercase tracking-wide text-muted">
											{field.label}
										</span>
										<input
											class="w-full min-w-0 bg-transparent text-right text-xs tabular-nums text-active outline-none placeholder:text-muted"
											type="number"
											min="0"
											step="0.01"
											inputmode="decimal"
											value={server.modelPricing?.[name]?.[field.side] ?? ''}
											placeholder={$LL.priceUnset()}
											aria-label="{name} · {field.label} · {$LL.perMillionTokens()}"
											oninput={(e) => setPrice(name, field.side, e.currentTarget.value)}
										/>
										{#if server.currency}
											<span class="shrink-0 text-[10px] uppercase text-muted">
												{server.currency}
											</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
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

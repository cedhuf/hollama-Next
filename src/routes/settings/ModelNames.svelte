<script lang="ts">
	import {
		ArrowDownRight,
		ArrowUpRight,
		ChevronDown,
		Coins,
		RotateCcw,
		Search,
		X
	} from '@lucide/svelte';
	import { quadInOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
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
		/**
		 * The models this instance offers its users.
		 *
		 * Only these are coloured. An unpriced model matters when somebody else can
		 * reach it — a model nobody is offered is nobody's allowance, and marking it
		 * red would be an alarm about nothing.
		 */
		shared?: string[];
		onBack: () => void;
		/** Called after each edit so the parent can persist the connection. */
		onChange: () => void;
	}

	let { server, shared = [], onBack, onChange }: Props = $props();

	const isShared = $derived((name: string) => shared.includes(name));

	// Hand the way out to the modal header for as long as this view is mounted.
	// Leaving by any route (back, another tab, closing the dialog) unmounts it,
	// which clears it.
	$effect(() => {
		settingsBack.set({ label: $LL.servers(), onBack });
		return () => settingsBack.set(null);
	});

	let query = $state('');
	let confirmingReset = $state(false);
	/**
	 * Which model has its prices open, by id.
	 *
	 * One at a time and per model, not a switch over the whole list: pricing is
	 * something you do to the two or three models you actually share, and two
	 * hundred rows of number fields is a list nobody can rename in any more.
	 */
	const priced = new SvelteSet<string>();

	/** Enough to cover what people actually run, and free text is not a menu. */
	const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD'];
	/** What providers publish in, so a price typed without a thought is right. */
	const DEFAULT_CURRENCY = 'USD';

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
		// A comma is the decimal separator most of Europe types, and `type="number"`
		// simply reports an empty value for it: "0,2" silently set nothing at all.
		// The field is text now, and both separators are read.
		const text = raw.trim().replace(',', '.');
		const value = text === '' ? undefined : Number(text);
		// A negative price is not a price. Refused rather than clamped, so a stray
		// minus does not quietly become zero, which is a figure that gets counted.
		if (value !== undefined && (!Number.isFinite(value) || value < 0)) return;

		const next = { ...(pricing[name] ?? {}), [side]: value };
		if (next.input == null && next.output == null) delete pricing[name];
		else pricing[name] = next;

		server.modelPricing = pricing;
		onChange();
	}

	/** Back to unpriced, which is not the same as priced at zero. */
	function clearPrice(name: string) {
		const pricing = { ...(server.modelPricing ?? {}) };
		delete pricing[name];
		server.modelPricing = pricing;
		onChange();
	}

	/**
	 * The currency this model is billed in.
	 *
	 * Written only alongside a price: a currency on a model nobody has priced is a
	 * row in the table saying nothing, and it would make "unpriced" stop meaning
	 * unpriced.
	 */
	function setCurrency(name: string, code: string) {
		const pricing = { ...(server.modelPricing ?? {}) };
		const current = pricing[name];
		if (!current || (current.input == null && current.output == null)) return;
		pricing[name] = { ...current, currency: code };
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
		<!-- The unit, before anything is opened. It was stated on the labels inside
		     each model's price panel, which is a panel nobody has opened yet: from
		     the list, there was nothing anywhere saying what a figure would mean. -->
		<p class="-mt-1 flex items-center gap-1.5 text-xs text-muted">
			<Coins class="h-3.5 w-3.5 shrink-0" />
			{$LL.pricingIntro()}
		</p>
	{/if}

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
					{@const price = server.modelPricing?.[name]}
					{@const hasPrice = price?.input != null || price?.output != null}
					<!-- Green when a shared model has a price, red when it has none: while
					     an allowance is in force an unpriced shared model is refused, so the
					     colour is the state of something that works rather than decoration.
					     A model nobody is offered is left alone. -->
					<div
						class="flex flex-col gap-1 rounded-lg border p-2 transition-colors {isShared(name)
							? hasPrice
								? 'border-positive/50 bg-positive/5'
								: 'border-negative/50 bg-negative/5'
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
						<div class="flex items-center gap-2 px-1">
							<span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={name}>
								{name}
							</span>

							<!-- The way in to the prices, on the row it prices. Says what it
							     holds when closed, so a shared model with nothing set is
							     readable without opening anything. -->
							<button
								type="button"
								onclick={() => (priced.has(name) ? priced.delete(name) : priced.add(name))}
								aria-expanded={priced.has(name)}
								class="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-shade-2 {hasPrice
									? 'text-active'
									: 'text-muted'}"
								title={$LL.pricingHelp()}
							>
								<Coins class="h-3 w-3" />
								{#if hasPrice}
									<span class="tabular-nums">
										{price?.input ?? '—'} / {price?.output ?? '—'}
										{#if price?.currency}<span class="uppercase">{price.currency}</span>{/if}
										<span class="opacity-70">{$LL.perMillionShort()}</span>
									</span>
								{:else}
									{$LL.priceUnset()}
								{/if}
								<ChevronDown
									class="h-3 w-3 transition-transform {priced.has(name) ? 'rotate-180' : ''}"
								/>
							</button>
						</div>

						{#if priced.has(name)}
							<div
								class="mt-1 flex flex-col gap-2 rounded-md border border-shade-3 bg-shade-1 p-2"
								transition:slide={{ duration: 160, easing: quadInOut }}
							>
								<!-- Everything about this price on one row: what it costs going
								     out, coming back, in what, and the way back to nothing. Spread
								     across the width rather than bunched at the left — each field
								     hugs its own value, so left to themselves they pile up in a
								     corner of a panel that is mostly empty. -->
								<div class="flex flex-wrap items-center gap-2">
									{#each [{ side: 'input' as const, icon: ArrowUpRight, label: $LL.pricePerMillionIn() }, { side: 'output' as const, icon: ArrowDownRight, label: $LL.pricePerMillionOut() }] as field (field.side)}
										{@const Icon = field.icon}
										<!-- The arrow is the whole label: up for what you send, down for
										     what comes back, both leaning the same way so the pair reads as
										     one movement rather than two opposed ones. The words are on the
										     tooltip and the accessible name, where they cost no width. -->
										<label
											class="flex min-w-0 flex-1 items-center gap-1.5"
											title="{field.label} · {$LL.perMillionTokens()}"
										>
											<Icon class="h-4 w-4 shrink-0 text-muted" />

											<!-- The unit sits immediately after the figure, inside the box,
											     so the field reads as one thing: 0,2 /M Tokens. The figure is
											     right-aligned in a box that takes its share of the row, which
											     keeps the two together while the pair fills the line. -->
											<span
												class="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border border-shade-3 bg-shade-0 px-2 focus-within:border-accent"
											>
												<input
													class="w-full min-w-0 bg-transparent text-right text-xs tabular-nums text-active outline-none placeholder:text-muted"
													type="text"
													inputmode="decimal"
													value={server.modelPricing?.[name]?.[field.side] ?? ''}
													placeholder={$LL.priceUnset()}
													aria-label="{name} · {field.label} · {$LL.perMillionTokens()}"
													oninput={(e) => setPrice(name, field.side, e.currentTarget.value)}
												/>
												<span class="shrink-0 whitespace-nowrap text-[10px] text-muted">
													{$LL.perMillionShort()}
												</span>
											</span>
										</label>
									{/each}

									<!-- No empty option: a price without a currency is a number nobody
									     can add up, and USD is what providers publish in. Same box as
									     the fields beside it, so the row sits on one line. -->
									<select
										class="h-8 w-auto shrink-0 rounded-md border border-shade-3 bg-shade-0 px-2 text-xs uppercase text-active outline-none focus:border-accent"
										value={server.modelPricing?.[name]?.currency ?? DEFAULT_CURRENCY}
										aria-label="{name} · {$LL.currency()}"
										onchange={(e) => setCurrency(name, e.currentTarget.value)}
									>
										{#each CURRENCIES as code (code)}
											<option value={code}>{code}</option>
										{/each}
									</select>

									<!-- Zero is a price: free, and counted as such. Clearing is the
									     other answer — nobody has said — and a field cannot be walked
									     back to it. -->
									<button
										type="button"
										onclick={() => clearPrice(name)}
										title={$LL.clearPrice()}
										aria-label="{name} · {$LL.clearPrice()}"
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-shade-3 text-muted transition-colors hover:border-shade-4 hover:text-active"
									>
										<RotateCcw class="h-3.5 w-3.5" />
									</button>
								</div>
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

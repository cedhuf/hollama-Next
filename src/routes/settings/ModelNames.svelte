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
	import {
		guessModelKind,
		hasPriceFigure,
		MODEL_KINDS,
		modelKind,
		modelPrice,
		PRICE_UNITS,
		priceUnit,
		serverBadge,
		type ModelKind,
		type ModelPrice,
		type PriceUnit,
		type Server
	} from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';
	import { settingsBack } from '$lib/stores/modal';

	import SettingsPanel from './SettingsPanel.svelte';

	/**
	 * What this connection knows about each of its models: what to call it, what
	 * it is for, and what it costs.
	 *
	 * The name is display only: the real id is still what gets sent to the
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
		 * reach it: a model nobody is offered is nobody's allowance, and marking it
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

	/** The heading each kind gets, in the order the sections are drawn. */
	const KIND_LABELS = $derived<Record<ModelKind, string>>({
		text: $LL.modelKindText(),
		image: $LL.modelKindImage(),
		embedding: $LL.modelKindEmbedding(),
		audio: $LL.modelKindAudio()
	});

	/** What each unit is called, and what it reads as beside a figure. */
	const UNIT_LABELS = $derived<Record<PriceUnit, string>>({
		token: $LL.priceUnitToken(),
		image: $LL.priceUnitImage(),
		second: $LL.priceUnitSecond(),
		minute: $LL.priceUnitMinute()
	});
	const UNIT_SUFFIX = $derived<Record<PriceUnit, string>>({
		token: $LL.perMillionShort(),
		image: $LL.perImageShort(),
		second: $LL.perSecondShort(),
		minute: $LL.perMinuteShort()
	});

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

	/**
	 * The list, cut into what each part of it is for.
	 *
	 * Chat first because that is what most connections are mostly made of, then
	 * images, then the embeddings, which are here to be seen and left alone, and
	 * which no picker in the app offers any more. Empty sections are not drawn: a
	 * heading over nothing says a connection is missing something it never had.
	 */
	const sections = $derived(
		MODEL_KINDS.map((kind) => ({
			kind,
			label: KIND_LABELS[kind],
			models: visible.filter((name) => modelKind(server, name) === kind)
		})).filter((section) => section.models.length > 0)
	);

	/**
	 * Say what a model is, when its name did not say it.
	 *
	 * Only the disagreements are stored. A choice that matches the guess clears its
	 * entry instead of writing one, so the map stays a list of corrections and
	 * keeps benefiting from a better guess later.
	 */
	function setKind(name: string, kind: ModelKind) {
		const kinds = { ...(server.modelKinds ?? {}) };
		if (guessModelKind(name) === kind) delete kinds[name];
		else kinds[name] = kind;
		server.modelKinds = kinds;
		onChange();
	}

	function setLabel(name: string, value: string) {
		const labels = { ...(server.modelLabels ?? {}) };
		if (value.trim()) labels[name] = value;
		else delete labels[name];
		server.modelLabels = labels;
		onChange();
	}

	/**
	 * A figure out of a field, or nothing.
	 *
	 * A comma is the decimal separator most of Europe types, and `type="number"`
	 * simply reports an empty value for it: "0,2" silently set nothing at all. The
	 * fields are text, and both separators are read. A negative price is refused
	 * rather than clamped, so a stray minus does not quietly become zero, which is
	 * a figure that gets counted.
	 */
	function figure(raw: string): { ok: boolean; value: number | undefined } {
		const text = raw.trim().replace(',', '.');
		if (text === '') return { ok: true, value: undefined };
		const value = Number(text);
		if (!Number.isFinite(value) || value < 0) return { ok: false, value: undefined };
		return { ok: true, value };
	}

	/**
	 * Store a price, or drop the row once it holds nothing worth keeping.
	 *
	 * A figure is worth keeping, and so is a unit on its own: saying "this one is
	 * billed per minute" is an answer, given before the rate is typed and often
	 * before it is known. Dropping it there was a bug you could watch happen: the
	 * unit snapped back to tokens the instant it was chosen, because the row it
	 * lived in had just been deleted for being empty.
	 *
	 * Unpriced is still unpriced. `hasPriceFigure` is what the meter and the credit
	 * limit ask, and a row with a unit and no figure answers no to it.
	 */
	function writePrice(name: string, price: ModelPrice) {
		const pricing = { ...(server.modelPricing ?? {}) };
		if (hasPriceFigure(price) || (price.unit && price.unit !== 'token')) pricing[name] = price;
		else delete pricing[name];
		server.modelPricing = pricing;
		onChange();
	}

	/**
	 * Write one half of a token price, or clear it.
	 *
	 * An empty field means unpriced, not zero: a model nobody has given a figure
	 * for must not be counted as free, so the key is removed rather than set to 0.
	 * A model priced at genuinely nothing is written as 0 and stays counted.
	 */
	function setPrice(name: string, side: 'input' | 'output', raw: string) {
		const parsed = figure(raw);
		if (!parsed.ok) return;
		writePrice(name, { ...(server.modelPricing?.[name] ?? {}), [side]: parsed.value });
	}

	/** The single figure every unit that is not tokens uses. */
	function setRate(name: string, raw: string) {
		const parsed = figure(raw);
		if (!parsed.ok) return;
		writePrice(name, { ...(server.modelPricing?.[name] ?? {}), rate: parsed.value });
	}

	/**
	 * Change what a model is billed by.
	 *
	 * The figures that belonged to the old unit are cleared, and that is a choice:
	 * a price per million tokens is not a price per image, and leaving it behind
	 * means a field that is invisible, ignored by the meter, and that would come
	 * back the moment somebody switched the unit again. Losing it here, in front of
	 * whoever made the change, beats losing it quietly on the next reload.
	 */
	function setUnit(name: string, unit: PriceUnit) {
		const current = server.modelPricing?.[name] ?? {};
		if (priceUnit(current) === unit) return;
		writePrice(name, { unit: unit === 'token' ? undefined : unit, currency: current.currency });
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
		if (!current) return;
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
		<span class="text-active truncate text-sm font-medium">
			{server.label || badge.id || server.baseUrl}
		</span>
		{#if models.length}
			<span class="text-muted ml-auto shrink-0 text-xs tabular-nums">
				{$LL.modelsSummary({ renamed: renamedCount, priced: pricedCount, total: models.length })}
			</span>
		{/if}
	</div>

	{#if models.length}
		<!-- The unit, before anything is opened. It was stated on the labels inside
		     each model's price panel, which is a panel nobody has opened yet: from
		     the list, there was nothing anywhere saying what a figure would mean. -->
		<p class="text-muted -mt-1 flex items-center gap-1.5 text-xs">
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
					class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
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
						class="bg-negative text-shade-0 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium"
					>
						{$LL.reset()}
					</button>
					<button
						type="button"
						onclick={() => (confirmingReset = false)}
						class="text-muted hover:text-active shrink-0 text-xs transition-colors"
					>
						{$LL.cancel()}
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="text-muted hover:text-active flex shrink-0 items-center gap-1 text-xs transition-colors"
					>
						<RotateCcw class="h-3 w-3" />
						{$LL.resetAllNames()}
					</button>
				{/if}
			{/if}
		</div>

		{#if confirmingReset}
			<p class="text-negative -mt-2 text-xs">{$LL.confirmResetNames()}</p>
		{/if}

		{#if visible.length}
			<!-- One section per kind rather than one list, because a connection is not
			     one list: the models you hold a conversation with, the ones that draw
			     and the ones that return a vector are three different tools. Telling
			     them apart here is what lets every picker in the app stop offering the
			     wrong one, which is not a tidiness problem: an embedding model chosen
			     for a conversation is a 400 with no explanation attached. -->
			{#each sections as section (section.kind)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-baseline gap-2">
						<h3 class="text-muted text-xs font-medium tracking-wide uppercase">
							{section.label}
						</h3>
						<span class="text-muted text-xs tabular-nums">{section.models.length}</span>
					</div>

					<!-- One row per model, one column at every width: the editable name on
					     top, the real id underneath. Side by side, both halves were too
					     narrow to read on a phone, and the id was printed twice, once as
					     the placeholder of its own field. -->
					{#each section.models as name (name)}
						{@const label = server.modelLabels?.[name] ?? ''}
						{@const price = server.modelPricing?.[name]}
						{@const hasPrice = hasPriceFigure(price)}
						{@const unit = priceUnit(price)}
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
										class="text-muted hover:text-active shrink-0 rounded-md p-1.5 transition-colors"
									>
										<X class="h-4 w-4" />
									</button>
								{/if}
							</div>
							<div class="flex items-center gap-2 px-1">
								<span class="text-muted min-w-0 flex-1 truncate font-mono text-[11px]" title={name}>
									{name}
								</span>

								<!-- What this model is, on the row that describes it. Three answers
								     and no free text: this decides which picker offers it, so a value
								     nobody recognises would be a model that quietly exists nowhere.
								     Prefilled from the name, which is the only thing any provider gives
								     us to go on, and left correctable because that guess is wrong often
								     enough to matter. -->
								<select
									class="border-shade-3 bg-shade-0 text-muted hover:text-active focus:border-accent h-6 shrink-0 rounded-md border px-1 text-[11px] transition-colors outline-none"
									value={modelKind(server, name)}
									aria-label="{name} · {$LL.modelKindLabel()}"
									title={$LL.modelKindLabel()}
									onchange={(e) => setKind(name, e.currentTarget.value as ModelKind)}
								>
									{#each MODEL_KINDS as kind (kind)}
										<option value={kind}>{KIND_LABELS[kind]}</option>
									{/each}
								</select>

								<!-- The way in to the prices, on the row it prices. Says what it
								     holds when closed, so a shared model with nothing set is
								     readable without opening anything. -->
								<button
									type="button"
									onclick={() => (priced.has(name) ? priced.delete(name) : priced.add(name))}
									aria-expanded={priced.has(name)}
									class="hover:bg-shade-2 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors {hasPrice
										? 'text-active'
										: 'text-muted'}"
									title={$LL.pricingHelp()}
								>
									<Coins class="h-3 w-3" />
									{#if hasPrice}
										<span class="tabular-nums">
											{#if unit === 'token'}
												{price?.input ?? '-'} / {price?.output ?? '-'}
											{:else}
												{price?.rate}
											{/if}
											{#if price?.currency}<span class="uppercase">{price.currency}</span>{/if}
											<span class="opacity-70">{UNIT_SUFFIX[unit]}</span>
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
									class="border-shade-3 bg-shade-1 mt-1 flex flex-col gap-2 rounded-md border p-2"
									transition:slide={{ duration: 160, easing: quadInOut }}
								>
									<!-- Everything about this price on one row: what it is billed by,
									     what it costs, in what, and the way back to nothing. Spread
									     across the width rather than bunched at the left, each field
									     hugs its own value, so left to themselves they pile up in a
									     corner of a panel that is mostly empty. -->
									<div class="flex flex-wrap items-center gap-2">
										<!-- First, because it decides what the rest of the row is. A model
										     billed per minute has no way in and no way out, only a length
										     of time, and showing two token fields for it would be asking
										     two questions the invoice does not answer. -->
										<select
											class="border-shade-3 bg-shade-0 text-active focus:border-accent h-8 w-auto shrink-0 rounded-md border px-2 text-xs outline-none"
											value={unit}
											aria-label="{name} · {$LL.priceUnitLabel()}"
											onchange={(e) => setUnit(name, e.currentTarget.value as PriceUnit)}
										>
											{#each PRICE_UNITS as code (code)}
												<option value={code}>{UNIT_LABELS[code]}</option>
											{/each}
										</select>

										{#if unit === 'token'}
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
													<Icon class="text-muted h-4 w-4 shrink-0" />

													<!-- The unit sits immediately after the figure, inside the box,
													     so the field reads as one thing: 0,2 /M Tokens. The figure is
													     right-aligned in a box that takes its share of the row, which
													     keeps the two together while the pair fills the line. -->
													<span
														class="border-shade-3 bg-shade-0 focus-within:border-accent flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border px-2"
													>
														<input
															class="text-active placeholder:text-muted w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none"
															type="text"
															inputmode="decimal"
															value={price?.[field.side] ?? ''}
															placeholder={$LL.priceUnset()}
															aria-label="{name} · {field.label} · {$LL.perMillionTokens()}"
															oninput={(e) => setPrice(name, field.side, e.currentTarget.value)}
														/>
														<span class="text-muted shrink-0 text-[10px] whitespace-nowrap">
															{$LL.perMillionShort()}
														</span>
													</span>
												</label>
											{/each}
										{:else}
											<!-- One figure, because nothing billed per image or per second
											     charges the way in differently from the way out. -->
											<label
												class="flex min-w-0 flex-1 items-center gap-1.5"
												title={UNIT_LABELS[unit]}
											>
												<Coins class="text-muted h-4 w-4 shrink-0" />
												<span
													class="border-shade-3 bg-shade-0 focus-within:border-accent flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border px-2"
												>
													<input
														class="text-active placeholder:text-muted w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none"
														type="text"
														inputmode="decimal"
														value={price?.rate ?? ''}
														placeholder={$LL.priceUnset()}
														aria-label="{name} · {UNIT_LABELS[unit]}"
														oninput={(e) => setRate(name, e.currentTarget.value)}
													/>
													<span class="text-muted shrink-0 text-[10px] whitespace-nowrap">
														{UNIT_SUFFIX[unit]}
													</span>
												</span>
											</label>
										{/if}

										<!-- No empty option: a price without a currency is a number nobody
										     can add up, and USD is what providers publish in. Same box as
										     the fields beside it, so the row sits on one line. -->
										<select
											class="border-shade-3 bg-shade-0 text-active focus:border-accent h-8 w-auto shrink-0 rounded-md border px-2 text-xs uppercase outline-none"
											value={price?.currency ?? DEFAULT_CURRENCY}
											aria-label="{name} · {$LL.currency()}"
											onchange={(e) => setCurrency(name, e.currentTarget.value)}
										>
											{#each CURRENCIES as code (code)}
												<option value={code}>{code}</option>
											{/each}
										</select>

										<!-- Zero is a price: free, and counted as such. Clearing is the
										     other answer (nobody has said) and a field cannot be walked
										     back to it. -->
										<button
											type="button"
											onclick={() => clearPrice(name)}
											title={$LL.clearPrice()}
											aria-label="{name} · {$LL.clearPrice()}"
											class="border-shade-3 text-muted hover:border-shade-4 hover:text-active flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors"
										>
											<RotateCcw class="h-3.5 w-3.5" />
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		{:else}
			<p class="border-shade-4 text-muted rounded-xl border border-dashed p-6 text-center text-sm">
				{$LL.searchEmpty()}
			</p>
		{/if}
	{:else}
		<p class="border-shade-4 text-muted rounded-xl border border-dashed p-6 text-center text-sm">
			{$LL.noModelsToRename()}
		</p>
	{/if}
</SettingsPanel>

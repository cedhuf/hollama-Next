<script lang="ts">
	import {
		ArrowDownRight,
		ArrowUpRight,
		ChevronDown,
		Coins,
		RotateCcw,
		Search
	} from '@lucide/svelte';
	import { quadInOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import NumberField from '$lib/components/NumberField.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
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
	/** "Cost in EUR, per million tokens", for the tooltip and the accessible name. */
	function priceLabel(price: ModelPrice | undefined, unit: PriceUnit): string {
		return $LL.priceTooltip({
			currency: price?.currency ?? DEFAULT_CURRENCY,
			unit: UNIT_LABELS[unit].toLocaleLowerCase()
		});
	}

	/** The scale in two or three characters, for the folded row. */
	const UNIT_SUFFIX = $derived<Record<PriceUnit, string>>({
		token: $LL.perMillionShort(),
		image: $LL.perImageShort(),
		second: $LL.perSecondShort(),
		minute: $LL.perMinuteShort()
	});

	const UNIT_LABELS = $derived<Record<PriceUnit, string>>({
		token: $LL.priceUnitToken(),
		image: $LL.priceUnitImage(),
		second: $LL.priceUnitSecond(),
		minute: $LL.priceUnitMinute()
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
		<div class="flex flex-wrap items-center gap-2">
			<div class="relative min-w-40 flex-1">
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

					<!-- One row per model. The name reads as text until you touch it, the
					     id lives on its tooltip rather than on a second line, and the two
					     controls sit at the right. On a phone the name takes the line and
					     they drop underneath, which is what the old two-column row could not
					     do without crushing both halves. -->
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
								<!-- A field that does not look like one until it is wanted: this is a
								     list to read, not a form to fill, and eighty boxed inputs made it
								     the other way round. The id is the placeholder and the tooltip, so
								     it is never printed twice. -->
								<!-- The app's tooltip rather than a `title`: it is the one every
								     other hint in the app uses, it opens on keyboard focus too, and it
								     is not at the mercy of the platform's own delay and styling. -->
								<Tooltip side="top" align="start">
									{#snippet trigger({ props })}
										<span {...props} class="flex min-w-0 flex-1 items-center gap-1">
											<input
												class="text-active placeholder:text-muted hover:border-shade-3 focus:border-shade-3 focus:bg-shade-0 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm outline-none"
												value={label}
												placeholder={name}
												oninput={(e) => setLabel(name, e.currentTarget.value)}
												aria-label={name}
											/>
											{#if label.trim()}
												<!-- The old cross read as "remove this model". This puts the
												     name back to what the provider calls it, which is what it
												     does, and it is the same icon every other reset wears. -->
												<button
													type="button"
													onclick={() => setLabel(name, '')}
													aria-label="{name} · {$LL.resetName()}"
													title={$LL.resetName()}
													class="text-muted hover:text-active hover:bg-shade-2 shrink-0 rounded-md p-1.5 transition-colors"
												>
													<RotateCcw class="h-3.5 w-3.5" />
												</button>
											{/if}
										</span>
									{/snippet}
									<span class="font-mono">{name}</span>
								</Tooltip>

								<!-- The one summary on the row, and the way in to everything else. It
								     says the figures and what they are counted in; what they are counted
								     per is the same for every model here, so it sits on the tooltip and
								     inside the fold rather than on eighty rows. -->
								<!-- The app's tooltip here too, and one plain sentence in it:
								     "Cost in EUR, per million tokens". The row shows the figures and
								     the scale; the tooltip is where the words go. -->
								<Tooltip side="top" align="end">
									{#snippet trigger({ props })}
										<button
											{...props}
											type="button"
											onclick={() => (priced.has(name) ? priced.delete(name) : priced.add(name))}
											aria-expanded={priced.has(name)}
											aria-label="{name} · {priceLabel(price, unit)}"
											class="hover:bg-shade-2 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors {hasPrice
												? 'text-active'
												: 'text-muted'}"
										>
											<Coins class="h-3.5 w-3.5" />
											{#if hasPrice}
												<!-- The same two arrows as inside the fold, up for what you send
												     and down for what comes back, instead of a slash between the
												     figures. One slash on the row is the scale; a second one
												     separating a pair read as a division. -->
												<span class="flex items-center gap-1.5 tabular-nums">
													{#if unit === 'token'}
														<span class="flex items-center gap-0.5">
															<ArrowUpRight class="h-3 w-3 opacity-70" />
															{price?.input ?? '-'}
														</span>
														<span class="flex items-center gap-0.5">
															<ArrowDownRight class="h-3 w-3 opacity-70" />
															{price?.output ?? '-'}
														</span>
													{:else}
														<span>{price?.rate}</span>
													{/if}
													<!-- No currency here. A connection bills in one currency, so
													     printing it on every row says the same word eighty times.
													     It is in the tooltip and in the fold, where it is a thing
													     to check rather than a thing to read past. -->
													<span class="opacity-70">{UNIT_SUFFIX[unit]}</span>
												</span>
											{:else}
												{$LL.priceUnset()}
											{/if}
											<ChevronDown
												class="h-3.5 w-3.5 transition-transform {priced.has(name)
													? 'rotate-180'
													: ''}"
											/>
										</button>
									{/snippet}
									{priceLabel(price, unit)}
								</Tooltip>
							</div>

							{#if priced.has(name)}
								<!-- Everything a model is worth saying, in two lines that are two
								     lines on purpose: what it is and how it is billed, then what it
								     costs. The kind lives here rather than on the row above because
								     it is set once from the name and corrected rarely, and it was
								     taking the width the names needed on a phone. -->
								<div
									class="border-shade-3 bg-shade-1 mt-1 flex flex-col gap-2 rounded-md border p-2"
									transition:slide={{ duration: 160, easing: quadInOut }}
								>
									<div class="flex flex-wrap items-center gap-2">
										<!-- Three answers and no free text: this decides which picker
										     offers the model, so a value nobody recognises would be a model
										     that quietly exists nowhere. Prefilled from the name, which is
										     the only thing any provider gives us to go on, and left
										     correctable because that guess is wrong often enough. -->
										<span class="min-w-0 flex-1 basis-28">
											<Select
												value={modelKind(server, name)}
												options={MODEL_KINDS.map((kind) => ({
													value: kind,
													label: KIND_LABELS[kind]
												}))}
												onChange={(option) => setKind(name, option.value as ModelKind)}
											/>
										</span>

										<!-- Beside the kind because it is the other thing this model *is*,
										     and because it decides what the line below asks. A model billed
										     per minute has no way in and no way out, only a length of time,
										     and two token fields for it would be asking two questions the
										     invoice does not answer. It also says "per million tokens" once,
										     for the whole block: the figures below carry no suffix, where
										     the same words used to be printed twice. -->
										<span class="min-w-0 flex-1 basis-40">
											<Select
												value={unit}
												options={PRICE_UNITS.map((code) => ({
													value: code,
													label: UNIT_LABELS[code]
												}))}
												onChange={(option) => setUnit(name, option.value as PriceUnit)}
											/>
										</span>

										<!-- Zero is a price: free, and counted as such. Clearing is the
										     other answer (nobody has said) and a field cannot be walked
										     back to it. -->
										<button
											type="button"
											onclick={() => clearPrice(name)}
											title={$LL.clearPrice()}
											aria-label="{name} · {$LL.clearPrice()}"
											class="border-shade-3 text-muted hover:border-shade-4 hover:text-active ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors"
										>
											<RotateCcw class="h-3.5 w-3.5" />
										</button>
									</div>

									<!-- One line, always: two figures and their currency fit on a
									     phone, and wrapping the currency underneath left it alone on a
									     row of its own with the width beside it unused. -->
									<div class="flex items-center gap-2">
										{#if unit === 'token'}
											{#each [{ side: 'input' as const, icon: ArrowUpRight, label: $LL.pricePerMillionIn() }, { side: 'output' as const, icon: ArrowDownRight, label: $LL.pricePerMillionOut() }] as field (field.side)}
												{@const Icon = field.icon}
												<!-- The arrow is the whole label: up for what you send, down for
												     what comes back, both leaning the same way so the pair reads
												     as one movement rather than two opposed ones. The words are on
												     the tooltip and the accessible name, where they cost no width. -->
												<label
													class="flex min-w-0 flex-1 items-center gap-1.5"
													title="{field.label} · {UNIT_LABELS[unit]}"
												>
													<Icon class="text-muted h-4 w-4 shrink-0" />
													<span class="min-w-0 flex-1">
														<NumberField
															decimal
															min={0}
															step={0.1}
															class="text-right text-xs tabular-nums"
															value={price?.[field.side] ?? ''}
															placeholder={$LL.priceUnset()}
															label="{name} · {field.label} · {UNIT_LABELS[unit]}"
															onChange={(raw) => setPrice(name, field.side, raw)}
														/>
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
												<span class="min-w-0 flex-1">
													<NumberField
														decimal
														min={0}
														step={0.1}
														class="text-right text-xs tabular-nums"
														value={price?.rate ?? ''}
														placeholder={$LL.priceUnset()}
														label="{name} · {UNIT_LABELS[unit]}"
														onChange={(raw) => setRate(name, raw)}
													/>
												</span>
											</label>
										{/if}

										<!-- No empty option: a price without a currency is a number nobody
										     can add up, and USD is what providers publish in. -->
										<span class="w-20 shrink-0">
											<Select
												value={price?.currency ?? DEFAULT_CURRENCY}
												options={CURRENCIES.map((code) => ({ value: code, label: code }))}
												onChange={(option) => setCurrency(name, option.value)}
											/>
										</span>
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

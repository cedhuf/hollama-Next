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
		reportsCost,
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
	 * What this connection knows about each of its models: what to call it, what it
	 * is for, and what it costs.
	 *
	 * The name is display only; the real id is what gets sent. All three sit on one
	 * row because they answer the same question about the same model, and splitting
	 * them would mean finding it twice in a list of two hundred.
	 */
	interface Props {
		server: Server;
		/** Only these are coloured: a model nobody is offered is nobody's allowance, so marking it red would be an alarm about nothing. */
		shared?: string[];
		onBack: () => void;
		/** Called after each edit so the parent can persist the connection. */
		onChange: () => void;
	}

	let { server, shared = [], onBack, onChange }: Props = $props();

	const isShared = $derived((name: string) => shared.includes(name));

	/**
	 * Models whose fallback price has been asked for on a connection that reports
	 * its own. Like the stored API key one screen away: rather than an empty field
	 * reading as "nobody set this", the state says the provider bills each call, so
	 * a figure is not missing, it is not wanted.
	 *
	 * A model that already carries a figure is open on sight.
	 */
	const overriding = new SvelteSet<string>();

	// Handed to the modal header for as long as this view is mounted; leaving by
	// any route unmounts it, which clears it.
	$effect(() => {
		settingsBack.set({ label: $LL.servers(), onBack });
		return () => settingsBack.set(null);
	});

	let query = $state('');
	let confirmingReset = $state(false);
	/** One at a time: pricing is something you do to the two or three models you share, and two hundred rows of number fields is a list nobody can rename in. */
	const priced = new SvelteSet<string>();

	/** Enough to cover what people actually run, and free text is not a menu. */
	const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD'];
	/** What providers publish in, so a price typed without a thought is right. */
	const DEFAULT_CURRENCY = 'USD';

	const badge = $derived(serverBadge(server));
	/**
	 * Whether this connection says what each call cost, which changes what the
	 * prices below *are*: where the provider reports, a figure typed here is only a
	 * fallback. Per connection, because that is how it is true: a gateway reports on
	 * everything it serves or on nothing.
	 */
	const reported = $derived(reportsCost(server.connectionType));
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
		audio: $LL.modelKindAudio(),
		speech: $LL.modelKindSpeech()
	});

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

	// The id *and* the custom name: once a model is renamed, the new name is the
	// only one you remember.
	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return models;
		return models.filter(
			(name) =>
				name.toLowerCase().includes(needle) ||
				(server.modelLabels?.[name] ?? '').toLowerCase().includes(needle)
		);
	});

	/** Chat first, then images, then the embeddings, which are here to be seen and left alone. Empty sections are not drawn. */
	const sections = $derived(
		MODEL_KINDS.map((kind) => ({
			kind,
			label: KIND_LABELS[kind],
			models: visible.filter((name) => modelKind(server, name) === kind)
		})).filter((section) => section.models.length > 0)
	);

	/** Only the disagreements are stored: a choice matching the guess clears its entry, so the map stays a list of corrections and still benefits from a better guess. */
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
	 * A comma is the decimal separator most of Europe types, and `type="number"`
	 * reports an empty value for it, so "0,2" silently set nothing. The fields are
	 * text. A negative price is refused rather than clamped, so a stray minus does
	 * not quietly become a zero that gets counted.
	 */
	function figure(raw: string): { ok: boolean; value: number | undefined } {
		const text = raw.trim().replace(',', '.');
		if (text === '') return { ok: true, value: undefined };
		const value = Number(text);
		if (!Number.isFinite(value) || value < 0) return { ok: false, value: undefined };
		return { ok: true, value };
	}

	/**
	 * A figure is worth keeping, and so is a unit on its own: "billed per minute" is
	 * an answer, given before the rate is known. Dropping the row there made the
	 * unit snap back to tokens the instant it was chosen.
	 *
	 * Unpriced is still unpriced: a row with a unit and no figure answers no to
	 * `hasPriceFigure`, which is what the meter and the credit limit ask.
	 */
	function writePrice(name: string, price: ModelPrice) {
		const pricing = { ...(server.modelPricing ?? {}) };
		if (hasPriceFigure(price) || (price.unit && price.unit !== 'token')) pricing[name] = price;
		else delete pricing[name];
		server.modelPricing = pricing;
		onChange();
	}

	/** An empty field means unpriced, not zero, so the key is removed rather than set to 0. A model priced at genuinely nothing is written as 0 and stays counted. */
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

	/** The old unit's figures are cleared: a price per million tokens is not a price per image, and leaving it behind means a field that is invisible, ignored, and comes back on the next switch. */
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

	/** Written only alongside a price: a currency on an unpriced model is a row saying nothing, and it would make "unpriced" stop meaning unpriced. */
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
	<!-- Which connection is being edited. The way back is in the modal's own
	     header, so this row is not a second one. -->
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
		<!-- The unit, before anything is opened: it used to be stated only on the labels
		     inside a price panel nobody had opened yet. -->
		<p class="text-muted -mt-1 flex items-center gap-1.5 text-xs">
			<Coins class="h-3.5 w-3.5 shrink-0" />
			{$LL.pricingIntro()}
		</p>
	{/if}

	{#if models.length}
		<!-- Search first: past a couple of dozen models, scrolling is not a way in. -->
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
			<!-- One section per kind: the models you hold a conversation with, the ones that
			     draw and the ones that return a vector are three different tools, and an
			     embedding chosen for a conversation is a 400 with no explanation. -->
			{#each sections as section (section.kind)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-baseline gap-2">
						<h3 class="text-muted text-xs font-medium tracking-wide uppercase">
							{section.label}
						</h3>
						<span class="text-muted text-xs tabular-nums">{section.models.length}</span>
					</div>

					<!-- One row per model: the name reads as text until you touch it, the id is on
					     its tooltip, and the two controls sit at the right. -->
					{#each section.models as name (name)}
						{@const label = server.modelLabels?.[name] ?? ''}
						{@const price = server.modelPricing?.[name]}
						{@const hasPrice = hasPriceFigure(price)}
						{@const unit = priceUnit(price)}
						<!-- Green when a shared model has a price, red when it has none: an unpriced
						     shared model is refused while an allowance is in force, so the colour is a
						     state rather than decoration. Nothing is red on a connection that reports
						     its own costs, where nothing is refused. -->
						<div
							class="flex flex-col gap-1 rounded-lg border p-2 transition-colors {isShared(name)
								? hasPrice || reported
									? 'border-positive/50 bg-positive/5'
									: 'border-negative/50 bg-negative/5'
								: 'border-shade-3'}"
						>
							<div class="flex items-center gap-1.5">
								<!-- A field that does not look like one until it is wanted: this is a list to
								     read, and eighty boxed inputs made it a form to fill. -->
								<!-- The app's tooltip rather than a `title`: it opens on keyboard focus and is
								     not at the mercy of the platform's delay and styling. -->
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
												<!-- The old cross read as "remove this model". This puts the name back to what
												     the provider calls it, and wears the same icon as every other reset. -->
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

								<!-- The one summary on the row, and the way in to everything else. What the
								     figures are counted per is the same for every model here, so it is on the
								     tooltip rather than repeated. -->
								<!-- The row shows the figures and the scale; the tooltip is where the words go. -->
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
												<!-- The same two arrows as inside the fold, up for what you send and down for
												     what comes back, rather than a slash, which on this row is the scale. -->
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
													<!-- No currency here: a connection bills in one, so printing it on every row
													     says the same word eighty times. It is in the tooltip and in the fold. -->
													<span class="opacity-70">{UNIT_SUFFIX[unit]}</span>
												</span>
											{:else if reported}
												<!-- Not "unset", which reads as something left undone. There is nothing to do:
												     the provider bills the call and says what it billed. -->
												{$LL.priceAuto()}
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
								<!-- Whether this model shows a state instead of a form. Only on a reporting
								     connection, only while nothing has been typed, and only until asked. -->
								{@const auto = reported && !hasPrice && !overriding.has(name)}
								<!-- Two lines on purpose: what the model is and how it is billed, then what it
								     costs. -->
								<div
									class="border-shade-3 bg-shade-1 mt-1 flex flex-col gap-2 rounded-md border p-2"
									transition:slide={{ duration: 160, easing: quadInOut }}
								>
									<div class="flex flex-wrap items-center gap-2">
										<!-- Three answers and no free text: this decides which picker offers the model,
										     so an unrecognised value would be a model that exists nowhere. -->
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

										<!-- Beside the kind because it is the other thing this model *is*, and because
										     it decides what the line below asks: a model billed per minute has no way in
										     and no way out. It also says "per million tokens" once for the whole block.

										     Gone in the auto state along with the figures. The kind stays, since that is
										     what decides which picker offers it. -->
										{#if !auto}
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

											<!-- Zero is a price: free, and counted as such. Clearing is the other answer,
											     nobody has said, and a field cannot be walked back to it. -->
											<button
												type="button"
												onclick={() => {
													clearPrice(name);
													overriding.delete(name);
												}}
												title={$LL.clearPrice()}
												aria-label="{name} · {$LL.clearPrice()}"
												class="border-shade-3 text-muted hover:border-shade-4 hover:text-active ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors"
											>
												<RotateCcw class="h-3.5 w-3.5" />
											</button>
										{/if}
									</div>

									{#if auto}
										<!-- The state, not an empty form: this connection bills each call and reports
										     what it billed, so a row of blank fields would invite a figure nothing reads.

										     Setting one brings the fields back, the way typing over a stored key does.
										     It means "bill this at my rate rather than theirs". -->
										<div class="flex items-center gap-2">
											<Coins class="text-muted h-4 w-4 shrink-0" />
											<p class="text-muted min-w-0 flex-1 text-xs leading-snug">
												<span class="text-active font-medium">{$LL.priceAuto()}</span>
												· {$LL.priceAutoHelp()}
											</p>
											<button
												type="button"
												onclick={() => overriding.add(name)}
												class="border-shade-3 text-muted hover:border-shade-4 hover:text-active shrink-0 rounded-md border px-2 py-1 text-xs transition-colors"
											>
												{$LL.priceFallbackSet()}
											</button>
										</div>
									{:else}
										{#if reported}
											<!-- Said plainly, because this is where the two figures could be confused: the
											     provider still reports what it charged, and this is what gets counted. -->
											<p class="text-muted text-xs leading-snug">{$LL.priceFallbackHelp()}</p>
										{/if}

										<!-- One line, always: wrapping the currency underneath left it alone on a row
										     with the width beside it unused. -->
										<div class="flex items-center gap-2">
											{#if unit === 'token'}
												{#each [{ side: 'input' as const, icon: ArrowUpRight, label: $LL.pricePerMillionIn() }, { side: 'output' as const, icon: ArrowDownRight, label: $LL.pricePerMillionOut() }] as field (field.side)}
													{@const Icon = field.icon}
													<!-- The arrow is the whole label, both leaning the same way so the pair reads
													     as one movement rather than two opposed ones. -->
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
												<!-- One figure: nothing billed per image or per second charges the way in
												     differently from the way out. -->
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

											<!-- No empty option: a price without a currency is a number nobody can add up,
											     and USD is what providers publish in. -->
											<span class="w-20 shrink-0">
												<Select
													value={price?.currency ?? DEFAULT_CURRENCY}
													options={CURRENCIES.map((code) => ({ value: code, label: code }))}
													onChange={(option) => setCurrency(name, option.value)}
												/>
											</span>
										</div>
									{/if}
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

<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import type { SamplingKey, SamplingOptions } from '$lib/chat/options';
	import Collapsible from '$lib/components/Collapsible.svelte';
	import NumberField from '$lib/components/NumberField.svelte';
	import Select from '$lib/components/Select.svelte';

	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';

	/**
	 * The sampling settings, in two groups that are two for a reason.
	 *
	 * The same component wherever they are edited, since three copies of nineteen
	 * fields would have drifted apart by the second one.
	 *
	 * The split is the point: the first group reaches every provider, the second is
	 * llama.cpp's vocabulary and goes nowhere else, because an endpoint that does
	 * not know a field answers 400 rather than ignoring it.
	 */
	interface Props {
		/** This level's values, mutated through the binding. */
		values: SamplingOptions;
		/** Empty in Settings, where an empty field means the provider decides. Inside a conversation it is the account's own set, so a blank box reads as the value the turn will use. */
		inherited?: SamplingOptions;
		/** True when the model in play is on an Ollama connection. */
		ollama: boolean;
		/** Locked by the administrator: shown, never editable. */
		disabled?: boolean;
		/** Only where the binding is not enough on its own, a conversation being saved. */
		onChange?: () => void;
	}

	let {
		values = $bindable(),
		inherited = {},
		ollama,
		disabled = false,
		onChange
	}: Props = $props();

	/**
	 * An empty box reads as _Auto_ rather than a number, because there is no number
	 * to print: these reach every provider and each defaults differently. The panel
	 * used to show Ollama's figures, so somebody on OpenAI read 0.8 for a
	 * temperature that would arrive as 1.0.
	 *
	 * `fallback` is for the rare field whose absence is worth naming in words, and
	 * `seed` is the only one: no seed is a different draw every time.
	 */
	interface FieldSpec {
		key: SamplingKey;
		label: string;
		kind: 'number' | 'text' | 'switch';
		fallback?: string;
		min?: number;
		max?: number;
		step?: number;
	}

	/**
	 * The two fields people actually come here for; everything else is folded away.
	 * The context window earns its place because it decides whether the model still
	 * remembers the start of the conversation, and because it is the one the app
	 * reads for itself, for the load meter.
	 */
	const common: FieldSpec[] = $derived([
		{
			key: 'temperature',
			label: $LL.temperature(),
			kind: 'number',
			min: 0,
			max: 2,
			step: 0.1
		},
		{ key: 'num_ctx', label: $LL.numCtx(), kind: 'number', min: 1, step: 1024 }
	]);

	const portable: FieldSpec[] = $derived([
		{
			key: 'top_p',
			label: $LL.topP(),
			kind: 'number',
			min: 0,
			max: 1,
			step: 0.05
		},
		{ key: 'seed', label: $LL.seed(), kind: 'number', fallback: $LL.random(), min: 0, step: 1 },
		{
			key: 'num_predict',
			label: $LL.numPredict(),
			kind: 'number',
			min: -2,
			step: 1
		},
		{
			key: 'presence_penalty',
			label: $LL.presencePenalty(),
			kind: 'number',
			step: 0.01
		},
		{
			key: 'frequency_penalty',
			label: $LL.frequencyPenalty(),
			kind: 'number',
			step: 0.01
		},
		{ key: 'stop', label: $LL.stop(), kind: 'text' }
	]);

	const ollamaOnly: FieldSpec[] = $derived([
		{ key: 'top_k', label: $LL.topK(), kind: 'number', min: 1, step: 1 },
		{
			key: 'min_p',
			label: $LL.minP(),
			kind: 'number',
			min: 0,
			max: 1,
			step: 0.01
		},
		{
			key: 'typical_p',
			label: $LL.typicalP(),
			kind: 'number',
			min: 0,
			max: 1,
			step: 0.01
		},
		{
			key: 'repeat_penalty',
			label: $LL.repeatPenalty(),
			kind: 'number',
			step: 0.1
		},
		{
			key: 'repeat_last_n',
			label: $LL.repeatLastN(),
			kind: 'number',
			min: -1,
			step: 1
		},
		{
			key: 'num_keep',
			label: $LL.numKeep(),
			kind: 'number',
			min: 0,
			step: 1
		},
		{
			key: 'mirostat',
			label: $LL.mirostat(),
			kind: 'number',
			min: 0,
			max: 2,
			step: 1
		},
		{ key: 'mirostat_tau', label: $LL.mirostatTau(), kind: 'number', step: 0.1 },
		{ key: 'mirostat_eta', label: $LL.mirostatEta(), kind: 'number', step: 0.01 },
		{ key: 'penalize_newline', label: $LL.penalizeNewline(), kind: 'switch' }
	]);

	/** Read on the folded rows, so opening one is a decision rather than a search. */
	function summaryOf(specs: FieldSpec[]): string {
		const count = specs.filter((spec) => values[spec.key] !== undefined).length;
		return count ? $LL.samplingFieldCount({ count }) : $LL.automatic();
	}

	/** `stop` is the one field that is a list on the wire and a single box on screen. */
	function display(source: SamplingOptions, key: SamplingKey): string {
		const value = source[key];
		if (value === undefined) return '';
		if (Array.isArray(value)) return value[0] ?? '';
		if (typeof value === 'boolean') return value ? $LL.on() : $LL.off();
		return String(value);
	}

	function placeholderFor(spec: FieldSpec): string {
		const above = display(inherited, spec.key);
		return above !== '' ? above : (spec.fallback ?? $LL.automatic());
	}

	/** A blank box hands the field back to whatever is above it. Written by removing the key rather than storing `undefined`, which on the wire reads as a value somebody chose. */
	function write(key: SamplingKey, value: unknown) {
		const next: Record<string, unknown> = { ...values };
		if (value === undefined) delete next[key];
		else next[key] = value;
		values = next as SamplingOptions;
		onChange?.();
	}

	function onNumber(spec: FieldSpec, raw: string) {
		if (raw.trim() === '') return write(spec.key, undefined);
		const value = Number(raw);
		if (Number.isFinite(value)) write(spec.key, value);
	}

	function onText(spec: FieldSpec, raw: string) {
		write(spec.key, raw.trim() === '' ? undefined : [raw]);
	}
</script>

{#snippet field(spec: FieldSpec)}
	<SettingsField label={spec.label}>
		{#if spec.kind === 'switch'}
			<!-- The same three-position control as on an Ollama connection, and the app's own
			     `Select`: a raw `<select>` was the last field drawn by the platform. -->
			<Select
				{disabled}
				value={values[spec.key] === undefined ? 'inherit' : values[spec.key] ? 'on' : 'off'}
				options={[
					{ value: 'inherit', label: placeholderFor(spec) },
					{ value: 'on', label: $LL.on() },
					{ value: 'off', label: $LL.off() }
				]}
				onChange={(option) =>
					write(spec.key, option.value === 'inherit' ? undefined : option.value === 'on')}
			/>
		{:else if spec.kind === 'text'}
			<input
				class="settings-field"
				type="text"
				{disabled}
				placeholder={placeholderFor(spec)}
				value={display(values, spec.key)}
				onchange={(event) => onText(spec, event.currentTarget.value)}
			/>
		{:else}
			<NumberField
				{disabled}
				min={spec.min}
				max={spec.max}
				step={spec.step}
				placeholder={placeholderFor(spec)}
				value={display(values, spec.key)}
				onChange={(raw) => onNumber(spec, raw)}
			/>
		{/if}
	</SettingsField>
{/snippet}

<div class="flex flex-col gap-3">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		{#each common as spec (spec.key)}
			{@render field(spec)}
		{/each}
	</div>

	<Collapsible title={$LL.samplingMore()} summary={summaryOf(portable)}>
		<div class="flex flex-col gap-3">
			<SettingsHint>{$LL.samplingEveryProviderHelp()}</SettingsHint>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each portable as spec (spec.key)}
					{@render field(spec)}
				{/each}
			</div>
		</div>
	</Collapsible>

	<!-- Its own fold rather than a marked-out block: these reach an Ollama and
	     nothing else, and the difference is invisible until a turn fails. Still
	     there when the model is not on one, dimmed and labelled. -->
	<div class:opacity-60={!ollama}>
		<Collapsible
			title={$LL.samplingOllamaOnly()}
			description={ollama ? undefined : $LL.samplingNotApplicable()}
			summary={summaryOf(ollamaOnly)}
		>
			<div class="flex flex-col gap-3">
				<SettingsHint>
					{ollama ? $LL.samplingOllamaOnlyHelp() : $LL.samplingOllamaOnlyInactiveHelp()}
				</SettingsHint>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each ollamaOnly as spec (spec.key)}
						{@render field(spec)}
					{/each}
				</div>
			</div>
		</Collapsible>
	</div>
</div>

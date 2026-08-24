<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import type { SamplingKey, SamplingOptions } from '$lib/chat/options';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';

	/**
	 * The sampling settings, in two groups that are two groups for a reason.
	 *
	 * The same component wherever they are edited: an account's own set in
	 * Settings, the published set on the Admin tab, and a conversation's overrides
	 * in its own dialog. Three copies of nineteen fields would have drifted apart
	 * by the second one.
	 *
	 * The split down the middle is the point. The first group reaches every
	 * provider; the second is llama.cpp's vocabulary and is never sent anywhere
	 * else, because an endpoint that does not know a field answers 400 rather than
	 * ignoring it. A panel that does not say which is which invites people to set
	 * things that quietly do nothing.
	 */
	interface Props {
		/** This level's values, mutated through the binding. */
		values: SamplingOptions;
		/**
		 * What an empty field falls back to, shown as its placeholder.
		 *
		 * Empty in Settings, where an empty field means the provider decides. Inside
		 * a conversation it is the account's own set, so a blank box reads as the
		 * value the turn will actually use rather than as nothing at all.
		 */
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
	 * One field, and what the endpoint does when nobody sets it.
	 *
	 * `fallback` is the provider's own default, shown as the placeholder when
	 * nothing above has an opinion either, so the box always reads as the value
	 * that will be used instead of as an empty space.
	 */
	interface FieldSpec {
		key: SamplingKey;
		label: string;
		kind: 'number' | 'text' | 'switch';
		fallback: string;
		min?: number;
		max?: number;
		step?: number;
	}

	const portable: FieldSpec[] = $derived([
		{
			key: 'temperature',
			label: $LL.temperature(),
			kind: 'number',
			fallback: '0.8',
			min: 0,
			max: 2,
			step: 0.1
		},
		{
			key: 'top_p',
			label: $LL.topP(),
			kind: 'number',
			fallback: '0.9',
			min: 0,
			max: 1,
			step: 0.05
		},
		{ key: 'seed', label: $LL.seed(), kind: 'number', fallback: $LL.random(), min: 0, step: 1 },
		{
			key: 'num_predict',
			label: $LL.numPredict(),
			kind: 'number',
			fallback: '128',
			min: -2,
			step: 1
		},
		{
			key: 'presence_penalty',
			label: $LL.presencePenalty(),
			kind: 'number',
			fallback: $LL.automatic(),
			step: 0.01
		},
		{
			key: 'frequency_penalty',
			label: $LL.frequencyPenalty(),
			kind: 'number',
			fallback: $LL.automatic(),
			step: 0.01
		},
		{ key: 'stop', label: $LL.stop(), kind: 'text', fallback: $LL.automatic() },
		{ key: 'num_ctx', label: $LL.numCtx(), kind: 'number', fallback: '2048', min: 1, step: 1 }
	]);

	const ollamaOnly: FieldSpec[] = $derived([
		{ key: 'top_k', label: $LL.topK(), kind: 'number', fallback: '40', min: 1, step: 1 },
		{
			key: 'min_p',
			label: $LL.minP(),
			kind: 'number',
			fallback: '0.0',
			min: 0,
			max: 1,
			step: 0.01
		},
		{ key: 'tfs_z', label: $LL.tfsZ(), kind: 'number', fallback: '1', min: 1, step: 0.1 },
		{
			key: 'typical_p',
			label: $LL.typicalP(),
			kind: 'number',
			fallback: $LL.automatic(),
			min: 0,
			max: 1,
			step: 0.01
		},
		{
			key: 'repeat_penalty',
			label: $LL.repeatPenalty(),
			kind: 'number',
			fallback: '1.1',
			step: 0.1
		},
		{
			key: 'repeat_last_n',
			label: $LL.repeatLastN(),
			kind: 'number',
			fallback: '64',
			min: -1,
			step: 1
		},
		{
			key: 'num_keep',
			label: $LL.numKeep(),
			kind: 'number',
			fallback: $LL.automatic(),
			min: 0,
			step: 1
		},
		{
			key: 'mirostat',
			label: $LL.mirostat(),
			kind: 'number',
			fallback: '0',
			min: 0,
			max: 2,
			step: 1
		},
		{ key: 'mirostat_tau', label: $LL.mirostatTau(), kind: 'number', fallback: '5.0', step: 0.1 },
		{ key: 'mirostat_eta', label: $LL.mirostatEta(), kind: 'number', fallback: '0.1', step: 0.01 },
		{
			key: 'penalize_newline',
			label: $LL.penalizeNewline(),
			kind: 'switch',
			fallback: $LL.automatic()
		}
	]);

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
		return above !== '' ? above : spec.fallback;
	}

	/**
	 * A blank box hands the field back to whatever is above it, which is what
	 * people expect from clearing one. Written by removing the key rather than by
	 * storing `undefined`: an `undefined` on the wire reads as a value somebody
	 * chose, and that mistake is exactly what the retired panel used to make.
	 */
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
			<select
				class="settings-field"
				{disabled}
				value={values[spec.key] === undefined ? 'inherit' : values[spec.key] ? 'on' : 'off'}
				onchange={(event) => {
					const choice = event.currentTarget.value;
					write(spec.key, choice === 'inherit' ? undefined : choice === 'on');
				}}
			>
				<option value="inherit">{placeholderFor(spec)}</option>
				<option value="on">{$LL.on()}</option>
				<option value="off">{$LL.off()}</option>
			</select>
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
			<input
				class="settings-field"
				type="number"
				{disabled}
				min={spec.min}
				max={spec.max}
				step={spec.step}
				placeholder={placeholderFor(spec)}
				value={display(values, spec.key)}
				onchange={(event) => onNumber(spec, event.currentTarget.value)}
			/>
		{/if}
	</SettingsField>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3">
		<SettingsHint>{$LL.samplingEveryProviderHelp()}</SettingsHint>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each portable as spec (spec.key)}
				{@render field(spec)}
			{/each}
		</div>
	</div>

	<!-- Marked out rather than mixed in: these reach an Ollama and nothing else,
	     and the difference is invisible until a turn fails. Still shown when the
	     model is not on one, dimmed and labelled, because hiding them would make a
	     value somebody set look as though it had gone. Dimmed rather than
	     disabled: "not in play" is the message, not "broken", and a value set for a
	     model you are about to switch back to still has to be correctable. -->
	<div class="border-shade-3 flex flex-col gap-3 border-t pt-4" class:opacity-60={!ollama}>
		<div class="flex items-center gap-2">
			<h4 class="text-active text-sm font-medium">{$LL.samplingOllamaOnly()}</h4>
			{#if !ollama}
				<SettingsBadge>{$LL.samplingNotApplicable()}</SettingsBadge>
			{/if}
		</div>
		<SettingsHint>
			{ollama ? $LL.samplingOllamaOnlyHelp() : $LL.samplingOllamaOnlyInactiveHelp()}
		</SettingsHint>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each ollamaOnly as spec (spec.key)}
				{@render field(spec)}
			{/each}
		</div>
	</div>
</div>

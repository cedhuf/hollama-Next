<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { LOAD_BOOLEAN_KEYS, LOAD_NUMBER_KEYS, type LoadOptions } from '$lib/chat/options';
	import Select from '$lib/components/Select.svelte';
	import type { Server } from '$lib/connections';

	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';

	/**
	 * How this Ollama loads a model, configured once on the connection.
	 *
	 * These used to be on the conversation, which is where they did damage: the
	 * old panel bound its switches straight to it, so merely opening the panel
	 * wrote `false` into six fields that were then sent on every turn. Nothing
	 * here is ever written unless somebody changes it, which is why the switches
	 * take a value and a callback rather than a two-way binding: a checkbox bound
	 * to `undefined` reports itself as `false` the moment it is rendered, and that
	 * is the whole of the original bug.
	 */
	interface Props {
		server: Server;
		/** Called after any change, so the parent can persist the connection. */
		onChange: () => void;
	}

	let { server = $bindable(), onChange }: Props = $props();

	const options = $derived(server.loadOptions ?? {});
	const isSet = $derived(Object.keys(options).length > 0);

	const numberLabels: Record<(typeof LOAD_NUMBER_KEYS)[number], string> = $derived({
		num_batch: $LL.numBatch(),
		num_gpu: $LL.numGpu(),
		main_gpu: $LL.mainGpu(),
		num_thread: $LL.numThread()
	});

	const booleanLabels: Record<(typeof LOAD_BOOLEAN_KEYS)[number], string> = $derived({
		numa: $LL.numa(),
		low_vram: $LL.lowVram(),
		f16_kv: $LL.f16Kv(),
		vocab_only: $LL.vocabOnly(),
		use_mmap: $LL.useMmap(),
		use_mlock: $LL.useMlock()
	});

	/**
	 * A blank field means "let Ollama decide", which is not the same answer as any
	 * number, so it removes the key instead of storing a zero.
	 */
	function setNumber(key: (typeof LOAD_NUMBER_KEYS)[number], raw: string) {
		const next: LoadOptions = { ...options };
		const value = Number(raw);
		if (raw.trim() === '' || !Number.isFinite(value)) delete next[key];
		else next[key] = Math.round(value);
		server.loadOptions = next;
		onChange();
	}

	/**
	 * Three positions, not two, for the same reason the number fields have a blank
	 * one: `false` and "unset" are different answers. `use_mmap` is on by default in
	 * Ollama, so a switch that could only say true or false left no way back once it
	 * had been touched, and wrote a preference nobody expressed.
	 */
	const switchOptions = $derived([
		{ value: 'auto', label: $LL.automatic() },
		{ value: 'on', label: $LL.on() },
		{ value: 'off', label: $LL.off() }
	]);

	function setBoolean(key: (typeof LOAD_BOOLEAN_KEYS)[number], choice: string) {
		const next: LoadOptions = { ...options };
		if (choice === 'auto') delete next[key];
		else next[key] = choice === 'on';
		server.loadOptions = next;
		onChange();
	}

	/** Back to letting the server decide everything, which is where a fresh one starts. */
	function clearAll() {
		server.loadOptions = {};
		onChange();
	}
</script>

<div class="flex flex-col gap-3">
	<SettingsHint>{$LL.loadOptionsHelp()}</SettingsHint>

	<div class="grid grid-cols-2 gap-3">
		{#each LOAD_NUMBER_KEYS as key (key)}
			<SettingsField label={numberLabels[key]}>
				<input
					class="settings-field"
					type="number"
					min={key === 'main_gpu' || key === 'num_gpu' ? 0 : 1}
					step="1"
					placeholder={$LL.automatic()}
					value={options[key] ?? ''}
					onchange={(event) => setNumber(key, event.currentTarget.value)}
				/>
			</SettingsField>
		{/each}
	</div>

	<div class="flex flex-col gap-2">
		{#each LOAD_BOOLEAN_KEYS as key (key)}
			<SettingsField label={booleanLabels[key]}>
				<Select
					value={options[key] === undefined ? 'auto' : options[key] ? 'on' : 'off'}
					options={switchOptions}
					onChange={(option) => setBoolean(key, option.value)}
				/>
			</SettingsField>
		{/each}
	</div>

	{#if isSet}
		<button type="button" class="text-link self-start text-xs hover:underline" onclick={clearAll}>
			{$LL.loadOptionsClear()}
		</button>
	{/if}
</div>

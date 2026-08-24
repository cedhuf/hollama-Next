<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { LOAD_BOOLEAN_KEYS, LOAD_NUMBER_KEYS, type LoadOptions } from '$lib/chat/options';
	import NumberField from '$lib/components/NumberField.svelte';
	import Select from '$lib/components/Select.svelte';
	import type { Server } from '$lib/connections';

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
	<!-- The heading carries the reset, which greys out instead of disappearing: a
	     control you only see once you have already changed something is one nobody
	     knows they can fall back on. What these fields do belongs in the
	     documentation, not in a paragraph above a grid somebody opened on purpose. -->
	<div class="flex items-center justify-between gap-4">
		<span class="text-active text-sm font-medium">{$LL.loadOptions()}</span>
		<button
			type="button"
			class="text-link flex shrink-0 items-center gap-1.5 text-xs hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
			disabled={!isSet}
			onclick={clearAll}
		>
			<RotateCcw class="h-3.5 w-3.5" />
			{$LL.resetToAuto()}
		</button>
	</div>

	<!-- Label on the left, control on the right, two to a row. Ten settings nobody
	     touches on a working Ollama do not deserve ten full-width rows: stacked the
	     old way they pushed the pull-a-model field off the bottom of the panel. The
	     labels are short enough to sit beside their field. -->
	<div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
		{#each LOAD_NUMBER_KEYS as key (key)}
			<label class="flex items-center justify-between gap-3">
				<span class="text-active truncate text-sm">{numberLabels[key]}</span>
				<span class="w-28 shrink-0">
					<NumberField
						min={key === 'main_gpu' || key === 'num_gpu' ? 0 : 1}
						placeholder={$LL.automatic()}
						value={options[key] ?? ''}
						onChange={(raw) => setNumber(key, raw)}
					/>
				</span>
			</label>
		{/each}

		{#each LOAD_BOOLEAN_KEYS as key (key)}
			<div class="flex items-center justify-between gap-3">
				<span class="text-active truncate text-sm">{booleanLabels[key]}</span>
				<span class="w-28 shrink-0">
					<Select
						value={options[key] === undefined ? 'auto' : options[key] ? 'on' : 'off'}
						options={switchOptions}
						onChange={(option) => setBoolean(key, option.value)}
					/>
				</span>
			</div>
		{/each}
	</div>
</div>

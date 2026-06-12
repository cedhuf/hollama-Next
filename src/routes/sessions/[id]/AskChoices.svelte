<script lang="ts">
	import { Check } from '@lucide/svelte';

	import type { AskChoices } from '$lib/askChoice';

	let {
		choices,
		onChoose,
		disabled = false
	}: {
		choices: AskChoices;
		onChoose: (selected: string[][]) => void;
		disabled?: boolean;
	} = $props();

	// Local selection while the user is still picking. Once answered, we read the
	// locked-in selection off the message instead. The question set is fixed for a
	// given message, so capturing it once here is correct.
	// svelte-ignore state_referenced_locally
	let picks = $state<string[][]>(choices.questions.map(() => []));

	const answered = $derived(!!choices.answered);
	const display = $derived<string[][]>(answered ? (choices.selected ?? []) : picks);
	const allPicked = $derived(choices.questions.every((_, i) => (picks[i]?.length ?? 0) > 0));
	// A lone single-select question submits on tap — no extra confirm step.
	const autoSubmit = $derived(
		choices.questions.length === 1 && choices.questions[0].type === 'single_select'
	);

	function isSelected(qi: number, option: string): boolean {
		return (display[qi] ?? []).includes(option);
	}

	function toggle(qi: number, option: string) {
		if (answered || disabled) return;
		const question = choices.questions[qi];
		if (question.type === 'single_select') {
			picks[qi] = [option];
			if (autoSubmit) {
				onChoose(picks.map((a) => [...a]));
				return;
			}
		} else {
			picks[qi] = picks[qi].includes(option)
				? picks[qi].filter((o) => o !== option)
				: [...picks[qi], option];
		}
		picks = [...picks];
	}

	function submit() {
		if (answered || disabled || !allPicked) return;
		onChoose(picks.map((a) => [...a]));
	}
</script>

<div class="ask flex flex-col gap-3">
	{#each choices.questions as question, qi (qi)}
		<div class="flex flex-col gap-1.5">
			<p class="text-sm font-medium text-active">{question.question}</p>
			<div class="flex flex-wrap gap-1.5">
				{#each question.options as option (option)}
					{@const selected = isSelected(qi, option)}
					<button
						type="button"
						disabled={answered || disabled}
						onclick={() => toggle(qi, option)}
						class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors
							{selected
							? 'border-accent bg-accent/10 font-medium text-active'
							: 'border-shade-3 text-base hover:bg-shade-1'}
							{answered && !selected ? 'opacity-40' : ''}
							{answered || disabled ? 'cursor-default' : ''}"
					>
						{#if selected}
							<Check class="h-3.5 w-3.5 shrink-0 text-accent" />
						{/if}
						{option}
					</button>
				{/each}
			</div>
		</div>
	{/each}

	{#if !answered && !autoSubmit}
		<button
			type="button"
			disabled={!allPicked || disabled}
			onclick={submit}
			class="w-fit rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-shade-0 transition-opacity disabled:opacity-40"
		>
			Send
		</button>
	{/if}
</div>

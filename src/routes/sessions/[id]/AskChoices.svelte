<script lang="ts">
	import { Check } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
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

	// Local working state while the user is still picking. Once answered we read
	// the locked-in selection off the message instead. The question set is fixed
	// for a given message, so capturing it once here is correct.
	// svelte-ignore state_referenced_locally
	let picks = $state<string[][]>(choices.questions.map(() => []));
	// svelte-ignore state_referenced_locally
	let customOpen = $state<boolean[]>(choices.questions.map(() => false));
	// svelte-ignore state_referenced_locally
	let customText = $state<string[]>(choices.questions.map(() => ''));

	const answered = $derived(!!choices.answered);

	/** The effective answer(s) for a question: picked options + a non-empty custom value. */
	function effective(qi: number): string[] {
		const base = picks[qi] ?? [];
		const extra = customOpen[qi] && customText[qi].trim() ? [customText[qi].trim()] : [];
		return [...base, ...extra];
	}

	/** Values to render as selected: the locked answer when answered, else the live pick. */
	function selectedValues(qi: number): string[] {
		return answered ? (choices.selected?.[qi] ?? []) : effective(qi);
	}

	/** Locked-in answers that aren't one of the offered options, i.e. free-text answers. */
	function customAnswers(qi: number): string[] {
		const opts = choices.questions[qi].options;
		return (choices.selected?.[qi] ?? []).filter((v) => !opts.includes(v));
	}

	const allPicked = $derived(choices.questions.every((_, i) => effective(i).length > 0));
	// Auto-submit only the trivial case: a single single-select question with no custom input open.
	const autoSubmit = $derived(
		choices.questions.length === 1 &&
			choices.questions[0].type === 'single_select' &&
			!customOpen[0]
	);

	function isSelected(qi: number, option: string): boolean {
		return selectedValues(qi).includes(option);
	}

	function toggleOption(qi: number, option: string) {
		if (answered || disabled) return;
		if (choices.questions[qi].type === 'single_select') {
			picks[qi] = [option];
			customOpen[qi] = false; // a concrete option supersedes a custom answer
			if (autoSubmit) {
				submit();
				return;
			}
		} else {
			picks[qi] = picks[qi].includes(option)
				? picks[qi].filter((o) => o !== option)
				: [...picks[qi], option];
		}
	}

	function toggleCustom(qi: number) {
		if (answered || disabled) return;
		customOpen[qi] = !customOpen[qi];
		if (customOpen[qi] && choices.questions[qi].type === 'single_select') {
			picks[qi] = []; // single-select: a custom answer replaces the option
		}
	}

	function submit() {
		if (answered || disabled || !allPicked) return;
		onChoose(choices.questions.map((_, i) => effective(i)));
	}
</script>

<div class="ask flex flex-col gap-3">
	{#each choices.questions as question, qi (qi)}
		{@const multi = question.type === 'multi_select'}
		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline gap-2">
				<p class="text-active text-sm font-medium">{question.question}</p>
				{#if multi && !answered}
					<span class="text-muted shrink-0 text-xs">{$LL.multipleAllowed()}</span>
				{/if}
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each question.options as option (option)}
					{@const selected = isSelected(qi, option)}
					<button
						type="button"
						disabled={answered || disabled}
						onclick={() => toggleOption(qi, option)}
						class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors
							{selected
							? 'border-accent bg-accent/10 text-active font-medium'
							: 'border-shade-3 hover:bg-shade-1 text-base'}
							{answered && !selected ? 'opacity-40' : ''}
							{answered || disabled ? 'cursor-default' : ''}"
					>
						<span
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors {multi
								? 'rounded-[4px]'
								: 'rounded-full'} {selected
								? 'border-accent bg-accent text-shade-0'
								: 'border-shade-4'}"
						>
							{#if selected}
								<Check class="h-2.5 w-2.5" strokeWidth={3} />
							{/if}
						</span>
						{option}
					</button>
				{/each}

				<!-- Locked-in free-text answers (answered state). -->
				{#if answered}
					{#each customAnswers(qi) as value (value)}
						<span
							class="border-accent bg-accent/10 text-active flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
						>
							<Check class="text-accent h-3 w-3 shrink-0" strokeWidth={3} />
							{value}
						</span>
					{/each}
				{:else}
					<!-- Free-text escape hatch: answer in the user's own words. -->
					<button
						type="button"
						{disabled}
						onclick={() => toggleCustom(qi)}
						class="rounded-full border border-dashed px-3 py-1.5 text-sm transition-colors
							{customOpen[qi] ? 'border-accent text-accent' : 'border-shade-4 text-muted hover:bg-shade-1'}"
					>
						{$LL.otherChoice()}
					</button>
				{/if}
			</div>

			{#if customOpen[qi] && !answered}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={customText[qi]}
					placeholder={$LL.otherChoicePlaceholder()}
					{disabled}
					autofocus
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							submit();
						}
					}}
					class="border-shade-3 bg-shade-0 placeholder:text-muted focus:border-accent w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
				/>
			{/if}
		</div>
	{/each}

	{#if !answered && !autoSubmit}
		<button
			type="button"
			disabled={!allPicked || disabled}
			onclick={submit}
			class="bg-accent text-shade-0 w-fit rounded-lg px-4 py-1.5 text-sm font-medium transition-opacity disabled:opacity-40"
		>
			{$LL.send()}
		</button>
	{/if}
</div>

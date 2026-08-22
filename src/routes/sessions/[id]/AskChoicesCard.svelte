<script lang="ts">
	import { Check, Pencil, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import type { AskChoices } from '$lib/askChoice';

	let {
		choices,
		onChoose,
		onDismiss,
		disabled = false
	}: {
		choices: AskChoices;
		onChoose: (selected: string[][]) => void;
		/** Bypass the card and fall back to the free composer. */
		onDismiss?: () => void;
		disabled?: boolean;
	} = $props();

	const questions = $derived(choices.questions);

	// One question at a time. Answers for earlier questions accumulate here (parallel
	// to `questions`); `picks`/`customText` hold the live state for the one on screen.
	let current = $state(0);
	let answers = $state<string[][]>([]);
	let picks = $state<string[]>([]);
	let customText = $state('');

	const question = $derived(questions[current]);
	const multi = $derived(question.type === 'multi_select');
	const isLast = $derived(current === questions.length - 1);

	/** The effective answer for the current question: picked options + a non-empty custom value. */
	function effective(): string[] {
		const extra = customText.trim() ? [customText.trim()] : [];
		return [...picks, ...extra];
	}

	const canAdvance = $derived(effective().length > 0);

	function advance(values: string[]) {
		if (disabled || !values.length) return;
		const next = [...answers];
		next[current] = values;
		if (isLast) {
			onChoose(next);
			return;
		}
		answers = next;
		current += 1;
		picks = [];
		customText = '';
	}

	function pickOption(option: string) {
		if (disabled) return;
		if (multi) {
			picks = picks.includes(option) ? picks.filter((o) => o !== option) : [...picks, option];
		} else {
			// Single-select: tapping an option answers the question outright.
			advance([option]);
		}
	}

	function submitCustom() {
		const text = customText.trim();
		if (!text || disabled) return;
		if (multi) {
			// Fold the typed value into the running selection; confirm via the button.
			if (!picks.includes(text)) picks = [...picks, text];
			customText = '';
		} else {
			advance([text]);
		}
	}
</script>

<!-- `surface-floating`, like the composer it sits above: both are cards hovering
     over the conversation, and both answer to the transparency setting. -->
<div
	class="ask-card surface-floating border-shade-3 flex max-h-[min(55vh,30rem)] w-full flex-col overflow-hidden rounded-2xl border shadow-lg"
>
	<!-- Header: the current question, a counter when there are several, and dismiss. -->
	<div class="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
		<div class="flex min-w-0 flex-col gap-0.5">
			{#if questions.length > 1}
				<span class="text-muted text-xs font-medium">{current + 1} / {questions.length}</span>
			{/if}
			<p class="text-active text-base leading-snug font-medium">{question.question}</p>
			{#if multi}
				<span class="text-muted text-xs">{$LL.multipleAllowed()}</span>
			{/if}
		</div>
		{#if onDismiss}
			<button
				type="button"
				onclick={onDismiss}
				aria-label={$LL.cancel()}
				class="text-muted hover:bg-shade-2 hover:text-active -mt-1.5 -mr-1.5 shrink-0 rounded-md p-1.5 transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>

	<!-- Scrollable numbered list of options, plus a free-text row as the final entry. -->
	<div class="min-h-0 flex-1 overflow-y-auto" style="overscroll-behavior: contain">
		{#each question.options as option, oi (option)}
			{@const selected = picks.includes(option)}
			<button
				type="button"
				{disabled}
				onclick={() => pickOption(option)}
				class="border-shade-2 hover:bg-shade-1 flex w-full items-center gap-3 border-t px-4 py-3 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-50 {selected
					? 'bg-accent/5'
					: ''}"
			>
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors {selected
						? 'bg-accent text-shade-0'
						: 'bg-shade-2 text-muted'}"
				>
					{#if selected}
						<Check class="h-4 w-4" strokeWidth={3} />
					{:else}
						{oi + 1}
					{/if}
				</span>
				<span class="min-w-0 flex-1 {selected ? 'text-active font-medium' : 'text-base'}">
					{option}
				</span>
			</button>
		{/each}

		<!-- Free-text escape hatch, styled as the last row. -->
		<div class="border-shade-2 flex items-center gap-3 border-t px-4 py-3">
			<span
				class="bg-shade-2 text-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
			>
				<Pencil class="h-3.5 w-3.5" />
			</span>
			<input
				type="text"
				bind:value={customText}
				placeholder={$LL.otherChoicePlaceholder()}
				{disabled}
				enterkeyhint={multi ? 'done' : 'send'}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						submitCustom();
					}
				}}
				class="text-active placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
			/>
		</div>
	</div>

	<!-- Multi-select needs an explicit confirm; single-select submits on tap. -->
	{#if multi}
		<div class="border-shade-2 border-t p-3">
			<button
				type="button"
				disabled={disabled || !canAdvance}
				onclick={() => advance(effective())}
				class="bg-accent text-shade-0 w-full rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
			>
				{$LL.send()}
			</button>
		</div>
	{/if}
</div>

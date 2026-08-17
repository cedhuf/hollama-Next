<script lang="ts">
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import type { Component, Snippet } from 'svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide, type TransitionConfig } from 'svelte/transition';

	/**
	 * How a note is drawn: a rule across the conversation, a pill on it, and what
	 * it has to say folded underneath.
	 *
	 * A rule rather than a bubble, because a note marks something that happened to
	 * the conversation and is not a turn in it. The shape was written twice, once
	 * for compaction and once for clearing, and the two had already drifted in the
	 * padding of their panels. A third kind would have made three.
	 *
	 * So the pill is built from props here, and every kind gets the same one. The
	 * `pill` snippet is the way out for the one case that cannot use it: the
	 * compaction that is still being written has no note yet, no panel to unfold,
	 * and a cancel button where the chevron goes.
	 */
	interface Props {
		icon: Component;
		/** What the pill says, already counted and localised. */
		label: string;
		/** Relative time, shown dimmed after the label. Absent while pending. */
		when?: string;
		testid?: string;
		/** Unfolded on first render, for a note whose content is the reason it exists. */
		open?: boolean;
		/** The rules sweep outwards and the pill does not toggle. */
		pending?: boolean;
		/** Replaces the built-in pill entirely. */
		pill?: Snippet;
		/**
		 * How the built-in pill arrives.
		 *
		 * One prop rather than a key to plumb through: compaction pairs this pill
		 * with the one that waited in its place, and that pairing is compaction's
		 * business, not the shell's. Everything else takes the default and appears.
		 */
		pillIn?: (node: Element) => TransitionConfig | (() => TransitionConfig);
		/** What unfolds. Without it the pill is a label rather than a button. */
		panel?: Snippet;
	}

	let {
		icon: Icon,
		label,
		when,
		testid,
		open = false,
		pending = false,
		pill,
		pillIn = () => ({ duration: 0 }),
		panel
	}: Props = $props();

	// Deliberately the initial value: a note that opens itself does it once, when
	// it appears, and folding it afterwards is the reader's business.
	// svelte-ignore state_referenced_locally
	let expanded = $state(open);
</script>

<div class="my-4 flex flex-col gap-2" data-testid={testid}>
	<div class="flex items-center gap-3">
		<div class="rule h-px flex-1" class:rule--pending={pending} class:rule--reverse={pending}></div>

		{#if pill}
			{@render pill()}
		{:else if panel}
			<button
				type="button"
				in:pillIn
				onclick={() => (expanded = !expanded)}
				aria-expanded={expanded}
				class="flex items-center gap-2 rounded-full border border-shade-3 px-3 py-1 text-xs text-muted transition-colors hover:border-shade-4 hover:text-active"
			>
				<Icon class="h-3.5 w-3.5 shrink-0" />
				<span>{label}</span>
				{#if when}<span class="opacity-60">· {when}</span>{/if}
				{#if expanded}
					<ChevronUp class="h-3.5 w-3.5 shrink-0" />
				{:else}
					<ChevronDown class="h-3.5 w-3.5 shrink-0" />
				{/if}
			</button>
		{:else}
			<div
				class="flex items-center gap-2 rounded-full border border-shade-3 px-3 py-1 text-xs text-muted"
			>
				<Icon class="h-3.5 w-3.5 shrink-0" />
				<span>{label}</span>
				{#if when}<span class="opacity-60">· {when}</span>{/if}
			</div>
		{/if}

		<div class="rule h-px flex-1" class:rule--pending={pending}></div>
	</div>

	{#if expanded && panel}
		<div transition:slide={{ duration: 200, easing: quadInOut }}>
			{@render panel()}
		</div>
	{/if}
</div>

<style>
	.rule {
		background-color: var(--color-shade-3);
	}

	/* While something is being written, the rules carry a highlight that travels
	   outwards from the pill. Slow and low-contrast on purpose: it says "still
	   working" from the corner of the eye without competing with the text above. */
	.rule--pending {
		background-image: linear-gradient(
			90deg,
			transparent 0%,
			var(--color-accent) 50%,
			transparent 100%
		);
		background-size: 40% 100%;
		background-repeat: no-repeat;
		animation: note-sweep 1.8s ease-in-out infinite;
		opacity: 0.7;
	}

	/* The rule on the left runs the other way, so the highlight leaves the pill in
	   both directions rather than crossing the whole row like a progress bar. */
	.rule--reverse {
		animation-direction: reverse;
	}

	@keyframes note-sweep {
		from {
			background-position: -40% 0;
		}
		to {
			background-position: 140% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rule--pending {
			animation: none;
		}
	}
</style>

<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { Collapsible } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	/**
	 * A settings block that is folded until somebody asks for it.
	 *
	 * On `bits-ui`'s primitive rather than a hand-rolled `{#if}`: it owns the
	 * `aria-expanded` / `aria-controls` pair, the keyboard behaviour and the id
	 * plumbing between the two halves, and those are exactly the parts that get
	 * left out when a disclosure is written again in a hurry.
	 *
	 * The summary is the point of the pattern. A folded block that says only its
	 * title asks somebody to open it to find out whether they needed to; one that
	 * says "no limit" or "3 of 12 priced" answers the question while closed, and
	 * opening it is then a decision rather than a search.
	 */
	interface Props {
		title: string;
		/** Read while closed: the answer, so opening is a choice rather than a hunt. */
		summary?: string;
		description?: string;
		icon?: Component<{ class?: string }>;
		open?: boolean;
		children: Snippet;
	}

	let {
		title,
		summary,
		description,
		icon: Icon,
		open = $bindable(false),
		children
	}: Props = $props();
</script>

<Collapsible.Root bind:open class="rounded-xl border border-shade-3 bg-shade-0">
	<Collapsible.Trigger
		class="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-shade-1"
	>
		{#if Icon}
			<Icon class="h-4 w-4 shrink-0 text-muted" />
		{/if}

		<span class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-sm font-medium text-active">{title}</span>
			{#if description}
				<span class="truncate text-xs text-muted">{description}</span>
			{/if}
		</span>

		{#if summary}
			<span class="shrink-0 text-xs tabular-nums text-muted">{summary}</span>
		{/if}

		<ChevronDown
			class="h-4 w-4 shrink-0 text-muted transition-transform duration-200 {open
				? 'rotate-180'
				: ''}"
		/>
	</Collapsible.Trigger>

	<Collapsible.Content forceMount>
		{#snippet child({ props, open: isOpen })}
			{#if isOpen}
				<div {...props} transition:slide={{ duration: 200, easing: quadInOut }}>
					<div class="flex flex-col gap-3 border-t border-shade-2 p-3.5">
						{@render children()}
					</div>
				</div>
			{/if}
		{/snippet}
	</Collapsible.Content>
</Collapsible.Root>

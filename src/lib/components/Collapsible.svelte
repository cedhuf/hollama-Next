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
	 * `aria-expanded` and `aria-controls` pair, the keyboard behaviour and the id
	 * plumbing, which are the parts left out when a disclosure is written in a hurry.
	 *
	 * The summary is the point: a folded block saying only its title asks you to
	 * open it to find out whether you needed to.
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

<!-- `overflow-hidden` so the trigger's hover fill is clipped by the rounded
     border rather than squaring off its top corners. -->
<Collapsible.Root bind:open class="border-shade-3 bg-shade-0 overflow-hidden rounded-xl border">
	<!-- A fixed height, so a block with a description and one without are the same
	     size: a row that shrinks when its subtitle goes moves everything under it. -->
	<Collapsible.Trigger
		class="hover:bg-shade-1 flex h-14 w-full items-center gap-2.5 px-3.5 text-left transition-colors"
	>
		{#if Icon}
			<Icon class="text-muted h-4 w-4 shrink-0" />
		{/if}

		<span class="flex min-w-0 flex-1 flex-col">
			<span class="text-active truncate text-sm font-medium">{title}</span>
			{#if description}
				<span class="text-muted truncate text-xs">{description}</span>
			{/if}
		</span>

		{#if summary}
			<span class="text-muted shrink-0 text-xs tabular-nums">{summary}</span>
		{/if}

		<ChevronDown
			class="text-muted h-4 w-4 shrink-0 transition-transform duration-200 {open
				? 'rotate-180'
				: ''}"
		/>
	</Collapsible.Trigger>

	<Collapsible.Content forceMount>
		{#snippet child({ props, open: isOpen })}
			{#if isOpen}
				<div {...props} transition:slide={{ duration: 200, easing: quadInOut }}>
					<div class="border-shade-2 flex flex-col gap-3 border-t p-3.5">
						{@render children()}
					</div>
				</div>
			{/if}
		{/snippet}
	</Collapsible.Content>
</Collapsible.Root>

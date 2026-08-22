<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';

	/**
	 * A single action inside `Menu`. Keeps the row styling in one place so every
	 * menu in the app looks and behaves identically.
	 */
	interface Props {
		onclick: () => void;
		children: Snippet;
		/** Leading lucide icon. */
		icon?: Component<{ class?: string }>;
		/** Destructive actions are tinted red. */
		danger?: boolean;
		disabled?: boolean;
	}

	let { onclick, children, icon: Icon, danger = false, disabled = false }: Props = $props();
</script>

<DropdownMenu.Item
	{disabled}
	onSelect={onclick}
	class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors select-none focus-visible:outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 {danger
		? 'text-red-600 data-[highlighted]:bg-red-500/10'
		: 'text-active data-[highlighted]:bg-shade-1'}"
>
	{#if Icon}
		<Icon class="h-4 w-4 shrink-0 {danger ? '' : 'text-muted'}" />
	{/if}
	{@render children()}
</DropdownMenu.Item>

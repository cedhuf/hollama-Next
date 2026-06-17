<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'default' | 'outline' | 'link' | 'icon';
		href?: string;
		isLoading?: boolean;
		isActive?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
		/** Pass-through attributes (title, disabled, data-testid, aria-*, …). */
		[key: string]: unknown;
	}

	let {
		variant = 'default',
		href,
		isLoading = false,
		isActive = false,
		class: className,
		onclick,
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<!-- Generic anchor primitive: href may be an internal resolve() path or an external
	     URL (link variant, target=_blank). Resolution is the caller's responsibility. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		{...rest}
		{href}
		class="
			inline-flex items-center justify-center gap-2 rounded-md
			button--{variant}
			{variant === 'default' || variant === 'outline'
			? 'border px-3 py-2 text-sm font-medium leading-tight disabled:pointer-events-none disabled:border-shade-2 disabled:bg-shade-2 disabled:text-muted'
			: ''}
			{variant === 'default' ? 'border-accent bg-accent text-shade-0' : ''}
			{variant === 'outline' ? 'border-shade-4 hover:border-shade-6 hover:text-active' : ''}
			{variant === 'link' ? 'text-link inline rounded-none' : ''}
			{variant === 'icon' ? 'px-2.5 py-2 text-muted hover:text-active' : ''}
			{className}
		"
		{onclick}
	>
		{@render children?.()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		{...rest}
		class="
			{isLoading ? 'relative' : ''}
			inline-flex items-center justify-center gap-2 rounded-md
			button--{variant}
			{variant === 'default' || variant === 'outline'
			? 'border px-3 py-2 text-sm font-medium leading-tight disabled:pointer-events-none disabled:border-shade-2 disabled:bg-shade-2 disabled:text-muted'
			: ''}
			{variant === 'default' ? 'border-accent bg-accent text-shade-0' : ''}
			{variant === 'outline' ? 'border-shade-4 hover:border-shade-6 hover:text-active' : ''}
			{variant === 'link' ? 'text-link inline rounded-none' : ''}
			{variant === 'icon' ? 'px-2.5 py-2 text-muted hover:text-active' : ''}
			{isActive ? 'text-active' : ''}
			{className}
		"
		type="button"
		{onclick}
	>
		<span
			class="absolute inset-0 flex items-center justify-center bg-shade-2 {isLoading
				? 'flex'
				: 'hidden'}"
		>
			<LoaderCircle class="base-icon animate-spin" />
		</span>
		{@render children?.()}
	</button>
{/if}

<style lang="postcss">
	.button--link[target='_blank']:after {
		content: ' ↗';
	}
</style>

<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** `icon-sm` is `icon` at the scale of an inline, secondary action. */
		variant?: 'default' | 'outline' | 'link' | 'icon' | 'icon-sm';
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
			inline-flex items-center justify-center gap-2 rounded-md transition-colors duration-150
			button--{variant}
			{variant === 'default' || variant === 'outline'
			? 'disabled:border-shade-2 disabled:bg-shade-2 disabled:text-muted border px-3 py-2 text-sm leading-tight font-medium disabled:pointer-events-none'
			: ''}
			{variant === 'default' ? 'border-accent bg-accent text-shade-0' : ''}
			{variant === 'outline' ? 'border-shade-4 hover:border-shade-6 hover:text-active' : ''}
			{variant === 'link' ? 'hover:text-accent inline rounded-none' : ''}
			{variant === 'icon' ? 'text-muted hover:text-active px-2.5 py-2' : ''}
			{variant === 'icon-sm' ? 'text-muted hover:text-active px-1.5 py-1' : ''}
			{className}
		"
		{onclick}
	>
		{#if variant === 'link'}
			<!-- The words are underlined, the arrow after them is not: an underline
			     running under a glyph that is not part of the sentence reads as a gap
			     in the line rather than as emphasis. -->
			<span class="underline underline-offset-4">{@render children?.()}</span>
		{:else}
			{@render children?.()}
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		{...rest}
		class="
			{isLoading ? 'relative' : ''}
			inline-flex items-center justify-center gap-2 rounded-md transition-colors duration-150
			button--{variant}
			{variant === 'default' || variant === 'outline'
			? 'disabled:border-shade-2 disabled:bg-shade-2 disabled:text-muted border px-3 py-2 text-sm leading-tight font-medium disabled:pointer-events-none'
			: ''}
			{variant === 'default' ? 'border-accent bg-accent text-shade-0' : ''}
			{variant === 'outline' ? 'border-shade-4 hover:border-shade-6 hover:text-active' : ''}
			{variant === 'link' ? 'hover:text-accent inline rounded-none' : ''}
			{variant === 'icon' ? 'text-muted hover:text-active px-2.5 py-2' : ''}
			{variant === 'icon-sm' ? 'text-muted hover:text-active px-1.5 py-1' : ''}
			{isActive ? 'text-active' : ''}
			{className}
		"
		type="button"
		{onclick}
	>
		<span
			class="bg-shade-2 absolute inset-0 flex items-center justify-center {isLoading
				? 'flex'
				: 'hidden'}"
		>
			<LoaderCircle class="base-icon animate-spin" />
		</span>
		{#if variant === 'link'}
			<span class="underline underline-offset-4">{@render children?.()}</span>
		{:else}
			{@render children?.()}
		{/if}
	</button>
{/if}

<style lang="postcss">
	/* Outside the underlined span, so it needs its own bit of air. */
	.button--link[target='_blank']:after {
		content: '↗';
		margin-left: 0.1em;
	}

	/**
	 * The primary button had no hover state at all: the one control people press
	 * most often was the only one that never answered the pointer.
	 *
	 * The shift is towards `--color-active`, the strongest foreground in the
	 * theme, which reads as slightly darker on a light ramp and slightly lighter
	 * on a dark one. Always a step further from the background, whichever of the
	 * twelve ramps is on, and small enough (12%) to feel like a response rather
	 * than a second colour.
	 */
	.button--default:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-accent) 88%, var(--color-active));
		border-color: color-mix(in srgb, var(--color-accent) 88%, var(--color-active));
	}
</style>

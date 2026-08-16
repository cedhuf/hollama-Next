<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { Persona } from '$lib/personas';

	import PersonaAvatar from './PersonaAvatar.svelte';

	/**
	 * One persona, drawn the same way wherever it is shown.
	 *
	 * The Library and the store had a card each, written weeks apart, and the two
	 * had already drifted: different avatar sizes, different padding, tags on one
	 * and not the other, and no way to improve either without doing the work twice.
	 * They show the same object, so they draw it from here.
	 *
	 * Two layouts rather than two components, because the difference is arrangement
	 * and nothing else: the same fields, the same actions, the same click. A grid
	 * for browsing, where a face is what you scan by; a list for a long catalogue,
	 * where a name and a line are what you scan by and a card of white space
	 * between each is in the way.
	 */
	interface Props {
		name: string;
		tagline?: string;
		avatar: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
		tags?: string[];
		/** A quiet third line: the author, whatever the caller has to add. */
		meta?: string;
		layout?: 'grid' | 'list';
		/** Makes the body itself the primary action. Without it the card is inert. */
		onclick?: () => void;
		/** Labels over the name: origin, sharing, whatever the caller has to say. */
		badges?: Snippet;
		/** The row of buttons at the foot, or at the end of the row. */
		actions?: Snippet;
		/** Top-right, revealed on hover where there is a pointer. Editing, usually. */
		corner?: Snippet;
	}

	let {
		name,
		tagline,
		avatar,
		tags = [],
		meta,
		layout = 'grid',
		onclick,
		badges,
		actions,
		corner
	}: Props = $props();

	const list = $derived(layout === 'list');
</script>

{#snippet tagRow()}
	{#if tags.length}
		<div class="flex flex-wrap gap-1">
			{#each tags.slice(0, list ? 2 : 3) as tag (tag)}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[10px] leading-4 text-muted">
					{tag}
				</span>
			{/each}
		</div>
	{/if}
{/snippet}

<!-- The frame, and the only thing that draws a border: whatever is inside it is
     laid out by one of the two branches below, and neither has to know it is in a
     card. `group` so the corner control can hide until the pointer is here. -->
<div
	class="group relative flex rounded-xl border border-shade-3 bg-shade-0 transition-colors hover:border-shade-4
		{list ? 'items-center gap-3 px-3 py-2.5' : 'flex-col gap-2.5 p-3.5'}"
>
	<!-- A button only when there is something to do, so an inert card is not
	     announced as an unusable control. It covers the card rather than wrapping
	     it, which is what keeps the actions clickable: nested buttons are invalid,
	     and an overlay leaves the ones drawn above it reachable. -->
	{#if onclick}
		<button
			type="button"
			{onclick}
			aria-label={name}
			class="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
		></button>
	{/if}

	{#if list}
		<PersonaAvatar persona={{ name, ...avatar }} size={34} />

		<div class="pointer-events-none z-10 flex min-w-0 flex-1 items-baseline gap-2">
			<span class="shrink-0 truncate text-sm font-medium text-active">{name}</span>
			{#if tagline}
				<span class="min-w-0 flex-1 truncate text-xs text-muted">{tagline}</span>
			{/if}
		</div>

		<div class="z-10 hidden shrink-0 items-center gap-1.5 sm:flex">
			{@render tagRow()}
			{#if badges}{@render badges()}{/if}
		</div>

		{#if actions}
			<div class="z-10 flex shrink-0 items-center gap-1.5">{@render actions()}</div>
		{/if}
	{:else}
		<div class="pointer-events-none z-10 flex items-start justify-between gap-2">
			<PersonaAvatar persona={{ name, ...avatar }} size={40} />
			{#if badges}
				<!-- The corner control lands on top of these, so they give way to it
				     rather than sitting under it. -->
				<div
					class="pointer-events-auto flex shrink-0 flex-wrap justify-end gap-1 transition-opacity {corner
						? '[@media(hover:hover)]:group-hover:opacity-0'
						: ''}"
				>
					{@render badges()}
				</div>
			{/if}
		</div>

		<div class="pointer-events-none z-10 flex min-w-0 flex-col gap-1">
			<span class="truncate text-sm font-medium text-active">{name}</span>
			{#if tagline}
				<span class="line-clamp-2 text-xs leading-relaxed text-muted">{tagline}</span>
			{/if}
		</div>

		<div class="pointer-events-none z-10">{@render tagRow()}</div>

		{#if meta}
			<span class="pointer-events-none z-10 truncate text-[11px] text-muted">{meta}</span>
		{/if}

		{#if actions}
			<div class="z-10 mt-auto flex items-stretch gap-1.5 pt-0.5">{@render actions()}</div>
		{/if}
	{/if}

	{#if corner}
		<div
			class="absolute right-2 top-2 z-20 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
		>
			{@render corner()}
		</div>
	{/if}
</div>

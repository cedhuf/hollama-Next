<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { Persona } from '$lib/personas';

	import PersonaAvatar from './PersonaAvatar.svelte';

	/**
	 * One thing in the library, drawn the same way wherever it is shown. A persona
	 * wears a face and a playbook does not, which is the whole difference.
	 *
	 * Three rules, each a fault this replaced. **Nothing hides**: the edit control
	 * appeared on hover, so the card said different things depending on the pointer.
	 * **Nothing is pushed out**: the body is fixed rows with the tagline clamped.
	 * **The body does one thing**: clicking it is one stated action.
	 */
	interface Props {
		name: string;
		tagline?: string;
		/** A face. Absent for the things that are not somebody. */
		avatar?: Pick<Persona, 'avatarColor' | 'avatarGlyph' | 'avatarImage'>;
		tags?: string[];
		/** A quiet line under the rest: a relationship, an author, a note. */
		meta?: string;
		layout?: 'grid' | 'list';
		/** What clicking the body does. Without it the body is not a control at all. */
		onclick?: () => void;
		/** Accessible name for that action, since "the card" is not one. */
		actionLabel?: string;
		/** Labels beside the name. They stay put. */
		badges?: Snippet;
		/** The footer. Buttons, drawn at every width and on every device. */
		actions?: Snippet;
	}

	let {
		name,
		tagline,
		avatar = undefined,
		tags = [],
		meta,
		layout = 'grid',
		onclick,
		actionLabel,
		badges,
		actions
	}: Props = $props();

	const list = $derived(layout === 'list');
</script>

{#snippet identity(size: number)}
	{#if avatar}
		<PersonaAvatar persona={{ name, ...avatar }} {size} />
	{/if}
	<div class="flex min-w-0 flex-1 flex-col">
		<span class="text-active truncate text-sm leading-tight font-medium">{name}</span>
		{#if tagline}
			<span
				class="text-muted text-xs leading-snug {list
					? 'truncate'
					: 'line-clamp-2 min-h-[2.25em] pt-0.5'}"
			>
				{tagline}
			</span>
		{/if}
	</div>
{/snippet}

{#snippet tagRow(limit: number)}
	{#if tags.length}
		<div class="flex flex-wrap gap-1">
			{#each tags.slice(0, limit) as tag (tag)}
				<span class="bg-shade-2 text-muted rounded px-1.5 py-0.5 text-[10px] leading-4">
					{tag}
				</span>
			{/each}
		</div>
	{/if}
{/snippet}

<!-- `h-full` so the card fills its row: the grids give every row the same
     height, and without this the border would stop at the content. -->
<article
	class="section-tint bg-shade-0 hover:border-shade-4 relative flex h-full overflow-hidden rounded-xl border transition-colors
		{list ? 'items-stretch' : 'flex-col'}"
>
	<!-- The body is a button when it does something and a plain box when it does
	     not, so an inert card is never announced as a control that goes nowhere. -->
	{#if onclick}
		<button
			type="button"
			{onclick}
			aria-label={actionLabel ?? name}
			class="hover:bg-shade-1 focus-visible:outline-accent flex min-w-0 flex-1 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2
				{list ? 'items-center gap-3 px-3 py-2.5' : 'flex-col gap-2.5 p-3.5'}"
		>
			{#if list}
				{@render identity(34)}
			{:else}
				<div class="flex w-full items-start gap-3">{@render identity(40)}</div>
				{@render tagRow(3)}
				{#if meta}
					<span class="text-muted mt-auto pt-0.5 text-[11px] leading-snug">{meta}</span>
				{/if}
			{/if}
		</button>
	{:else}
		<div
			class="flex min-w-0 flex-1 {list
				? 'items-center gap-3 px-3 py-2.5'
				: 'flex-col gap-2.5 p-3.5'}"
		>
			{#if list}
				{@render identity(34)}
			{:else}
				<div class="flex w-full items-start gap-3">{@render identity(40)}</div>
				{@render tagRow(3)}
				{#if meta}
					<span class="text-muted mt-auto pt-0.5 text-[11px] leading-snug">{meta}</span>
				{/if}
			{/if}
		</div>
	{/if}

	{#if !list && badges}
		<!-- Over the corner rather than on a line of its own: a row of labels between
		     the name and the tags took the space the description needed. Floated, it
		     annotates the card rather than being part of what it says.
		     `pointer-events-none` so it never intercepts the body's click. -->
		<div class="pointer-events-none absolute top-2 right-2 flex flex-wrap justify-end gap-1">
			{@render badges()}
		</div>
	{/if}

	{#if list}
		<div class="flex shrink-0 items-center gap-2 py-2 pr-2">
			<div class="hidden items-center gap-2 lg:flex">
				{@render tagRow(2)}
				{#if meta}
					<span class="text-muted text-[11px]">{meta}</span>
				{/if}
			</div>
			{#if badges}
				<div class="hidden items-center gap-1 sm:flex">{@render badges()}</div>
			{/if}
			{#if actions}
				<div class="flex items-center gap-1.5">{@render actions()}</div>
			{/if}
		</div>
	{:else if actions}
		<!-- A footer with its own edge rather than buttons floating at the bottom of the
		     body: it is what makes the card read as a card. -->
		<div class="border-shade-2 mt-auto flex items-stretch gap-1 border-t p-1.5">
			{@render actions()}
		</div>
	{/if}
</article>

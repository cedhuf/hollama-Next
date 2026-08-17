<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { Persona } from '$lib/personas';

	import PersonaAvatar from './PersonaAvatar.svelte';

	/**
	 * One thing in the library, drawn the same way wherever it is shown.
	 *
	 * The Library and the store had a card each, written weeks apart, and the two
	 * had already drifted. Then the playbooks arrived with a card of their own,
	 * bigger, in a grid of its own, and the page stopped reading as one library.
	 *
	 * So there is one card. A persona wears a face; a playbook does not, and that
	 * is the whole of the difference between them here. Everything else — the size,
	 * the clamped description, the tags, the footer, the two layouts — is the same
	 * because there was never a reason for it not to be.
	 *
	 * Three rules, each of them a fault this replaced:
	 *
	 * **Nothing hides.** The edit control used to appear on hover, and the badges
	 * faded out to make room for it, so the card said different things depending on
	 * where the pointer was and said nothing at all on a phone, which has no hover.
	 * Every control is drawn, always, in the footer.
	 *
	 * **Nothing is pushed out.** The body is a fixed set of rows and the tagline is
	 * clamped with its room reserved, so a long description cannot squeeze the tags
	 * off the card and two cards side by side line up.
	 *
	 * **The body does one thing.** Clicking it is a single, stated action and the
	 * others are buttons. A card that opened a conversation when it looked like it
	 * opened a record was answering a question nobody had asked.
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
		<span class="truncate text-sm font-medium leading-tight text-active">{name}</span>
		{#if tagline}
			<span
				class="text-xs leading-snug text-muted {list
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
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[10px] leading-4 text-muted">
					{tag}
				</span>
			{/each}
		</div>
	{/if}
{/snippet}

<!-- `h-full` so the card fills the row it is in. The grids below give every row
     the same height; without this the border would stop at the content and the
     equal rows would be invisible. -->
<article
	class="section-tint relative flex h-full overflow-hidden rounded-xl border bg-shade-0 transition-colors hover:border-shade-4
		{list ? 'items-stretch' : 'flex-col'}"
>
	<!-- The body is a button when it does something and a plain box when it does
	     not, so an inert card is never announced as a control that goes nowhere. -->
	{#if onclick}
		<button
			type="button"
			{onclick}
			aria-label={actionLabel ?? name}
			class="flex min-w-0 flex-1 text-left transition-colors hover:bg-shade-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent
				{list ? 'items-center gap-3 px-3 py-2.5' : 'flex-col gap-2.5 p-3.5'}"
		>
			{#if list}
				{@render identity(34)}
			{:else}
				<div class="flex w-full items-start gap-3">{@render identity(40)}</div>
				{@render tagRow(3)}
				{#if meta}
					<span class="mt-auto pt-0.5 text-[11px] leading-snug text-muted">{meta}</span>
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
					<span class="mt-auto pt-0.5 text-[11px] leading-snug text-muted">{meta}</span>
				{/if}
			{/if}
		</div>
	{/if}

	{#if !list && badges}
		<!-- Over the corner rather than on a line of its own.
		     A row of labels between the name and the tags took the space the
		     description needed and made a card of three short fields look like a
		     card of five. Floated, it annotates the card instead of being part of
		     what the card says. `pointer-events-none` so it never intercepts the
		     click the body is there to receive. -->
		<div class="pointer-events-none absolute right-2 top-2 flex flex-wrap justify-end gap-1">
			{@render badges()}
		</div>
	{/if}

	{#if list}
		<div class="flex shrink-0 items-center gap-2 py-2 pr-2">
			<div class="hidden items-center gap-2 lg:flex">
				{@render tagRow(2)}
				{#if meta}
					<span class="text-[11px] text-muted">{meta}</span>
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
		<!-- A footer with its own edge, rather than buttons floating at the bottom of
		     the body: it is what makes the card read as a card, and it keeps the
		     controls in the same place on every one of them. -->
		<div class="mt-auto flex items-stretch gap-1 border-t border-shade-2 p-1.5">
			{@render actions()}
		</div>
	{/if}
</article>

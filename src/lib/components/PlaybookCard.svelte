<script lang="ts">
	import { ListChecks } from '@lucide/svelte';

	import { personaGlyph } from '$lib/personaGlyphs';
	import type { Playbook } from '$lib/playbooks';

	/**
	 * A playbook, drawn as a procedure rather than as a character.
	 *
	 * Deliberately not the persona card, and the differences are all the same
	 * difference: you are choosing a method, not somebody. So no face — a rounded
	 * square, because a circle is a portrait and this is a thing. The summary is
	 * not decoration under a name, it is the line you decide on, so it gets room
	 * to breathe rather than a truncated caption. And the card says how big the
	 * procedure is, since "six steps" and "forty steps" are different objects and
	 * the name never says which one you are about to switch on.
	 *
	 * It stays in the family: same radius, same borders, same accent as everything
	 * else in the library. A row rather than a tile, because a summary is a
	 * sentence and sentences want width.
	 */
	interface Props {
		playbook: Pick<Playbook, 'name' | 'summary' | 'instructions' | 'color' | 'glyph' | 'tags'>;
		/** Shown top-right: an install button, a badge, whatever the caller needs. */
		trailing?: import('svelte').Snippet;
		onclick?: () => void;
	}

	let { playbook, trailing, onclick }: Props = $props();

	const glyph = $derived(personaGlyph(playbook.glyph));

	const SHELL =
		'group flex w-full items-start gap-3 rounded-xl border border-shade-3 bg-shade-0 p-3.5';

	/**
	 * How long the procedure is, counted the way it is written.
	 *
	 * Headings first, since a playbook with sections is organised by them; failing
	 * that, numbered or bulleted lines. Not characters or words: what somebody
	 * wants to know before switching one on is how much of a procedure it is, and
	 * a paragraph count answers that where a token count does not.
	 */
	const steps = $derived.by(() => {
		const text = playbook.instructions ?? '';
		const headings = (text.match(/^#{1,6}\s+\S/gm) ?? []).length;
		if (headings) return headings;
		return (text.match(/^\s*(?:[-*+]|\d+[.)])\s+\S/gm) ?? []).length;
	});
</script>

{#snippet card()}
	<!-- A rounded square, not a disc: the disc is how a person is drawn here. -->
	<span
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-shade-0"
		style="background-color:{playbook.color};--persona-glyph-cut:{playbook.color}"
	>
		{#if glyph}
			<svg viewBox="0 0 64 64" class="h-6 w-6" role="presentation">
				<!-- Our own table, never a stored value. See `PersonaAvatar`. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html glyph.body}
			</svg>
		{:else}
			{(playbook.name.trim()[0] ?? '?').toUpperCase()}
		{/if}
	</span>

	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<div class="flex min-w-0 items-baseline gap-2">
			<span class="min-w-0 truncate text-sm font-medium text-active">
				{playbook.name.trim() || '—'}
			</span>
			{#if steps}
				<span class="flex shrink-0 items-center gap-1 text-[11px] text-muted">
					<ListChecks class="h-3 w-3" aria-hidden="true" />
					{steps}
				</span>
			{/if}
		</div>

		<!-- The line somebody decides on. Two lines rather than one: a summary that
		     says when to use this cannot always do it in forty characters, and a
		     truncated "use this when you need to…" helps nobody. -->
		{#if playbook.summary}
			<p class="line-clamp-2 text-xs leading-relaxed text-muted">{playbook.summary}</p>
		{/if}

		{#if playbook.tags?.length}
			<div class="mt-0.5 flex flex-wrap gap-1">
				{#each playbook.tags.slice(0, 4) as tag (tag)}
					<span class="rounded-md bg-shade-2 px-1.5 py-0.5 text-[10px] text-muted">{tag}</span>
				{/each}
			</div>
		{/if}
	</div>

	{#if trailing}
		<span class="shrink-0">{@render trailing()}</span>
	{/if}
{/snippet}

<!-- A button when there is something to open, a plain box when there is not.
     Written twice rather than as one dynamic element, which needs a role it has
     no honest value for. -->
{#if onclick}
	<button type="button" {onclick} class="{SHELL} text-left transition-colors hover:border-shade-4">
		{@render card()}
	</button>
{:else}
	<div class={SHELL}>{@render card()}</div>
{/if}

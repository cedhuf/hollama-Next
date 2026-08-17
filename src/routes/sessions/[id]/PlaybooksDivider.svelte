<script lang="ts">
	import { BookOpen, Check, Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import { playbooksStore } from '$lib/localStorage';
	import { personaGlyph } from '$lib/personaGlyphs';

	import NoteDivider from './NoteDivider.svelte';

	/**
	 * The switches for this conversation, drawn where they were asked for.
	 *
	 * Open by default like the context report, and for the same reason: the panel
	 * is the answer to the command. Unlike every other note it reads live — the
	 * library and the conversation are the truth, this only shows them — because a
	 * frozen list of switches is a photograph of a switchboard.
	 *
	 * Rows rather than the library's cards: here you are flipping something on or
	 * off, not choosing among thirty, so the name, the line that says when it
	 * applies, and a tick are the whole of what is needed.
	 */
	interface Props {
		/** The ids switched on for this conversation. */
		active: string[];
		onToggle: (id: string) => void;
	}

	let { active, onToggle }: Props = $props();
</script>

<NoteDivider
	icon={BookOpen}
	label={$LL.playbooksInUse({ count: active.length })}
	testid="playbooks-divider"
	open
	{panel}
/>

{#snippet panel()}
	<div class="flex flex-col gap-2 rounded-lg border border-shade-3 bg-shade-1 px-3 py-2.5">
		{#if $playbooksStore.length}
			<div class="flex flex-col">
				{#each $playbooksStore as playbook (playbook.id)}
					{@const on = active.includes(playbook.id)}
					{@const glyph = personaGlyph(playbook.glyph)}
					<button
						type="button"
						onclick={() => onToggle(playbook.id)}
						aria-pressed={on}
						class="flex items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-shade-2"
					>
						<span
							class="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-shade-0 {on
								? ''
								: 'opacity-40'}"
							style="background-color:{playbook.color};--persona-glyph-cut:{playbook.color}"
						>
							{#if glyph}
								<svg viewBox="0 0 64 64" class="h-4 w-4" role="presentation">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html glyph.body}
								</svg>
							{:else}
								{(playbook.name.trim()[0] ?? '?').toUpperCase()}
							{/if}
						</span>

						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-xs font-medium {on ? 'text-active' : 'text-muted'}">
								{playbook.name.trim() || '—'}
							</span>
							{#if playbook.summary}
								<span class="line-clamp-1 text-[11px] text-muted">{playbook.summary}</span>
							{/if}
						</span>

						{#if on}
							<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
						{/if}
					</button>
				{/each}
			</div>
		{:else}
			<p class="px-1.5 py-1 text-xs text-muted">{$LL.playbooksEmpty()}</p>
		{/if}

		<a
			href={resolve('/library')}
			class="flex items-center gap-1.5 border-t border-shade-3 px-1.5 pt-2 text-xs text-muted transition-colors hover:text-active"
		>
			<Plus class="h-3.5 w-3.5" />
			{$LL.playbooksManage()}
		</a>
	</div>
{/snippet}

<script lang="ts">
	import { ChevronDown, ChevronUp, Eraser, Undo2 } from '@lucide/svelte';
	import { quadInOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import type { Message } from '$lib/sessions';
	import { formatTimestampToNow } from '$lib/utils';

	/**
	 * Where a conversation was set aside.
	 *
	 * The sibling of the compaction divider, and it says the opposite thing:
	 * compaction hands the model a summary of what came before, clearing hands it
	 * nothing at all. Both are boundaries rather than deletions, so both fold back.
	 *
	 * Unlike compaction, what is above this does not stay on screen. A
	 * conversation you have deliberately finished with is not something to scroll
	 * past to reach the one you are having, so it lives in here.
	 *
	 * Which makes the unfolded state the whole design problem: two hundred
	 * messages poured out in sequence is not "readable again", it is the wall you
	 * cleared them to get away from. So this shows an index, not a transcript: one
	 * line per message, in a box of its own with its own scrollbar, and any single
	 * one opens where it sits.
	 */
	interface Props {
		message: Message;
		/** What is behind the line, oldest first. */
		cleared: Message[];
		onUndo?: () => void;
	}

	let { message, cleared, onUndo }: Props = $props();

	let expanded = $state(false);
	/** Which rows are open, by their index in `cleared`. */
	const opened = new SvelteSet<number>();
	/**
	 * How many rows are drawn before the "show all".
	 *
	 * A ceiling rather than a scrollbar alone: a hundred rows all rendered is a
	 * hundred rows the browser lays out for a panel most people open, glance at,
	 * and shut.
	 */
	const PAGE = 20;
	let showAll = $state(false);

	const info = $derived(message.cleared);
	const when = $derived(info ? formatTimestampToNow(info.generatedAt) : '');
	const shown = $derived(showAll ? cleared : cleared.slice(-PAGE));

	function toggleRow(index: number) {
		if (opened.has(index)) opened.delete(index);
		else opened.add(index);
	}

	function label(role: string): string {
		if (role === 'user') return $LL.you();
		if (role === 'assistant') return $LL.assistant();
		return $LL.system();
	}
</script>

<div class="my-4 flex flex-col gap-2" data-testid="cleared-divider">
	<div class="flex items-center gap-3">
		<div class="rule h-px flex-1"></div>

		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="flex items-center gap-2 rounded-full border border-shade-3 px-3 py-1 text-xs text-muted transition-colors hover:border-shade-4 hover:text-active"
		>
			<Eraser class="h-3.5 w-3.5 shrink-0" />
			<span>{$LL.contextCleared({ count: info?.replacedCount ?? cleared.length })}</span>
			<span class="opacity-60">· {when}</span>
			{#if expanded}
				<ChevronUp class="h-3.5 w-3.5 shrink-0" />
			{:else}
				<ChevronDown class="h-3.5 w-3.5 shrink-0" />
			{/if}
		</button>

		<div class="rule h-px flex-1"></div>
	</div>

	{#if expanded}
		<div
			class="rounded-lg border border-shade-3 bg-shade-1 px-3 py-2.5"
			transition:slide={{ duration: 200, easing: quadInOut }}
		>
			<div class="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
				<span class="min-w-0 text-xs leading-relaxed text-muted">{$LL.clearedExplain()}</span>

				{#if onUndo}
					<button
						type="button"
						onclick={onUndo}
						class="flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-active sm:ml-auto"
						title={$LL.undoClearHelp()}
					>
						<Undo2 class="h-3.5 w-3.5" />
						{$LL.undoClear()}
					</button>
				{/if}
			</div>

			<!-- Its own scrollport, and a short one: this is an index you glance down,
			     not a place to read a conversation. The conversation is what the page
			     itself is for, and restoring puts it back there. -->
			<div class="max-h-[45vh] overflow-y-auto rounded-md border border-shade-2 bg-shade-0">
				{#if !showAll && cleared.length > PAGE}
					<button
						type="button"
						onclick={() => (showAll = true)}
						class="w-full border-b border-shade-2 px-3 py-2 text-center text-[11px] text-muted transition-colors hover:bg-shade-1 hover:text-active"
					>
						{$LL.clearedShowAll({ count: cleared.length })}
					</button>
				{/if}

				{#each shown as entry, index (index)}
					{@const at = showAll ? index : cleared.length - shown.length + index}
					<button
						type="button"
						onclick={() => toggleRow(at)}
						class="flex w-full gap-2 border-b border-shade-2 px-3 py-1.5 text-left last:border-b-0 transition-colors hover:bg-shade-1"
					>
						<span
							class="w-14 shrink-0 pt-px text-[10px] font-medium uppercase tracking-wide text-muted"
						>
							{label(entry.role)}
						</span>
						<span
							class="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-snug text-active {opened.has(
								at
							)
								? ''
								: 'line-clamp-1'}"
						>
							{entry.content.trim() || '—'}
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.rule {
		background-color: var(--color-shade-3);
	}
</style>

<script lang="ts">
	import { Eraser, Undo2 } from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import LL from '$i18n/i18n-svelte';
	import type { ClearedNote } from '$lib/chat/notes';
	import type { Message } from '$lib/sessions';
	import { formatTimestampToNow } from '$lib/utils';

	import NoteDivider from './NoteDivider.svelte';

	/**
	 * Where a conversation was set aside.
	 *
	 * The sibling of the compaction divider, saying the opposite: compaction hands
	 * the model a summary, clearing hands it nothing. Both are boundaries rather
	 * than deletions, so both fold back.
	 *
	 * Unlike compaction, what is above this does not stay on screen: a conversation
	 * you have finished with is not something to scroll past to reach the one you
	 * are having.
	 *
	 * Which makes the unfolded state the design problem, since two hundred messages
	 * poured out is the wall you cleared them to get away from. So this shows an
	 * index: one line per message, in its own scrollport, each opening where it sits.
	 */
	interface Props {
		note: ClearedNote;
		/** What is behind the line, oldest first. */
		cleared: Message[];
		onUndo?: () => void;
	}

	let { note, cleared, onUndo }: Props = $props();

	/** Which rows are open, by their index in `cleared`. */
	const opened = new SvelteSet<number>();
	/** A ceiling rather than a scrollbar alone: a hundred rows all rendered is a hundred the browser lays out for a panel most people open, glance at, and shut. */
	const PAGE = 20;
	let showAll = $state(false);

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

<NoteDivider
	icon={Eraser}
	label={$LL.contextCleared({ count: note.replacedCount ?? cleared.length })}
	when={formatTimestampToNow(note.generatedAt)}
	testid="cleared-divider"
	{panel}
/>

{#snippet panel()}
	<div class="border-shade-3 bg-shade-1 rounded-lg border px-3 py-2.5">
		<div class="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
			<span class="text-muted min-w-0 text-xs leading-relaxed">{$LL.clearedExplain()}</span>

			{#if onUndo}
				<button
					type="button"
					onclick={onUndo}
					class="text-muted hover:text-active flex shrink-0 items-center gap-1.5 text-xs transition-colors sm:ml-auto"
					title={$LL.undoClearHelp()}
				>
					<Undo2 class="h-3.5 w-3.5" />
					{$LL.undoClear()}
				</button>
			{/if}
		</div>

		<!-- Its own scrollport, and a short one: an index you glance down, not a place
		     to read a conversation. Restoring puts it back in the page. -->
		<div class="border-shade-2 bg-shade-0 max-h-[45vh] overflow-y-auto rounded-md border">
			{#if !showAll && cleared.length > PAGE}
				<button
					type="button"
					onclick={() => (showAll = true)}
					class="border-shade-2 text-muted hover:bg-shade-1 hover:text-active w-full border-b px-3 py-2 text-center text-[11px] transition-colors"
				>
					{$LL.clearedShowAll({ count: cleared.length })}
				</button>
			{/if}

			{#each shown as entry, index (index)}
				{@const at = showAll ? index : cleared.length - shown.length + index}
				<button
					type="button"
					onclick={() => toggleRow(at)}
					class="border-shade-2 hover:bg-shade-1 flex w-full gap-2 border-b px-3 py-1.5 text-left transition-colors last:border-b-0"
				>
					<span
						class="text-muted w-14 shrink-0 pt-px text-[10px] font-medium tracking-wide uppercase"
					>
						{label(entry.role)}
					</span>
					<span
						class="text-active min-w-0 flex-1 text-xs leading-snug whitespace-pre-wrap {opened.has(
							at
						)
							? ''
							: 'line-clamp-1'}"
					>
						{entry.content.trim() || $LL.none()}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/snippet}

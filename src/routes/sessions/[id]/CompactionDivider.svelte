<script module lang="ts">
	import { quadInOut } from 'svelte/easing';
	import { crossfade } from 'svelte/transition';

	/**
	 * Shared between the pending divider and the real one, so the pill that waits
	 * turns into the pill that reports. Both sit at the same place in the list, so
	 * the eye sees one element filling in.
	 *
	 * The fallback is instant: with no counterpart, this is either a session being
	 * opened or a compaction that was cancelled, and neither wants an animation.
	 */
	const [send, receive] = crossfade({
		duration: 260,
		easing: quadInOut,
		fallback: () => ({ duration: 0 })
	});
	const CROSSFADE_KEY = 'compaction-pill';
</script>

<script lang="ts">
	import { FoldVertical, TrendingDown, Undo2, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { formatTokens, type CompactionSavings } from '$lib/chat/context';
	import type { CompactionNote } from '$lib/chat/notes';
	import Markdown from '$lib/components/Markdown.svelte';
	import { formatTimestampToNow } from '$lib/utils';

	import NoteDivider from './NoteDivider.svelte';

	/**
	 * Where a compaction happened: everything above is still on screen, but the
	 * model now reads the summary instead. Foldable because it is normally not what
	 * you came to read, and undoable because compaction only moves a boundary.
	 *
	 * The same component draws the wait, at the exact spot the pill will end up. A
	 * toast put the news in a corner, away from the thing it was about. That pill is
	 * why this supplies its own shell: there is no note yet and nothing to unfold.
	 */
	interface Props {
		note?: CompactionNote;
		/** The summary itself, which is the message's content. */
		summary?: string;
		onUndo?: () => void;
		/** Draw the waiting state instead: no summary yet, and an out. */
		pending?: boolean;
		onCancel?: () => void;
		/** What this compaction bought, shown once the summary is unfolded. */
		savings?: CompactionSavings;
	}

	let { note, summary, onUndo, pending = false, onCancel, savings }: Props = $props();
</script>

<NoteDivider
	icon={FoldVertical}
	label={pending ? $LL.compacting() : $LL.contextCompacted({ count: note?.replacedCount ?? 0 })}
	when={note ? formatTimestampToNow(note.generatedAt) : undefined}
	testid={pending ? 'compaction-pending' : 'compaction-divider'}
	{pending}
	pill={pending ? waiting : undefined}
	pillIn={(node) => receive(node, { key: CROSSFADE_KEY })}
	panel={!pending && note ? panel : undefined}
/>

{#snippet waiting()}
	<div
		out:send={{ key: CROSSFADE_KEY }}
		class="border-shade-3 text-muted flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
		role="status"
	>
		<span class="folding inline-flex shrink-0">
			<FoldVertical class="h-3.5 w-3.5" />
		</span>
		<span>{$LL.compacting()}</span>
		{#if onCancel}
			<button
				type="button"
				onclick={onCancel}
				aria-label={$LL.cancel()}
				title={$LL.cancel()}
				class="hover:text-active -mr-1 rounded-full p-0.5 transition-colors"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>
{/snippet}

{#snippet panel()}
	<!-- `markdown--aside` steps the summary down to the size reasoning is shown at:
	     it is background to the conversation, not a turn in it. -->
	<div class="markdown--aside border-shade-3 bg-shade-1 rounded-lg border px-3 py-2.5">
		<!-- Three things that each want the full width on a phone. Side by side they
		     truncated the first to nothing, so below `sm` they stack. -->
		<div class="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
			<span class="text-muted min-w-0 truncate text-xs">
				{note?.automatic ? $LL.compactedAutomatically() : $LL.compactedManually()}
				{#if note?.model}· {note.model}{/if}
			</span>

			<div class="flex items-center gap-2 sm:ml-auto">
				{#if savings && savings.saved > 0}
					<!-- The point of the whole operation, on the right of its own header: a figure
					     to glance at, not a banner. Estimated like every token figure, hence the
					     tilde, with the before and after on hover. -->
					<span
						class="border-shade-3 bg-shade-0 text-positive flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm"
						title="{$LL.tokensFreedDetail({
							before: formatTokens(savings.before),
							after: formatTokens(savings.after)
						})} {$LL.contextEstimateNote()}"
					>
						<TrendingDown class="h-3 w-3 shrink-0" aria-hidden="true" />
						<span class="tabular-nums">
							{$LL.tokensFreed({ tokens: formatTokens(savings.saved) })}
						</span>
						<span class="text-muted tabular-nums">{Math.round(savings.ratio * 100)}%</span>
					</span>
				{/if}

				{#if onUndo}
					<button
						type="button"
						onclick={onUndo}
						class="text-muted hover:text-active flex shrink-0 items-center gap-1.5 text-xs transition-colors"
						title={$LL.undoCompactionHelp()}
					>
						<Undo2 class="h-3.5 w-3.5" />
						{$LL.undoCompaction()}
					</button>
				{/if}
			</div>
		</div>

		{#if note?.instruction}
			<!-- What was asked for, above what it produced: a summary written to an
			     instruction is not the same object as one written to the default rules, and
			     reading it without knowing that is how you conclude it lost the plot. -->
			<p class="border-shade-3 text-muted mb-2 border-l-2 pl-2.5 text-xs leading-relaxed italic">
				{note.instruction}
			</p>
		{/if}

		<Markdown markdown={summary ?? ''} />
	</div>
{/snippet}

<style>
	/* The icon is two arrows meeting; folding it is the operation itself. */
	.folding {
		animation: compaction-fold 1.6s ease-in-out infinite;
	}

	@keyframes compaction-fold {
		0%,
		100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(0.7);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.folding {
			animation: none;
		}
	}
</style>

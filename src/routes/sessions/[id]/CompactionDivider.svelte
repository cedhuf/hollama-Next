<script module lang="ts">
	import { quadInOut } from 'svelte/easing';
	import { crossfade } from 'svelte/transition';

	/**
	 * Shared between the pending divider and the real one, so the pill that waits
	 * turns into the pill that reports instead of one blinking out and another
	 * blinking in. Both sit at the same place in the list (the marker is appended
	 * last), so what the eye sees is a single element filling in.
	 *
	 * The fallback is deliberately instant: with no counterpart to pair with, this
	 * is either a session being opened (every past divider would fade in for no
	 * reason) or a compaction that was cancelled, and neither wants an animation.
	 */
	const [send, receive] = crossfade({
		duration: 260,
		easing: quadInOut,
		fallback: () => ({ duration: 0 })
	});
	const CROSSFADE_KEY = 'compaction-pill';
</script>

<script lang="ts">
	import { ChevronDown, ChevronUp, FoldVertical, TrendingDown, Undo2, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { formatTokens, type CompactionSavings } from '$lib/chat/context';
	import Markdown from '$lib/components/Markdown.svelte';
	import type { Message } from '$lib/sessions';
	import { formatTimestampToNow } from '$lib/utils';

	/**
	 * Where a compaction happened: everything above is still on screen, but the
	 * model now reads the summary instead.
	 *
	 * A rule rather than a bubble — it marks a boundary in the conversation, it is
	 * not a turn in it. The summary is foldable because it is normally not what
	 * you came to read, and undoable because compaction only moves this boundary:
	 * dropping the marker hands the model the full history back.
	 *
	 * The same component draws the wait: while the summary is being written the
	 * pill is already there, at the exact spot it will end up, saying so. A toast
	 * put the news in a corner of the screen, away from the thing it was about.
	 */
	interface Props {
		message?: Message;
		onUndo?: () => void;
		/** Draw the waiting state instead: no summary yet, and an out. */
		pending?: boolean;
		onCancel?: () => void;
		/** What this compaction bought, shown once the summary is unfolded. */
		savings?: CompactionSavings;
	}

	let { message, onUndo, pending = false, onCancel, savings }: Props = $props();

	let expanded = $state(false);

	const info = $derived(message?.compaction);
	const when = $derived(info ? formatTimestampToNow(info.generatedAt) : '');
</script>

<div
	class="my-4 flex flex-col gap-2"
	data-testid={pending ? 'compaction-pending' : 'compaction-divider'}
>
	<div class="flex items-center gap-3">
		<div class="rule h-px flex-1" class:rule--pending={pending} class:rule--reverse={pending}></div>

		{#if pending}
			<div
				out:send={{ key: CROSSFADE_KEY }}
				class="flex items-center gap-2 rounded-full border border-shade-3 px-3 py-1 text-xs text-muted"
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
						class="-mr-1 rounded-full p-0.5 transition-colors hover:text-active"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		{:else if info}
			<button
				type="button"
				in:receive={{ key: CROSSFADE_KEY }}
				onclick={() => (expanded = !expanded)}
				aria-expanded={expanded}
				class="flex items-center gap-2 rounded-full border border-shade-3 px-3 py-1 text-xs text-muted transition-colors hover:border-shade-4 hover:text-active"
			>
				<FoldVertical class="h-3.5 w-3.5 shrink-0" />
				<span>{$LL.contextCompacted({ count: info.replacedCount })}</span>
				<span class="opacity-60">· {when}</span>
				{#if expanded}
					<ChevronUp class="h-3.5 w-3.5 shrink-0" />
				{:else}
					<ChevronDown class="h-3.5 w-3.5 shrink-0" />
				{/if}
			</button>
		{/if}

		<div class="rule h-px flex-1" class:rule--pending={pending}></div>
	</div>

	{#if expanded && message && info}
		<!-- `markdown--aside` steps the summary down to the size reasoning is shown
		     at: it is background to the conversation, not a turn in it, and it was
		     reading as loudly as the answers around it. -->
		<div
			class="markdown--aside rounded-lg border border-shade-3 bg-shade-1 px-3 py-2.5"
			transition:slide={{ duration: 200, easing: quadInOut }}
		>
			<div class="mb-2 flex items-center justify-between gap-2">
				<span class="min-w-0 truncate text-xs text-muted">
					{info.automatic ? $LL.compactedAutomatically() : $LL.compactedManually()}
					{#if info.model}· {info.model}{/if}
				</span>

				{#if savings && savings.saved > 0}
					<!-- The point of the whole operation, on the right of its own header: a
					     figure to glance at, not a banner across the summary it introduces.
					     Estimated like every token figure in the app, hence the tilde, with
					     the before and after on hover rather than spelled out here. -->
					<span
						class="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-shade-3 bg-shade-0 px-2 py-0.5 text-[11px] font-medium text-positive shadow-sm"
						title="{$LL.tokensFreedDetail({
							before: formatTokens(savings.before),
							after: formatTokens(savings.after)
						})} {$LL.contextEstimateNote()}"
					>
						<TrendingDown class="h-3 w-3 shrink-0" aria-hidden="true" />
						<span class="tabular-nums">
							{$LL.tokensFreed({ tokens: formatTokens(savings.saved) })}
						</span>
						<span class="tabular-nums text-muted">{Math.round(savings.ratio * 100)}%</span>
					</span>
				{/if}

				{#if onUndo}
					<button
						type="button"
						onclick={onUndo}
						class="flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
						title={$LL.undoCompactionHelp()}
					>
						<Undo2 class="h-3.5 w-3.5" />
						{$LL.undoCompaction()}
					</button>
				{/if}
			</div>

			<Markdown markdown={message.content} />
		</div>
	{/if}
</div>

<style>
	.rule {
		background-color: var(--color-shade-3);
	}

	/* While the summary is being written, the rules carry a highlight that travels
	   outwards from the pill. Slow and low-contrast on purpose: it says "still
	   working" from the corner of the eye without competing with the text above. */
	.rule--pending {
		background-image: linear-gradient(
			90deg,
			transparent 0%,
			var(--color-accent) 50%,
			transparent 100%
		);
		background-size: 40% 100%;
		background-repeat: no-repeat;
		animation: compaction-sweep 1.8s ease-in-out infinite;
		opacity: 0.7;
	}

	/* The rule on the left runs the other way, so the highlight leaves the pill in
	   both directions rather than crossing the whole row like a progress bar. */
	.rule--reverse {
		animation-direction: reverse;
	}

	@keyframes compaction-sweep {
		from {
			background-position: -40% 0;
		}
		to {
			background-position: 140% 0;
		}
	}

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
		.rule--pending,
		.folding {
			animation: none;
		}
	}
</style>

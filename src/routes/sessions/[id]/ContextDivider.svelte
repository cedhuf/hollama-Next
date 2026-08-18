<script lang="ts">
	import { Gauge } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { formatTokens } from '$lib/chat/context';
	import type { ContextNote } from '$lib/chat/notes';
	import { formatTimestampToNow } from '$lib/utils';

	import NoteDivider from './NoteDivider.svelte';

	/**
	 * What the conversation was carrying when someone asked.
	 *
	 * Open on arrival, and open again whenever it is read: unlike the other two
	 * notes, the panel *is* the note. A compaction pill says what happened and
	 * hides the summary because the summary is not why you are here; this one has
	 * nothing to say from the outside except a total, and folding it by default
	 * would mean the command answers with a closed box.
	 *
	 * Every figure is an estimate, which the footer says once rather than a tilde
	 * on each line.
	 */
	interface Props {
		note: ContextNote;
	}

	let { note }: Props = $props();

	const percent = $derived(note.limit > 0 ? Math.round((note.tokens / note.limit) * 100) : 0);

	/** The parts, as shares of the whole, for the bar. Absent ones are not drawn. */
	const parts = $derived(
		[
			{ key: 'system', tokens: note.systemTokens, class: 'bg-accent' },
			{ key: 'memory', tokens: note.memoryTokens ?? 0, class: 'bg-accent/80' },
			{ key: 'messages', tokens: note.messageTokens, class: 'bg-accent/60' },
			{ key: 'sources', tokens: note.sourceTokens, class: 'bg-accent/30' }
		].filter((part) => part.tokens > 0)
	);

	const label = $derived(
		(key: string) =>
			({
				system: $LL.contextPartSystem(),
				memory: $LL.contextPartMemory(),
				messages: $LL.contextPartMessages(),
				sources: $LL.contextPartSources()
			})[key] ?? key
	);
</script>

<NoteDivider
	icon={Gauge}
	label={$LL.contextReport({ tokens: formatTokens(note.tokens), percent })}
	when={formatTimestampToNow(note.generatedAt)}
	testid="context-divider"
	open
	{panel}
/>

{#snippet panel()}
	<div class="flex flex-col gap-2.5 rounded-lg border border-shade-3 bg-shade-1 px-3 py-2.5">
		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-2 text-xs">
				<span class="text-active">
					{$LL.contextTokensOfLimit({
						tokens: note.tokens.toLocaleString(),
						limit: note.limit.toLocaleString(),
						percent
					})}
				</span>
				<span class="shrink-0 text-[11px] text-muted">
					{note.limitSource === 'model'
						? $LL.contextLimitFromModel()
						: $LL.contextLimitFromThreshold()}
				</span>
			</div>

			<!-- One bar for the whole request, cut into what it is made of. The three
			     shares are of the limit, not of each other, so the empty end of the bar
			     is the room left. -->
			<div class="flex h-1.5 overflow-hidden rounded-full bg-shade-3">
				{#each parts as part (part.key)}
					<div
						class={part.class}
						style="width:{note.limit > 0 ? (part.tokens / note.limit) * 100 : 0}%"
					></div>
				{/each}
			</div>
		</div>

		<dl class="flex flex-col gap-1 text-xs">
			{#each parts as part (part.key)}
				<div class="flex items-baseline gap-2">
					<span class="h-2 w-2 shrink-0 rounded-full {part.class}"></span>
					<dt class="min-w-0 flex-1 truncate text-muted">{label(part.key)}</dt>
					<dd class="shrink-0 tabular-nums text-active">{formatTokens(part.tokens)}</dd>
				</div>
			{/each}
		</dl>

		<div class="flex flex-col gap-1 border-t border-shade-3 pt-2 text-xs text-muted">
			<p>{$LL.contextMessagesOfTotal({ count: note.messageCount, total: note.totalCount })}</p>
			{#if note.model}
				<p class="truncate">{note.model}</p>
			{/if}
			{#if note.heaviest}
				<!-- The one message that weighs the most, because a context that filled
				     up unexpectedly is nearly always one file somebody pasted, and a
				     total alone gives no way to find it. -->
				<p class="flex items-baseline gap-2">
					<span class="min-w-0 flex-1 truncate">
						{$LL.contextHeaviest()}
						<span class="text-active">{note.heaviest.preview}</span>
					</span>
					<span class="shrink-0 tabular-nums">{formatTokens(note.heaviest.tokens)}</span>
				</p>
			{/if}
		</div>

		<p class="text-[11px] text-muted">{$LL.contextEstimateNote()}</p>
	</div>
{/snippet}

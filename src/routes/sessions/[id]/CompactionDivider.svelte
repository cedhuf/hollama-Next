<script lang="ts">
	import { ChevronDown, ChevronUp, FoldVertical, Undo2 } from '@lucide/svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
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
	 */
	interface Props {
		message: Message;
		onUndo: () => void;
	}

	let { message, onUndo }: Props = $props();

	let expanded = $state(false);

	const info = $derived(message.compaction!);
	const when = $derived(formatTimestampToNow(info.generatedAt));
</script>

<div class="my-4 flex flex-col gap-2" data-testid="compaction-divider">
	<div class="flex items-center gap-3">
		<div class="h-px flex-1 bg-shade-3"></div>

		<button
			type="button"
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

		<div class="h-px flex-1 bg-shade-3"></div>
	</div>

	{#if expanded}
		<div
			class="rounded-lg border border-shade-3 bg-shade-1 p-3"
			transition:slide={{ duration: 200, easing: quadInOut }}
		>
			<div class="mb-2 flex items-center justify-between gap-2">
				<span class="text-xs text-muted">
					{info.automatic ? $LL.compactedAutomatically() : $LL.compactedManually()}
					{#if info.model}· {info.model}{/if}
				</span>
				<button
					type="button"
					onclick={onUndo}
					class="flex shrink-0 items-center gap-1.5 text-xs text-muted transition-colors hover:text-active"
					title={$LL.undoCompactionHelp()}
				>
					<Undo2 class="h-3.5 w-3.5" />
					{$LL.undoCompaction()}
				</button>
			</div>
			<Markdown markdown={message.content} />
		</div>
	{/if}
</div>

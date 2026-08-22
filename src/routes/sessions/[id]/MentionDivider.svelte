<script lang="ts">
	import { AtSign, CornerDownLeft, Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import type { MentionNote } from '$lib/chat/notes';
	import { formatTimestampToNow } from '$lib/utils';

	import NoteDivider from './NoteDivider.svelte';

	/**
	 * Where this persona was called away, and what it said there.
	 *
	 * Folded by default, unlike the context report: it is an aside about somewhere
	 * else, and a conversation with twenty of these unfolded would be twenty other
	 * conversations pasted into this one. The pill says who wanted it and when,
	 * which is enough to decide whether to look.
	 *
	 * The exchange sits behind a wall of quotation on purpose. It is not a turn in
	 * this conversation and the model has not read it, so it must not be dressed up
	 * as one of the bubbles around it. Adding it is a deliberate act, and once it
	 * is done the offer is replaced by a sentence saying so.
	 */
	interface Props {
		note: MentionNote;
		onAdd?: () => void;
	}

	let { note, onAdd }: Props = $props();
</script>

<NoteDivider
	icon={AtSign}
	label={$LL.mentionCalledInto({ title: note.title || $LL.newSession() })}
	when={formatTimestampToNow(note.generatedAt)}
	testid="mention-divider"
	{panel}
/>

{#snippet panel()}
	<div class="border-shade-3 bg-shade-1 flex flex-col gap-2 rounded-lg border px-3 py-2.5">
		<div class="border-shade-3 flex flex-col gap-2 border-l-2 pl-3">
			<p class="text-muted text-xs leading-relaxed whitespace-pre-wrap">{note.asked}</p>
			<p class="text-active flex gap-2 text-xs leading-relaxed whitespace-pre-wrap">
				<CornerDownLeft class="text-muted mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span class="min-w-0">{note.answered}</span>
			</p>
		</div>

		<div class="border-shade-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2">
			<a
				href={resolve('/sessions/[id]', { id: note.sessionId })}
				class="text-muted hover:text-active text-xs transition-colors"
			>
				{$LL.mentionOpenConversation()}
			</a>

			{#if note.addedAt}
				<span class="text-muted text-xs sm:ml-auto">{$LL.mentionAlreadyAdded()}</span>
			{:else if onAdd}
				<button
					type="button"
					onclick={onAdd}
					class="text-muted hover:text-active flex items-center gap-1.5 text-xs transition-colors sm:ml-auto"
					title={$LL.mentionAddHelp()}
				>
					<Plus class="h-3.5 w-3.5" />
					{$LL.mentionAdd()}
				</button>
			{/if}
		</div>
	</div>
{/snippet}

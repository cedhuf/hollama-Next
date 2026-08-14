<script lang="ts">
	import { Brain, FileText, Library, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { attachmentLabel, type Attachment } from '$lib/promptAttachments';

	/**
	 * One piece of context waiting to be sent, as a pill.
	 *
	 * Every kind gets the same shape, so a row of them reads as one list rather
	 * than as a stack of unrelated widgets: a mark on the left saying what it is,
	 * its name, and the way to take it back off. What differs between kinds is
	 * only that mark, which is the one thing worth telling apart at a glance.
	 *
	 * An image shows itself there instead of an icon. It is the most useful
	 * possible thumbnail, and it costs nothing: the data URL is already loaded.
	 */
	interface Props {
		attachment: Attachment;
		/** Absent on a message already sent: there is nothing left to take back. */
		onRemove?: () => void;
		/**
		 * Offered on a document already sent: keep its text in the Library, where it
		 * can be attached to another conversation or to a persona. Absent everywhere
		 * else, since a file still sitting in the composer has not been read into
		 * anything yet.
		 */
		onSave?: () => void;
	}

	let { attachment, onRemove, onSave }: Props = $props();
</script>

<span
	class="attachment group flex max-w-full items-center gap-1.5 rounded-full border border-shade-3 bg-shade-0 py-1 pl-1.5 pr-1 text-xs shadow-sm transition-colors hover:border-shade-4"
	data-testid="attachment-pill"
>
	{#if attachment.type === 'image'}
		<img
			src={attachment.dataUrl}
			alt={attachment.name}
			class="h-5 w-5 shrink-0 rounded-full object-cover"
			data-testid="attachment-image-preview"
		/>
	{:else}
		<span
			class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-shade-2 text-muted"
			aria-hidden="true"
		>
			{#if attachment.type === 'document'}
				<FileText class="h-3 w-3" />
			{:else}
				<Brain class="h-3 w-3" />
			{/if}
		</span>
	{/if}

	<span class="truncate" data-testid="attachment-name">{attachmentLabel(attachment)}</span>

	{#if attachment.type === 'document' && attachment.pages}
		<!-- The one number worth carrying: how much of the context this will take is
		     the question people actually have about an attached document. -->
		<span class="shrink-0 tabular-nums text-muted">
			{$LL.pageCount({ count: attachment.pages })}
		</span>
	{/if}

	{#if onSave}
		<button
			type="button"
			onclick={onSave}
			aria-label={$LL.keepInLibrary()}
			title={$LL.keepInLibrary()}
			data-testid="attachment-save"
			class="shrink-0 rounded-full p-0.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
		>
			<Library class="h-3.5 w-3.5" />
		</button>
	{/if}

	{#if onRemove}
		<button
			type="button"
			onclick={onRemove}
			aria-label={$LL.remove()}
			title={$LL.remove()}
			data-testid="attachment-delete"
			class="shrink-0 rounded-full p-0.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
		>
			<X class="h-3.5 w-3.5" />
		</button>
	{:else if !onSave}
		<!-- Keeps the pill's right side even with the removable ones beside it. -->
		<span class="w-0.5" aria-hidden="true"></span>
	{/if}
</span>

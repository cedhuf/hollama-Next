<script lang="ts">
	import { Braces, Brain, FileText, Pin, PinOff, Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { copyText } from '$lib/clipboard';
	import { repository } from '$lib/data';
	import { serializeSession, sessionAsKnowledgeDraft, type ExportFormat } from '$lib/sessionExport';
	import { toggleSessionPin } from '$lib/sessions';
	import { openKnowledge } from '$lib/stores/modal';

	import MenuItem from './MenuItem.svelte';

	/**
	 * What a conversation offers, wherever it is shown.
	 *
	 * The full-width list and the collapsed rail draw a conversation very
	 * differently, but the same things can be done to it, and they were written
	 * twice for exactly as long as it took someone to notice they had drifted.
	 */
	interface Props {
		id: string;
		pinned?: boolean;
		/**
		 * Where deletion is offered, since it is the one entry that needs room the
		 * caller may not have: it asks before it acts, on the row itself.
		 */
		onDelete?: () => void;
	}

	let { id, pinned = false, onDelete }: Props = $props();

	/**
	 * Offer the transcript, don't file it.
	 *
	 * The editor opens with the conversation already in it, so the collection can
	 * be named and trimmed before it exists. Writing it straight to the library
	 * left people with an item called after the conversation, holding everything
	 * that was ever said in it, which is rarely what they wanted to keep.
	 */
	async function saveAsKnowledge() {
		const draft = await sessionAsKnowledgeDraft(id);
		if (draft) openKnowledge(draft);
	}

	async function copyAs(format: ExportFormat) {
		const session = await repository.loadSession(id);
		if (session) await copyText(serializeSession(session, format));
	}
</script>

<MenuItem icon={pinned ? PinOff : Pin} onclick={() => void toggleSessionPin(id)}>
	{pinned ? $LL.unpin() : $LL.pin()}
</MenuItem>
<MenuItem icon={Brain} onclick={() => void saveAsKnowledge()}>
	{$LL.saveAsKnowledge()}
</MenuItem>

<div class="my-1 h-px bg-shade-3" role="none"></div>

<!-- The same two formats the conversation's own copy menu offers, so what "copy
     this conversation" produces does not depend on where you asked. -->
<MenuItem icon={FileText} onclick={() => void copyAs('markdown')}>
	{$LL.copyAsMarkdown()}
</MenuItem>
<MenuItem icon={Braces} onclick={() => void copyAs('json')}>
	{$LL.copyAsJson()}
</MenuItem>

{#if onDelete}
	<div class="my-1 h-px bg-shade-3" role="none"></div>

	<!-- Asks rather than does: the confirmation appears on the row, in the same
	     place it appears when the quick buttons are on. -->
	<MenuItem icon={Trash2} danger onclick={onDelete}>
		{$LL.deleteSession()}
	</MenuItem>
{/if}

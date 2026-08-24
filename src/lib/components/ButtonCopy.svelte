<script lang="ts">
	import { Files } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { toast } from '$lib/toast';

	import Button from './Button.svelte';

	export let content: string;
	/** Smaller footprint, for the row of actions under a message. */
	export let compact = false;

	function copyContent() {
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(content);
		} else {
			// HACK
			// This is a workaround to copy text content on HTTP connections.
			// https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
			const textArea = document.createElement('textarea');
			textArea.value = content;
			document.body.appendChild(textArea);
			textArea.select();
			try {
				document.execCommand('copy');
				toast.warning($LL.copiedNotPrivate());
			} catch (e) {
				console.error(e);
				toast.error($LL.notCopiedNotPrivate());
			}
			document.body.removeChild(textArea);
		}
	}
</script>

<div class="copy-button">
	<Button title={$LL.copy()} variant={compact ? 'icon-sm' : 'icon'} onclick={copyContent}>
		<Files class={compact ? 'h-3.5 w-3.5' : 'base-icon'} />
	</Button>
</div>

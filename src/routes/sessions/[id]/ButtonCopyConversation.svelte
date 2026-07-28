<script lang="ts">
	import { Braces, Files, FileText } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { fade } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import { serializeSession, type ExportFormat } from '$lib/sessionExport';
	import type { Session } from '$lib/sessions';

	/**
	 * Copy the whole conversation, in the format the user picks: the stored JSON
	 * (for tooling / re-import) or a readable Markdown transcript. Mirrors the small
	 * popover menu used by the profile and persona editors.
	 */
	interface Props {
		session: Session;
		/** Persona name, used as the assistant's speaker label in Markdown. */
		assistantLabel?: string;
	}

	let { session, assistantLabel }: Props = $props();

	let menuOpen = $state(false);

	async function copyAs(format: ExportFormat) {
		menuOpen = false;
		const content = serializeSession(session, format, assistantLabel);

		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(content);
			return;
		}

		// HACK: same workaround as ButtonCopy — `navigator.clipboard` is unavailable
		// over plain HTTP, so fall back to a throwaway textarea + execCommand.
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
</script>

<div class="copy-conversation relative">
	<Button title={$LL.copy()} variant="icon" onclick={() => (menuOpen = !menuOpen)}>
		<Files class="base-icon" />
	</Button>

	{#if menuOpen}
		<button
			class="fixed inset-0 z-10 cursor-default"
			aria-label="Dismiss"
			onclick={() => (menuOpen = false)}
		></button>
		<div
			class="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-shade-3 bg-shade-0 p-2 shadow-lg"
			transition:fade={{ duration: 80 }}
		>
			<button
				type="button"
				onclick={() => copyAs('markdown')}
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
			>
				<FileText class="h-4 w-4 shrink-0 text-muted" /> Markdown
			</button>
			<button
				type="button"
				onclick={() => copyAs('json')}
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
			>
				<Braces class="h-4 w-4 shrink-0 text-muted" /> JSON
			</button>
		</div>
	{/if}
</div>

<style lang="postcss">
	.copy-conversation {
		/* Hidden by default: copying isn't supported on mobile devices (same rule as ButtonCopy). */
		display: none;

		@media (hover: hover) {
			display: unset;
		}
	}
</style>

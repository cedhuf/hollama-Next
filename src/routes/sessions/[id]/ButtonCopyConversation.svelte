<script lang="ts">
	import { Braces, Files, FileText } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { copyText } from '$lib/clipboard';
	import Button from '$lib/components/Button.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import { serializeSession, type ExportFormat } from '$lib/sessionExport';
	import type { Session } from '$lib/sessions';

	/**
	 * Copy the whole conversation, in the format the user picks: the stored JSON
	 * (for tooling / re-import) or a readable Markdown transcript.
	 */
	interface Props {
		session: Session;
		/** Persona name, used as the assistant's speaker label in Markdown. */
		assistantLabel?: string;
	}

	let { session, assistantLabel }: Props = $props();

	async function copyAs(format: ExportFormat) {
		await copyText(serializeSession(session, format, assistantLabel));
	}
</script>

<Menu class="w-44">
	{#snippet trigger({ props })}
		<Button {...props} title={$LL.copy()} variant="icon">
			<Files class="base-icon" />
		</Button>
	{/snippet}

	<MenuItem icon={FileText} onclick={() => copyAs('markdown')}>Markdown</MenuItem>
	<MenuItem icon={Braces} onclick={() => copyAs('json')}>JSON</MenuItem>
</Menu>

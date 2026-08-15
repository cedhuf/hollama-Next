<script lang="ts">
	import { Check, Trash2, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { knowledgeStore, sessionsStore } from '$lib/localStorage';
	import { unbindPersonaSession } from '$lib/personas';
	import { Sitemap } from '$lib/sitemap';

	import Button from './Button.svelte';

	interface Props {
		sitemap: Sitemap;
		id: string;
		shouldConfirmDeletion: boolean;
		/**
		 * Tighter padding, for a sidebar row.
		 *
		 * A toolbar can afford a comfortable target; a list row is forty pixels tall
		 * and has a title to leave room for.
		 */
		compact?: boolean;
	}

	let { sitemap, id, shouldConfirmDeletion = $bindable(), compact = false }: Props = $props();

	const variant = $derived(compact ? 'icon-sm' : 'icon');

	function deleteRecord() {
		shouldConfirmDeletion = false;

		switch (sitemap) {
			// No navigation: a collection is edited in a dialog, so there is nowhere
			// to be sent back to once it is gone.
			case Sitemap.KNOWLEDGE:
				knowledgeStore.remove(id);
				return;

			case Sitemap.SESSIONS:
				sessionsStore.remove(id);
				unbindPersonaSession(id);
				return goto(resolve('/sessions'));

			default:
				break;
		}
	}

	function updateConfirmDeletion(value: boolean) {
		shouldConfirmDeletion = value;
	}
</script>

<div
	class="delete-button flex h-full flex-row"
	class:delete--confirm-deletion={shouldConfirmDeletion}
>
	{#if shouldConfirmDeletion}
		<Button
			{variant}
			class="delete-button__confirm hover:text-negative"
			onclick={deleteRecord}
			title={$LL.confirmDeletion()}
		>
			<Check class="base-icon" />
		</Button>

		<Button
			{variant}
			class="delete__cancel"
			onclick={() => updateConfirmDeletion(false)}
			title={$LL.dismiss()}
		>
			<X class="base-icon" />
		</Button>
	{:else}
		<Button
			{variant}
			class="delete__trash"
			onclick={() => updateConfirmDeletion(true)}
			title={sitemap === Sitemap.KNOWLEDGE ? $LL.deleteKnowledge() : $LL.deleteSession()}
		>
			<Trash2 class="base-icon" />
		</Button>
	{/if}
</div>

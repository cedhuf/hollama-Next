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
	}

	let { sitemap, id, shouldConfirmDeletion = $bindable() }: Props = $props();

	function deleteRecord() {
		shouldConfirmDeletion = false;

		switch (sitemap) {
			case Sitemap.KNOWLEDGE:
				knowledgeStore.remove(id);
				return goto(resolve('/knowledge'));

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
			variant="icon"
			class="delete-button__confirm hover:text-negative"
			onclick={deleteRecord}
			title={$LL.confirmDeletion()}
		>
			<Check class="base-icon" />
		</Button>

		<Button
			variant="icon"
			class="delete__cancel"
			onclick={() => updateConfirmDeletion(false)}
			title={$LL.dismiss()}
		>
			<X class="base-icon" />
		</Button>
	{:else}
		<Button
			variant="icon"
			class="delete__trash"
			onclick={() => updateConfirmDeletion(true)}
			title={sitemap === Sitemap.KNOWLEDGE ? $LL.deleteKnowledge() : $LL.deleteSession()}
		>
			<Trash2 class="base-icon" />
		</Button>
	{/if}
</div>

<script lang="ts">
	import { Check, Pencil, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';

	import Button from './Button.svelte';

	interface Props {
		shouldConfirmEdit: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { shouldConfirmEdit = $bindable(), onConfirm, onCancel }: Props = $props();

	function updateConfirmEdit(value: boolean) {
		shouldConfirmEdit = value;
		if (!value) {
			onCancel();
		}
	}

	function handleConfirm() {
		onConfirm();
		updateConfirmEdit(false);
	}
</script>

<div class="edit-button flex h-full flex-row" class:edit--confirm-edit={shouldConfirmEdit}>
	{#if shouldConfirmEdit}
		<Button
			variant="icon"
			class="edit-button__confirm hover:text-positive"
			on:click={handleConfirm}
			title={$LL.confirmEdit()}
		>
			<Check class="base-icon" />
		</Button>

		<Button
			variant="icon"
			class="edit__cancel"
			on:click={() => updateConfirmEdit(false)}
			title={$LL.dismiss()}
		>
			<X class="base-icon" />
		</Button>
	{:else}
		<Button
			variant="icon"
			class="edit__pencil"
			on:click={() => updateConfirmEdit(true)}
			title={$LL.editTitle()}
		>
			<Pencil class="base-icon" />
		</Button>
	{/if}
</div>

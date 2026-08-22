<script lang="ts">
	import { Brain } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import { type Knowledge } from '$lib/knowledge';
	import { openKnowledge } from '$lib/stores/modal';

	let {
		value = $bindable(''),
		options = $bindable([] as Knowledge[]),
		showNav = false,
		showLabel = true,
		allowClear = true,
		onChange = undefined as ((knowledgeId: string) => void) | undefined,
		fieldId = 'knowledge'
	}: {
		value?: string;
		options?: Knowledge[];
		showNav?: boolean;
		showLabel?: boolean;
		allowClear?: boolean;
		onChange?: ((knowledgeId: string) => void) | undefined;
		fieldId?: string;
	} = $props();
</script>

<FieldSelect
	bind:value
	label={$LL.knowledge()}
	isLabelVisible={showLabel}
	name={fieldId}
	disabled={!options.length}
	placeholder={!options.length ? $LL.emptyKnowledge() : !showLabel ? $LL.knowledge() : ''}
	options={options?.map((k) => ({ value: k.id, label: k.name }))}
	onChange={(option) => onChange?.(option.value)}
	{allowClear}
>
	{#snippet nav()}
		{#if showNav}
			<Button
				aria-label={$LL.newKnowledge()}
				variant="outline"
				onclick={() => openKnowledge()}
				class="text-muted h-full"
			>
				<Brain class="base-icon" />
			</Button>
		{/if}
	{/snippet}
</FieldSelect>

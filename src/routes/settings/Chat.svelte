<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import FieldSelectModel from '$lib/components/FieldSelectModel.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	const defaultModelValue = $derived($settingsStore.defaultModel ?? undefined);
	const titleModelValue = $derived($settingsStore.titleModel ?? undefined);
</script>

<Fieldset>
	<P><strong>Chat</strong></P>

	<FieldSelectModel
		isLabelVisible={true}
		label={$LL.defaultModel()}
		value={defaultModelValue}
		onChange={(o) => ($settingsStore.defaultModel = o.value || null)}
	/>

	<FieldCheckbox
		label={$LL.generateTitlesWithAI()}
		bind:checked={$settingsStore.generateTitlesWithAI}
	/>
	<FieldHelp>
		<P>{$LL.generateTitlesWithAIHelp()}</P>
	</FieldHelp>

	{#if $settingsStore.generateTitlesWithAI}
		<FieldSelectModel
			isLabelVisible={true}
			label={$LL.titleModel()}
			value={titleModelValue}
			onChange={(o) => ($settingsStore.titleModel = o.value || null)}
		/>
	{/if}
</Fieldset>

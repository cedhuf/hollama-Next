<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Head from '$lib/components/Head.svelte';
</script>

<Head title={$LL.knowledge()} />
<div class="flex h-full flex-col">
	<div class="min-h-0 flex-1">
		<EmptyMessage>{$LL.noKnowledgeChosen()}</EmptyMessage>
	</div>
</div>

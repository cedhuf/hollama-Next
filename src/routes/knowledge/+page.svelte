<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Head from '$lib/components/Head.svelte';
	import SidebarToggle from '$lib/components/SidebarToggle.svelte';
</script>

<Head title={$LL.knowledge()} />
<div class="flex h-full flex-col">
	<!-- Mobile-only strip so the drawer is reachable on this header-less page. -->
	<div class="flex shrink-0 items-center p-3 lg:hidden">
		<SidebarToggle class="-ml-1" />
	</div>
	<div class="min-h-0 flex-1">
		<EmptyMessage>{$LL.noKnowledgeChosen()}</EmptyMessage>
	</div>
</div>

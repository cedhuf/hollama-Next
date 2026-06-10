<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { page } from '$app/stores';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
</script>

<section class="error base-section base-section-fullscreen flex gap-x-8 px-6">
	<div class="error-message my-auto flex flex-col gap-y-12">
		{#if $page.status === 404}
			<EmptyMessage>
				<strong class="mr-4 text-nowrap">{$LL.error()} {$page.status}</strong>
				<span class="border-l pl-4">{$LL.notFound()}</span>
			</EmptyMessage>
		{:else if $page.status !== 200}
			<EmptyMessage>
				<strong class="mr-4 text-nowrap">{$LL.error()} {$page.status}</strong>
				<span class="border-l pl-4">{$LL.internalServerError()}</span>
			</EmptyMessage>
		{/if}
	</div>
</section>

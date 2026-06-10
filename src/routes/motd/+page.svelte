<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import Head from '$lib/components/Head.svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	export let data: { motd: string };
</script>

<Head title={$LL.messageOfTheDay()} />

<section class="motd base-section base-section-fullscreen px-5">
	<div class="motd-markdown my-auto">
		<Markdown markdown={data.motd} />
	</div>
</section>

<style lang="postcss">
	.motd-markdown :global(*) {
		text-wrap: balance;
	}
</style>

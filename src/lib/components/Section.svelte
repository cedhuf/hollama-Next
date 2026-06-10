<script lang="ts">
	import { page } from '$app/stores';
	import type { Sitemap } from '$lib/sitemap';

	import ButtonNew from './ButtonNew.svelte';
	import SectionList from './SectionList.svelte';

	export let sitemap: Sitemap;
	$: isIndex = `/${sitemap}` === $page.url.pathname;
</script>

<section
	class="section base-section grid grid-flow-row lg:grid-cols-[1fr,4fr] {isIndex
		? 'section--index'
		: ''}"
>
	<aside
		class="section__aside overflow-scrollbar flex h-full min-w-80 flex-col border-r {!isIndex
			? 'hidden lg:flex'
			: ''}"
	>
		<ButtonNew {sitemap}></ButtonNew>
		<SectionList>
			<slot name="list-items" />
		</SectionList>
	</aside>

	<div
		class="section__content overflow-scrollbar flex h-full flex-col bg-shade-1 {isIndex
			? 'hidden lg:block'
			: 'block'}"
	>
		<slot />
	</div>
</section>

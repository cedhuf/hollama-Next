<script lang="ts">
	import type { LocalizedString } from 'typesafe-i18n';

	import { APP_NAME } from '$lib/brand';

	export let title: LocalizedString | LocalizedString[] | string | string[] | undefined = undefined;
	const SEPARATOR = ' • ';
	$: formattedTitle = title
		? (Array.isArray(title) ? title.join(SEPARATOR) : title) + SEPARATOR + APP_NAME
		: APP_NAME;
</script>

<svelte:head>
	<title>{formattedTitle}</title>
</svelte:head>

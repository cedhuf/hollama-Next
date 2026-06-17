<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { settingsModalOpen } from '$lib/stores/modal';

	if (browser) {
		settingsModalOpen.set(true);
		goto(resolve('/sessions'));
	}
</script>

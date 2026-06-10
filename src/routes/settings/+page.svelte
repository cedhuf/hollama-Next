<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { settingsModalOpen } from '$lib/stores/modal';

	if (browser) {
		settingsModalOpen.set(true);
		goto('/sessions');
	}
</script>

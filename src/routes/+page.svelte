<script lang="ts">
	import { goto } from '$app/navigation';
	import { settingsModalOpen } from '$lib/stores/modal';
	import { serversStore } from '$lib/localStorage';

	$effect.pre(() => {
		if ($serversStore.some((server) => server.isVerified !== null)) {
			goto('/sessions');
		} else {
			settingsModalOpen.set(true);
			goto('/sessions');
		}
	});
</script>

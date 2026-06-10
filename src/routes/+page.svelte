<script lang="ts">
	import { goto } from '$app/navigation';
	import { serversStore } from '$lib/localStorage';
	import { settingsModalOpen } from '$lib/stores/modal';

	$effect.pre(() => {
		if ($serversStore.some((server) => server.isVerified !== null)) {
			goto('/sessions');
		} else {
			settingsModalOpen.set(true);
			goto('/sessions');
		}
	});
</script>

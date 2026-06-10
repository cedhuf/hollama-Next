<script lang="ts">
	import { goto } from '$app/navigation';

	// First-run onboarding is handled globally in the layout; just land on sessions.
	$effect.pre(() => {
		goto('/sessions');
	});
</script>

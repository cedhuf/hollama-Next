<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// First-run onboarding is handled globally in the layout; just land on sessions.
	$effect.pre(() => {
		goto(resolve('/sessions'));
	});
</script>

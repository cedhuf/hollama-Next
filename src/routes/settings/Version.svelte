<script lang="ts">
	import { CodeXml, Coffee, ExternalLink, GitFork, Heart } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { version } from '$app/environment';
	import Badge from '$lib/components/Badge.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import { GITHUB_URL } from '$lib/github';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';

	const UPSTREAM_URL = 'https://github.com/fmaclen/hollama';
	const KOFI_URL = 'https://ko-fi.com/cedric52222';

	$effect(() => {
		// Mark the update as seen when the About tab is open. Guard against
		// re-writing so the effect doesn't read and write the same state in a loop.
		if ($updateStatusStore.showSidebarNotification) {
			updateStatusStore.update((status) => ({ ...status, showSidebarNotification: false }));
		}
	});

	const statusText = $derived(
		$updateStatusStore.isCheckingForUpdates
			? 'Checking…'
			: $updateStatusStore.couldntCheckForUpdates
				? 'Update check failed'
				: $updateStatusStore.isCurrentVersionLatest
					? 'Up to date'
					: $updateStatusStore.latestVersion
						? `Update available: ${$updateStatusStore.latestVersion}`
						: ''
	);
</script>

<div class="about mx-auto flex max-w-md flex-col gap-6 py-4">
	<div class="about-header flex flex-col items-center gap-3 py-2">
		<img class="logo-ink about-logo h-14 w-14" src="/logo-mark.png" alt="Hollama Next logo" />
		<div class="about-title-group flex items-center gap-3">
			<h1 class="about-title text-xl font-semibold tracking-tight">Hollama Next</h1>
			<Badge>v{version}</Badge>
		</div>
	</div>

	<div class="about-card flex flex-col gap-3 rounded-xl border bg-shade-0 p-4">
		<div class="about-card-row">
			<span class="about-label text-muted">Status</span>
			<span class="about-value font-medium">
				{statusText || 'Unknown'}
			</span>
		</div>
		<FieldCheckbox
			label="Check for updates automatically"
			bind:checked={$settingsStore.autoCheckForUpdates}
		/>
		<button
			class="about-check-btn w-full rounded-lg border bg-shade-1 px-4 py-2 text-sm font-medium transition-colors hover:bg-shade-2 disabled:opacity-50"
			disabled={$updateStatusStore.isCheckingForUpdates}
			onclick={async () => await checkForUpdates(true)}
		>
			{$LL.checkNow()}
		</button>
	</div>

	<!-- Source links sit two-up: same card language as before, just halved. -->
	<div class="about-links grid grid-cols-2 gap-2">
		<a
			href={GITHUB_URL}
			target="_blank"
			rel="noopener noreferrer external"
			class="about-link-card flex min-w-0 items-center gap-2.5 rounded-xl border bg-shade-0 px-3 py-3 transition-colors hover:bg-shade-2"
		>
			<div
				class="about-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
			>
				<CodeXml class="h-5 w-5" />
			</div>
			<div class="about-link-body flex min-w-0 flex-1 flex-col">
				<span class="about-link-title truncate text-sm font-medium">GitHub</span>
				<span class="about-link-desc truncate text-xs text-muted">cedhuf/hollama-Next</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>

		<a
			href={UPSTREAM_URL}
			target="_blank"
			rel="noopener noreferrer"
			class="about-link-card flex min-w-0 items-center gap-2.5 rounded-xl border bg-shade-0 px-3 py-3 transition-colors hover:bg-shade-2"
		>
			<div
				class="about-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
			>
				<GitFork class="h-5 w-5" />
			</div>
			<div class="about-link-body flex min-w-0 flex-1 flex-col">
				<span class="about-link-title truncate text-sm font-medium">Forked from</span>
				<span class="about-link-desc truncate text-xs text-muted">fmaclen/hollama</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
	</div>

	<!-- Ko-fi keeps its own brand colour so it reads as the button people know,
	     while sharing the shape and rhythm of the cards above. -->
	<a
		href={KOFI_URL}
		target="_blank"
		rel="noopener noreferrer"
		style="background-color:#ff5e5b"
		class="about-support flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
	>
		<Coffee class="h-4 w-4 shrink-0" />
		Buy me a coffee
	</a>

	<div class="about-footer flex items-center justify-center gap-1 pb-2 text-xs text-muted">
		Made with <Heart class="inline h-3.5 w-3.5 text-negative" /> by cedhuf
	</div>
</div>

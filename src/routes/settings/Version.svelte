<script lang="ts">
	import { ChevronDown, ChevronUp, Coffee, ExternalLink, Github, Heart } from 'lucide-svelte';

	import LL from '$i18n/i18n-svelte';
	import motdContent from '../motd/motd.md?raw';
	import { version } from '$app/environment';
	import Badge from '$lib/components/Badge.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { GITHUB_URL } from '$lib/github';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';

	let motdExpanded = $state(false);

	$effect(() => {
		if ($updateStatusStore) $updateStatusStore.showSidebarNotification = false;
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

<div class="about">
	<div class="about-header">
		<img class="about-logo" src="/favicon.png" alt="Hollama Next logo" />
		<div class="about-title-group">
			<h1 class="about-title">Hollama Next</h1>
			<Badge>v{version}</Badge>
		</div>
	</div>

	<div class="about-card">
		<div class="about-card-row">
			<span class="about-label">Status</span>
			<span class="about-value">
				{statusText || 'Unknown'}
			</span>
		</div>
		<div class="about-card-row">
			<span class="about-label">Auto-check</span>
			<div class="about-toggle">
				<input
					id="auto-check-toggle"
					type="checkbox"
					class="toggle-input"
					bind:checked={$settingsStore.autoCheckForUpdates}
				/>
				<label for="auto-check-toggle" class="toggle-track">
					<span class="toggle-thumb"></span>
				</label>
			</div>
		</div>
		<button
			class="about-check-btn"
			disabled={$updateStatusStore.isCheckingForUpdates}
			onclick={async () => await checkForUpdates(true)}
		>
			{$LL.checkNow()}
		</button>
	</div>

	<div class="about-links">
		<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="about-link-card">
			<div class="about-link-icon">
				<Github class="h-5 w-5" />
			</div>
			<div class="about-link-body">
				<span class="about-link-title">GitHub</span>
				<span class="about-link-desc">cedhuf/hollama-Next</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
		<a href="https://ko-fi.com/cedric52222" target="_blank" rel="noopener noreferrer" class="about-link-card">
			<div class="about-link-icon">
				<Coffee class="h-5 w-5" />
			</div>
			<div class="about-link-body">
				<span class="about-link-title">Ko-fi</span>
				<span class="about-link-desc">Support the project</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
	</div>

	<button
		onclick={() => (motdExpanded = !motdExpanded)}
		class="about-motd-toggle"
	>
		{#if motdExpanded}
			<ChevronUp class="h-4 w-4 shrink-0 text-muted" />
		{:else}
			<ChevronDown class="h-4 w-4 shrink-0 text-muted" />
		{/if}
		<span>{$LL.messageOfTheDay()}</span>
	</button>

	{#if motdExpanded}
		<div class="about-motd-body">
			<Markdown markdown={motdContent} />
		</div>
	{/if}

	<div class="about-footer">
		Made with <Heart class="inline h-3.5 w-3.5 text-red-500" /> by cedhuf
	</div>
</div>

<style lang="postcss">
	.about {
		@apply mx-auto flex max-w-md flex-col gap-5 py-4;
	}

	.about-header {
		@apply flex flex-col items-center gap-3 py-2;
	}

	.about-logo {
		@apply h-14 w-14;
	}

	.about-title-group {
		@apply flex items-center gap-3;
	}

	.about-title {
		@apply text-xl font-semibold tracking-tight;
	}

	.about-card {
		@apply flex flex-col gap-3 rounded-xl border bg-shade-0 p-4;
	}

	.about-card-row {
		@apply flex items-center justify-between text-sm;
	}

	.about-label {
		@apply text-muted;
	}

	.about-value {
		@apply font-medium;
	}

	.about-toggle {
		@apply relative;
	}

	.toggle-input {
		@apply sr-only;
	}

	.toggle-track {
		@apply block h-5 w-9 cursor-pointer rounded-full bg-shade-4 transition-colors;
	}

	.toggle-input:checked + .toggle-track {
		@apply bg-accent;
	}

	.toggle-thumb {
		@apply block h-4 w-4 translate-x-0.5 translate-y-0.5 rounded-full bg-white transition-transform;
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		@apply translate-x-4;
	}

	.about-check-btn {
		@apply w-full rounded-lg border bg-shade-1 px-4 py-2 text-sm font-medium transition-colors hover:bg-shade-2 disabled:opacity-50;
	}

	.about-links {
		@apply flex flex-col gap-2;
	}

	.about-link-card {
		@apply flex items-center gap-3 rounded-xl border bg-shade-0 px-4 py-3 transition-colors hover:bg-shade-2;
	}

	.about-link-icon {
		@apply flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2;
	}

	.about-link-body {
		@apply flex flex-1 flex-col;
	}

	.about-link-title {
		@apply text-sm font-medium;
	}

	.about-link-desc {
		@apply text-xs text-muted;
	}

	.about-motd-toggle {
		@apply flex w-full items-center gap-2 rounded-xl border bg-shade-0 px-4 py-3 text-sm font-medium transition-colors hover:bg-shade-2;
	}

	.about-motd-body {
		@apply max-h-64 overflow-y-auto rounded-xl border bg-shade-0 p-4 text-sm leading-relaxed;
	}

	.about-footer {
		@apply flex items-center justify-center gap-1 pb-2 text-xs text-muted;
	}
</style>

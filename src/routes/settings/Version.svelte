<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		CodeXml,
		Coffee,
		ExternalLink,
		GitFork,
		Heart
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { version } from '$app/environment';
	import Badge from '$lib/components/Badge.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { GITHUB_URL } from '$lib/github';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';

	import motdContent from '../motd/motd.md?raw';

	let motdExpanded = $state(false);

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
		<img class="about-logo h-14 w-14" src="/favicon.png" alt="Hollama Next logo" />
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

	<div class="about-links flex flex-col gap-2">
		<a
			href={GITHUB_URL}
			target="_blank"
			rel="noopener noreferrer"
			class="about-link-card flex items-center gap-3 rounded-xl border bg-shade-0 px-4 py-3 transition-colors hover:bg-shade-2"
		>
			<div
				class="about-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
			>
				<CodeXml class="h-5 w-5" />
			</div>
			<div class="about-link-body flex flex-1 flex-col">
				<span class="about-link-title text-sm font-medium">GitHub</span>
				<span class="about-link-desc text-xs text-muted">cedhuf/hollama-Next</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
		<a
			href="https://github.com/fmaclen/hollama"
			target="_blank"
			rel="noopener noreferrer"
			class="about-link-card flex items-center gap-3 rounded-xl border bg-shade-0 px-4 py-3 transition-colors hover:bg-shade-2"
		>
			<div
				class="about-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
			>
				<GitFork class="h-5 w-5" />
			</div>
			<div class="about-link-body flex flex-1 flex-col">
				<span class="about-link-title text-sm font-medium">Forked from fmaclen/hollama</span>
				<span class="about-link-desc text-xs text-muted"
					>The original project by Fernando Maclen</span
				>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
		<a
			href="https://ko-fi.com/cedric52222"
			target="_blank"
			rel="noopener noreferrer"
			class="about-link-card flex items-center gap-3 rounded-xl border bg-shade-0 px-4 py-3 transition-colors hover:bg-shade-2"
		>
			<div
				class="about-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
			>
				<Coffee class="h-5 w-5" />
			</div>
			<div class="about-link-body flex flex-1 flex-col">
				<span class="about-link-title text-sm font-medium">Ko-fi</span>
				<span class="about-link-desc text-xs text-muted">Support the project</span>
			</div>
			<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
		</a>
	</div>

	<button
		onclick={() => (motdExpanded = !motdExpanded)}
		class="about-motd-toggle flex w-full items-center gap-2 rounded-xl border bg-shade-0 px-4 py-3 text-sm font-medium transition-colors hover:bg-shade-2"
	>
		{#if motdExpanded}
			<ChevronUp class="h-4 w-4 shrink-0 text-muted" />
		{:else}
			<ChevronDown class="h-4 w-4 shrink-0 text-muted" />
		{/if}
		<span>{$LL.messageOfTheDay()}</span>
	</button>

	{#if motdExpanded}
		<div
			class="about-motd-body max-h-64 overflow-y-auto rounded-xl border bg-shade-0 p-4 text-sm leading-relaxed"
		>
			<Markdown markdown={motdContent} />
		</div>
	{/if}

	<div class="about-footer flex items-center justify-center gap-1 pb-2 text-xs text-muted">
		Made with <Heart class="inline h-3.5 w-3.5 text-negative" /> by cedhuf
	</div>
</div>

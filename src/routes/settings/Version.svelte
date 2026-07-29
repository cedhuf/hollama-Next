<script lang="ts">
	import { CodeXml, Coffee, ExternalLink, GitFork, Heart } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { version } from '$app/environment';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { GITHUB_URL } from '$lib/github';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

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
			? $LL.checkingForUpdates()
			: $updateStatusStore.couldntCheckForUpdates
				? $LL.couldntCheckForUpdates()
				: $updateStatusStore.isCurrentVersionLatest
					? $LL.isCurrentVersionLatest()
					: $updateStatusStore.latestVersion
						? `${$LL.isLatestVersion()} ${$updateStatusStore.latestVersion}`
						: ''
	);

	const links = [
		{ href: GITHUB_URL, icon: CodeXml, title: 'GitHub', subtitle: 'cedhuf/hollama-Next' },
		{ href: UPSTREAM_URL, icon: GitFork, title: 'Forked from', subtitle: 'fmaclen/hollama' }
	];
</script>

<SettingsPanel>
	<!-- Identity block, in the same spirit as the Profile tab's header card. -->
	<div class="flex items-center justify-center gap-4 py-2">
		<Logo class="h-20 w-20 shrink-0" />
		<div class="flex flex-col items-start gap-1.5">
			<h1 class="text-xl font-semibold tracking-tight">Hollama Next</h1>
			<Badge>v{version}</Badge>
		</div>
	</div>

	<SettingsSection title={$LL.version()} card>
		<div class="flex items-center justify-between gap-3 text-sm">
			<span class="text-muted">{$LL.currentVersion()}</span>
			<span class="font-medium text-active">{statusText || '—'}</span>
		</div>

		<FieldCheckbox
			label={$LL.automaticallyCheckForUpdates()}
			bind:checked={$settingsStore.autoCheckForUpdates}
		/>

		<Button
			variant="outline"
			class="w-full"
			disabled={$updateStatusStore.isCheckingForUpdates}
			onclick={async () => await checkForUpdates(true)}
		>
			{$LL.checkNow()}
		</Button>
	</SettingsSection>

	<SettingsSection title={$LL.source()}>
		<!-- Two-up, sharing the card language of the section above. -->
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			{#each links as link (link.href)}
				{@const Icon = link.icon}
				<a
					href={link.href}
					target="_blank"
					rel="noopener noreferrer external"
					class="flex min-w-0 items-center gap-2.5 rounded-xl border border-shade-3 bg-shade-0 p-3 transition-colors hover:bg-shade-2"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shade-2"
						aria-hidden="true"
					>
						<Icon class="h-5 w-5" />
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-medium">{link.title}</span>
						<span class="truncate text-xs text-muted">{link.subtitle}</span>
					</span>
					<ExternalLink class="h-4 w-4 shrink-0 text-muted" />
				</a>
			{/each}
		</div>

		<!-- Ko-fi keeps its own brand colour so it reads as the button people know,
		     while sharing the shape and rhythm of the cards above. -->
		<a
			href={KOFI_URL}
			target="_blank"
			rel="noopener noreferrer"
			style="background-color:#ff5e5b"
			class="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
		>
			<Coffee class="h-4 w-4 shrink-0" />
			{$LL.buyMeACoffee()}
		</a>
	</SettingsSection>

	<p class="flex items-center justify-center gap-1 pb-2 text-xs text-muted">
		{$LL.madeWithLoveBy()}
		<Heart class="inline h-3.5 w-3.5 text-negative" />
		{$LL.byAuthor()}
	</p>
</SettingsPanel>

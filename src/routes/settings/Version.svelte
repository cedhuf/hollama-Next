<script lang="ts">
	import {
		BookOpen,
		CodeXml,
		Coffee,
		ExternalLink,
		GitFork,
		Heart,
		LoaderCircle
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { browser, version } from '$app/environment';
	import { APP_NAME, APP_PRONUNCIATION } from '$lib/brand';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { AUTHOR_URL, DOCS_URL, GITHUB_URL, releaseUrl } from '$lib/github';
	import { isInstalled, openInstallDialog } from '$lib/install';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, isNewerVersion, updateStatusStore } from '$lib/updates';
	import { formatTimestampToNowShort } from '$lib/utils';

	import SettingsLink from './SettingsLink.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const UPSTREAM_URL = 'https://github.com/fmaclen/hollama';
	const KOFI_URL = 'https://ko-fi.com/cedric52222';

	/**
	 * The newest version we know of, whether this session checked or a previous
	 * one did. The store is in memory, so after a reload only the persisted answer
	 * is left, and reporting nothing beside "checked an hour ago" would be worse
	 * than reporting what that check found.
	 */
	const knownLatest = $derived(
		$updateStatusStore.latestVersion || $settingsStore.lastKnownVersion || ''
	);
	const hasEverChecked = $derived(!!$settingsStore.lastUpdateCheck || !!knownLatest);
	// Semver, not string equality: a development build is `0.6.0-dev`, which is not
	// literally `0.6.0` and would otherwise announce itself as out of date.
	const isOutdated = $derived(!!knownLatest && isNewerVersion(knownLatest, version));

	/**
	 * One state, so the label, its dot and its link cannot disagree.
	 *
	 * Deliberately not a "checking" state: a status that swaps to a long sentence
	 * mid-check and back is what made this row jump between one and two lines. The
	 * last known answer stays put, and the button carries the spinner instead,
	 * the same split macOS uses in Software Update.
	 */
	const status = $derived.by<{
		label: string;
		dot: string;
		href: string | undefined;
	}>(() => {
		if ($updateStatusStore.failure === 'server') {
			return { label: $LL.couldntReachServer(), dot: 'bg-warning', href: undefined };
		}
		if ($updateStatusStore.failure === 'releases') {
			return { label: $LL.couldntReachReleases(), dot: 'bg-warning', href: undefined };
		}
		if (!hasEverChecked) {
			return { label: $LL.neverChecked(), dot: 'bg-shade-5', href: undefined };
		}
		if (isOutdated) {
			// The version is the message: "0.7.0 available" says more than "outdated",
			// and it is the thing worth clicking through to.
			return {
				label: $LL.versionAvailable({ version: knownLatest }),
				dot: 'bg-warning',
				href: releaseUrl(knownLatest)
			};
		}
		return { label: $LL.upToDate(), dot: 'bg-positive', href: undefined };
	});

	/**
	 * Relative, because "3 days ago" is the question being asked, not the date.
	 * Empty when no check has ever run: the status already says so, and repeating
	 * it below reads like two different facts.
	 */
	const lastCheckedText = $derived(
		$settingsStore.lastUpdateCheck
			? $LL.lastChecked({
					when: formatTimestampToNowShort(
						new Date($settingsStore.lastUpdateCheck * 1000).toISOString(),
						$LL.justNow()
					)
				})
			: ''
	);

	const links = [
		{ href: GITHUB_URL, icon: CodeXml, title: 'GitHub', subtitle: 'cedhuf/llooma' },
		{ href: UPSTREAM_URL, icon: GitFork, title: 'Forked from', subtitle: 'fmaclen/hollama' }
	];
</script>

<SettingsPanel>
	<!-- Identity block, in the same spirit as the Profile tab's header card. -->
	<div class="flex items-center justify-center gap-4 py-2">
		<Logo class="h-20 w-20 shrink-0" />
		<div class="flex flex-col items-start gap-1.5">
			<!-- Name, how to say it, and which build: one line, because they are one
			     thought. The pronunciation is a phonemic transcription (IPA), muted so
			     it reads as a gloss on the name rather than part of it. -->
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<h1 class="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
				<span class="text-muted text-sm" lang="en">{APP_PRONUNCIATION}</span>
				<!-- The badge carries the link to its own release notes, so the section
				     below does not have to repeat the number just to have something to
				     hang that link on. A badge does not read as clickable on its own,
				     so the tooltip is what says where it goes. -->
				<Tooltip side="bottom">
					{#snippet trigger({ props })}
						<a
							{...props}
							href={releaseUrl(version)}
							target="_blank"
							rel="noopener noreferrer external"
						>
							<Badge>v{version}</Badge>
						</a>
					{/snippet}
					{$LL.releaseNotes()}
				</Tooltip>
			</div>
			<!-- Tucked into the identity block rather than added as a third card: the
			     logo is taller than the lines beside it, so this fills whitespace that
			     already existed and the panel keeps its height. -->
			<a
				href={DOCS_URL}
				target="_blank"
				rel="noopener noreferrer external"
				class="text-muted hover:text-active flex items-center gap-1 text-xs transition-colors"
			>
				<BookOpen class="h-3.5 w-3.5 shrink-0" />
				{$LL.documentation()}
			</a>
		</div>
	</div>

	<SettingsSection title={$LL.version()} card>
		<!-- Status on the left, its action on the right, one row that cannot wrap:
		     the left column takes the slack and truncates, the button never moves.
		     Nothing here changes size when a check runs. -->
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 flex-col gap-0.5">
				<span class="flex min-w-0 items-center gap-2 text-sm font-medium">
					<span class="h-2 w-2 shrink-0 rounded-full {status.dot}" aria-hidden="true"></span>
					{#if status.href}
						<a
							href={status.href}
							target="_blank"
							rel="noopener noreferrer external"
							class="hover:text-accent truncate transition-colors"
						>
							{status.label}
						</a>
					{:else}
						<span class="truncate">{status.label}</span>
					{/if}
				</span>
				{#if lastCheckedText}
					<span class="text-muted truncate pl-4 text-xs">{lastCheckedText}</span>
				{/if}
			</div>

			<Button
				variant="outline"
				class="shrink-0"
				disabled={$updateStatusStore.isCheckingForUpdates}
				onclick={async () => await checkForUpdates(true)}
			>
				{#if $updateStatusStore.isCheckingForUpdates}
					<LoaderCircle class="mr-1.5 h-3.5 w-3.5 animate-spin" />
				{/if}
				{$LL.checkNow()}
			</Button>
		</div>

		<FieldCheckbox
			label={$LL.automaticallyCheckForUpdates()}
			bind:checked={$settingsStore.autoCheckForUpdates}
		/>
		<!-- One line, and only where it can lead anywhere: an app already on the home
		     screen has nothing to offer here, and a browser that cannot install has
		     nothing to say. The offer itself comes and goes on its own; this is simply
		     where someone would think to look for it again. -->
		{#if browser && !isInstalled()}
			<SettingsLink onclick={openInstallDialog}>{$LL.installApp()}</SettingsLink>
		{/if}
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
					class="border-shade-3 bg-shade-0 hover:bg-shade-2 flex min-w-0 items-center gap-2.5 rounded-xl border p-3 transition-colors"
				>
					<span
						class="bg-shade-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
						aria-hidden="true"
					>
						<Icon class="h-5 w-5" />
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-sm font-medium">{link.title}</span>
						<span class="text-muted truncate text-xs">{link.subtitle}</span>
					</span>
					<ExternalLink class="text-muted h-4 w-4 shrink-0" />
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

	<p class="text-muted flex items-center justify-center gap-1 pb-2 text-xs">
		{$LL.madeWithLoveBy()}
		<Heart class="text-negative inline h-3.5 w-3.5" />
		<a
			href={AUTHOR_URL}
			target="_blank"
			rel="noopener noreferrer external"
			class="hover:text-active transition-colors"
		>
			{$LL.byAuthor()}
		</a>
	</p>
</SettingsPanel>

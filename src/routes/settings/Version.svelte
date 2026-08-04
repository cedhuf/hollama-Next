<script lang="ts">
	import { BookOpen, CodeXml, Coffee, ExternalLink, GitFork, Heart } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { version } from '$app/environment';
	import { APP_NAME, APP_PRONUNCIATION } from '$lib/brand';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { AUTHOR_URL, DOCS_URL, GITHUB_URL, releaseUrl } from '$lib/github';
	import { settingsStore } from '$lib/localStorage';
	import { checkForUpdates, isNewerVersion, updateStatusStore } from '$lib/updates';
	import { formatTimestampToNow } from '$lib/utils';

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

	/** One state, so the pill, its colour and its link cannot disagree. */
	const status = $derived.by<{
		label: string;
		variant: 'positive' | 'warning' | undefined;
		href: string | undefined;
	}>(() => {
		if ($updateStatusStore.isCheckingForUpdates) {
			return { label: $LL.checkingForUpdates(), variant: undefined, href: undefined };
		}
		if ($updateStatusStore.failure === 'server') {
			return { label: $LL.couldntReachServer(), variant: 'warning', href: undefined };
		}
		if ($updateStatusStore.failure === 'releases') {
			return { label: $LL.couldntReachReleases(), variant: 'warning', href: undefined };
		}
		if (!hasEverChecked) {
			return { label: $LL.neverChecked(), variant: undefined, href: undefined };
		}
		if (isOutdated) {
			// The version is the message: "0.7.0 available" says more than "outdated",
			// and it is the thing worth clicking through to.
			return {
				label: $LL.versionAvailable({ version: knownLatest }),
				variant: 'warning',
				href: releaseUrl(knownLatest)
			};
		}
		return { label: $LL.isCurrentVersionLatest(), variant: 'positive', href: undefined };
	});

	/**
	 * Relative, because "3 days ago" is the question being asked, not the date.
	 * Empty when no check has ever run: the pill already says so, and repeating it
	 * on the line below reads like two different facts.
	 */
	const lastCheckedText = $derived(
		$settingsStore.lastUpdateCheck
			? $LL.lastChecked({
					when: formatTimestampToNow(new Date($settingsStore.lastUpdateCheck * 1000).toISOString())
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
			<!-- Name, how to say it, and which build — one line, because they are one
			     thought. The pronunciation is a phonemic transcription (IPA), muted so
			     it reads as a gloss on the name rather than part of it. -->
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<h1 class="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
				<span class="text-sm text-muted" lang="en">{APP_PRONUNCIATION}</span>
				<Badge>v{version}</Badge>
			</div>
			<!-- Tucked into the identity block rather than added as a third card: the
			     logo is taller than the lines beside it, so this fills whitespace that
			     already existed and the panel keeps its height. -->
			<a
				href={DOCS_URL}
				target="_blank"
				rel="noopener noreferrer external"
				class="flex items-center gap-1 text-xs text-muted transition-colors hover:text-active"
			>
				<BookOpen class="h-3.5 w-3.5 shrink-0" />
				{$LL.documentation()}
			</a>
		</div>
	</div>

	<SettingsSection title={$LL.version()} card>
		<!-- What you run on the left, what we know about it on the right, and the
		     action beside its own result. The button used to own a full-width row of
		     its own, which cost height on a panel that should not scroll. -->
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<div class="flex min-w-0 flex-col gap-0.5">
				<a
					href={releaseUrl(version)}
					target="_blank"
					rel="noopener noreferrer external"
					class="w-fit text-sm font-medium text-active transition-colors hover:text-accent"
					title={$LL.releaseNotes()}
				>
					v{version}
				</a>
				{#if lastCheckedText}
					<span class="text-xs text-muted">{lastCheckedText}</span>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<!-- `Badge` takes an `href` but cannot carry `target`/`rel`, and this one
				     leaves the app, so the anchor is outside it. -->
				{#if status.href}
					<a href={status.href} target="_blank" rel="noopener noreferrer external">
						<Badge variant={status.variant}>{status.label}</Badge>
					</a>
				{:else}
					<Badge variant={status.variant}>{status.label}</Badge>
				{/if}
				<Button
					variant="outline"
					disabled={$updateStatusStore.isCheckingForUpdates}
					onclick={async () => await checkForUpdates(true)}
				>
					{$LL.checkNow()}
				</Button>
			</div>
		</div>

		<FieldCheckbox
			label={$LL.automaticallyCheckForUpdates()}
			bind:checked={$settingsStore.autoCheckForUpdates}
		/>
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
		<a
			href={AUTHOR_URL}
			target="_blank"
			rel="noopener noreferrer external"
			class="transition-colors hover:text-active"
		>
			{$LL.byAuthor()}
		</a>
	</p>
</SettingsPanel>

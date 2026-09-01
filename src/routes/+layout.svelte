<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { navigatorDetector } from 'typesafe-i18n/detectors';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import { detectLocale } from '$i18n/i18n-util';
	import { loadLocale } from '$i18n/i18n-util.sync';

	import '../app.pcss';

	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page, updated } from '$app/stores';
	import { loadServerChatDefaults } from '$lib/chatDefaults';
	import CollapsibleSidebar from '$lib/components/CollapsibleSidebar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import KnowledgeModal from '$lib/components/KnowledgeModal.svelte';
	import SearchModal from '$lib/components/SearchModal.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import { releaseUrl } from '$lib/github';
	import { loadImages } from '$lib/images';
	import {
		installDialog,
		isInstalled,
		markInstallOffered,
		shouldOfferInstall,
		type PwaInstallDialog
	} from '$lib/install';
	import { loadIntegrationsConfig } from '$lib/integrationsConfig';
	import { hydrateStores, refreshStores, settingsStore } from '$lib/localStorage';
	import { loadMcpConfig } from '$lib/mcpConfig';
	import { loadServerPersonas } from '$lib/personasConfig';
	import { loadServerPlaybooks } from '$lib/playbooksConfig';
	import { loadServerSearch } from '$lib/search';
	import { currentRole, currentUser } from '$lib/stores/auth';
	import { setInstanceConfig } from '$lib/stores/instance';
	import { openSearch, searchModalOpen, searchModalQuery, welcomeOpen } from '$lib/stores/modal';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';
	import { loadServerPrompts } from '$lib/systemPrompts';
	import { toast } from '$lib/toast';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';
	import { wallpaperImage } from '$lib/wallpapers';
	import { loadWebFetchConfig } from '$lib/webFetch';

	import type { LayoutData } from './$types';
	import SettingsModal from './settings/SettingsModal.svelte';
	import Welcome from './Welcome.svelte';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Wait for the async hydration, so a page always reads a loaded store: a
	// refresh could otherwise show an empty session until you navigate away.
	let booted = $state(false);

	$effect(() => {
		currentUser.set(data.user);
		setInstanceConfig(data.instance ?? null);
	});

	$effect(() => {
		const { latestVersion, isCurrentVersionLatest, isCheckingForUpdates } = $updateStatusStore;
		if (isCheckingForUpdates || isCurrentVersionLatest || !latestVersion) return;

		// On a shared instance only an admin can act on this. The About tab still lets
		// a user check by hand.
		if ($currentRole !== 'admin') return;

		// Through `get`: subscribing here would make the write below re-run this effect.
		if (get(settingsStore).notifiedUpdateVersion === latestVersion) return;
		settingsStore.update((settings) => ({ ...settings, notifiedUpdateVersion: latestVersion }));

		toast.notice($LL.isLatestVersion(), {
			description: latestVersion,
			action: {
				label: $LL.viewRelease(),
				onClick: () => window.open(releaseUrl(latestVersion), '_blank', 'noopener,noreferrer')
			}
		});
	});

	/**
	 * The server is serving a build this client is not running, which is a
	 * different thing from a newer version existing somewhere. It notifies rather
	 * than reloading: a reload would take an unsent message or a running turn.
	 */
	let notifiedReload = false;
	$effect(() => {
		if (!$updated || notifiedReload) return;
		notifiedReload = true;

		toast.notice($LL.isLatestVersion(), {
			action: {
				label: $LL.refreshToUpdate(),
				onClick: () => location.reload()
			}
		});
	});

	/**
	 * Which of the two interfaces this account is on, redirected at the one place
	 * both trees pass through. Both directions, on the same rule: a phone with the
	 * setting on goes there and anything wider comes back, including a dragged
	 * corner.
	 *
	 * Nothing under `/m` reads any of this. And nothing here touches the OS chrome:
	 * the tint follows the theme, once, where it always did.
	 */
	let onPhone = $state(false);

	/** Which shell to draw: the mobile tree brings its own. */
	const onMobileUi = $derived($page.url.pathname === '/m' || $page.url.pathname.startsWith('/m/'));

	$effect(() => {
		if (!browser) return;
		// A phone, not a small screen. 640 keeps tablets out: an iPad mini is 744
		// across and has room for the sidebar and a conversation beside it.
		const query = window.matchMedia('(max-width: 640px)');
		onPhone = query.matches;
		const update = (event: MediaQueryListEvent) => (onPhone = event.matches);
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	/**
	 * Nothing escapes, and that is the point. The allow-list that let `/library`
	 * out only opened outwards: the next tap in the full interface was caught by
	 * the redirect and threw you back. `/m/library` is that page now.
	 *
	 * Leaving is still possible and only ever deliberate: the row under it in
	 * Profile turns the phone interface off.
	 */
	$effect(() => {
		if (!booted) return;
		const path = $page.url.pathname;
		if (path === '/login') return;
		const belongsThere = $settingsStore.simplifiedMobileUI && onPhone;

		if (belongsThere && !onMobileUi) void goto(resolve('/m'));
		else if (!belongsThere && onMobileUi) void goto(resolve('/sessions'));
	});

	onNavigate(() => {
		/**
		 * Started, not awaited. `onNavigate` holds the navigation open until what it
		 * returns settles, so awaiting made every page change wait on a version check
		 * nobody asked for, which with page transitions looks like a failed navigation.
		 */
		if (!($settingsStore.autoCheckForUpdates === false)) void checkForUpdates();

		// Close the mobile drawer on every navigation (standard drawer behaviour).
		mobileDrawerOpen.set(false);
	});

	/**
	 * Coming back to an app that never went away: an installed PWA is suspended and
	 * resumed for days without re-running its boot, so both things read at startup
	 * (the stored conversations and the running build) are checked here.
	 */
	/** Command-K opens conversation search. Ignored while typing: a message being composed owns the keyboard first. */
	$effect(() => {
		if (!browser) return;

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			openSearch();
		};

		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	$effect(() => {
		if (!browser) return;

		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			void refreshStores();
			void updated.check();
		};

		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	// Native drawer gestures: edge-swipe right to open, swipe left to close.
	let touchStartX = 0;
	let touchStartY = 0;
	let drawerWasClosed = false;

	function onTouchStart(event: TouchEvent) {
		const t = event.touches[0];
		touchStartX = t.clientX;
		touchStartY = t.clientY;
		drawerWasClosed = !$mobileDrawerOpen;
	}

	function onTouchEnd(event: TouchEvent) {
		if (!browser || window.innerWidth >= 1024) return;
		const t = event.changedTouches[0];
		const dx = t.clientX - touchStartX;
		const dy = t.clientY - touchStartY;
		// Only a deliberate, mostly-horizontal swipe counts.
		if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
		// Open: a rightward swipe beginning just inland of the edge. The first ~20px
		// belong to iOS's system back-swipe, so the band starts past it.
		if (drawerWasClosed && dx > 0 && touchStartX > 24 && touchStartX < 80)
			mobileDrawerOpen.set(true);
		else if (!drawerWasClosed && dx < 0) mobileDrawerOpen.set(false);
	}

	$effect(() => {
		if (!$settingsStore.userLanguage) return;
		loadLocale($settingsStore.userLanguage);
		setLocale($settingsStore.userLanguage);
	});

	/**
	 * A browser tab picks up a new `content` on the existing tag, but the installed
	 * app reads that tag at launch and keeps the colour it got. Replacing the whole
	 * node is what gets it read again.
	 */
	function setThemeColor(color: string) {
		for (const stale of document.querySelectorAll('meta[name="theme-color"]')) stale.remove();
		const meta = document.createElement('meta');
		meta.name = 'theme-color';
		meta.content = color;
		document.head.appendChild(meta);
	}

	/** Resolved once, here, so the attribute driving the shadows and the layer painting the picture cannot disagree about whether there is one. */
	const wallpaper = $derived(wallpaperImage($settingsStore.backgroundImage));

	$effect(() => {
		// A locked instance theme wins over the stored one rather than overwriting it,
		// so unlocking gives everyone their own back. An offered one applies only until
		// this account picks for itself.
		const sharing = data.instance?.themeSharing ?? 'off';
		const locked =
			sharing === 'locked' || (sharing === 'overridable' && !$settingsStore.themeChosen);
		const mode = (locked ? data.instance?.themeMode : $settingsStore.themeMode) || 'system';
		const style = (locked ? data.instance?.themeStyle : $settingsStore.themeStyle) || 'classic';

		document.documentElement.setAttribute('data-theme-style', style);

		// One number for the whole app: every translucent surface scales itself from
		// it. Switching the effect off is the attribute's job, since the bottom of the
		// slider is the thinnest surface rather than the absence of one.
		const on = $settingsStore.surfaceTransparency !== false;
		// 50 is the reference the surfaces are drawn for, so it maps to 1.
		const strength = ($settingsStore.surfaceTransparencyLevel ?? 50) / 50;
		document.documentElement.style.setProperty('--surface-strength', String(on ? strength : 0));
		document.documentElement.setAttribute('data-transparency', on ? 'on' : 'off');

		// Drives the wallpaper's layer and the shadow that makes the columns read as
		// panels on a picture rather than holes cut in it.
		document.documentElement.setAttribute('data-wallpaper', wallpaper ? 'on' : 'off');
		// Same shape as the surfaces above, and 50 means the same thing.
		const blur = ($settingsStore.backgroundBlurLevel ?? 50) / 50;
		document.documentElement.style.setProperty('--wallpaper-strength', String(blur));

		const applyTheme = (prefersDark?: boolean) => {
			let theme: string;
			if (mode === 'system') {
				theme =
					(prefersDark ?? window.matchMedia('(prefers-color-scheme: dark)').matches)
						? 'dark'
						: 'light';
			} else {
				theme = mode;
			}
			document.documentElement.setAttribute('data-color-theme', theme);

			// Keep the OS chrome tint in sync with the live safe-area colour (shade-1),
			// across every theme style.
			if (browser) {
				const chrome = getComputedStyle(document.documentElement)
					.getPropertyValue('--color-shade-1')
					.trim();
				if (chrome) setThemeColor(chrome);
			}
		};

		applyTheme();

		if (mode === 'system' && browser) {
			const mq = window.matchMedia('(prefers-color-scheme: dark)');
			const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
			mq.addEventListener('change', handler);
			return () => mq.removeEventListener('change', handler);
		}
	});

	onMount(async () => {
		// Fill the stores from the repository.
		await hydrateStores();
		await loadServerSearch();
		await loadWebFetchConfig();
		await loadServerPrompts();
		await loadServerChatDefaults();
		await loadServerPersonas();
		await loadIntegrationsConfig();
		await loadMcpConfig();
		await loadServerPlaybooks();
		// Small by construction: the pictures themselves are fetched one at a time by
		// the page that shows them.
		await loadImages();

		// No personas are written at boot. They used to be pushed into the store, which
		// made "shipped with the app" and "installed by you" the same thing and sent
		// them out in your backup. They live in the store the Library browses now.
		/**
		 * The phone interface, switched on once for accounts that predate it. Here
		 * rather than in the defaults, which reach only a browser that has stored
		 * nothing; see `mobileDefaultApplied`. After boot, so it writes to a hydrated
		 * store rather than to the defaults about to overwrite it.
		 */
		if (!$settingsStore.mobileDefaultApplied) {
			$settingsStore = {
				...$settingsStore,
				simplifiedMobileUI: true,
				mobileDefaultApplied: true
			};
		}

		booted = true;

		// Language
		if (!$settingsStore.userLanguage)
			// `detectLocale` is generated from the installed locale folders, so a new
			// language is picked up without touching this file.
			$settingsStore.userLanguage = detectLocale(navigatorDetector);

		loadLocale($settingsStore.userLanguage);
		setLocale($settingsStore.userLanguage);

		// Color theme
		if (browser && !$settingsStore.themeMode) {
			$settingsStore.themeMode = 'system';
		}

		// One first run, composed for whoever is in front of it: the tour asks for a
		// connection and a name only where they are missing and allowed, and skips to
		// the introduction otherwise.
		//
		// Shown again when an administrator bumps the epoch: each browser remembers the
		// stamp it acknowledged, so nothing tracks who saw what.
		const epoch = data.instance?.onboardingEpoch ?? 0;
		const seen = $settingsStore.onboardingEpochSeen ?? 0;

		if (env.PUBLIC_DISABLE_ONBOARDING !== 'true') {
			if (!$settingsStore.welcomeComplete || epoch > seen) $welcomeOpen = true;
		}

		// Browser only: it registers a custom element.
		void import('@khmyznikov/pwa-install');
	});

	/** Handed to the store so anything can ask for it, the sidebar entry included. */
	let pwaInstall: PwaInstallDialog | undefined = $state();

	/**
	 * The offer, on the component's event rather than on its `isInstallAvailable`
	 * property: that belongs to a Lit element, so reading it here creates no
	 * dependency and the answer is taken too early. Chromium settles it when the
	 * browser hands its prompt over, Apple half a second after load.
	 *
	 * Never over the first-run wizard: two dialogs on a first launch is one too many.
	 */
	$effect(() => {
		const dialog = pwaInstall;
		installDialog.set(dialog ?? null);
		if (!dialog) return;

		const offer = () => {
			if (get(welcomeOpen)) return;
			if (!shouldOfferInstall(get(settingsStore).offerInstall !== false)) return;

			markInstallOffered();
			dialog.showDialog();
		};

		dialog.addEventListener('pwa-install-available-event', offer);
		return () => dialog.removeEventListener('pwa-install-available-event', offer);
	});
</script>

<svelte:head>
	{#if env.PUBLIC_PLAUSIBLE_DOMAIN}
		<script
			defer
			data-domain={env.PUBLIC_PLAUSIBLE_DOMAIN}
			data-api={env.PUBLIC_PLAUSIBLE_API}
			src={env.PUBLIC_PLAUSIBLE_SRC}
		></script>
	{/if}
</svelte:head>

<Toasts />
<ConfirmDialog />

<!-- Global drawer swipe gestures (mobile). -->
<svelte:window ontouchstart={onTouchStart} ontouchend={onTouchEnd} />

{#if $page.url.pathname === '/login'}
	<!-- Login renders standalone, without the app shell. -->
	{@render children()}
{:else if !booted}
	<div class="bg-shade-2 flex h-dvh w-screen items-center justify-center">
		<LoaderCircle class="text-muted h-6 w-6 animate-spin" />
	</div>
{:else}
	<!-- The dialogs belong to the account, not to a frame, so they are mounted once
	     above the choice of shell. -->
	<SettingsModal />
	<SearchModal bind:open={$searchModalOpen} initialQuery={$searchModalQuery} />
	<KnowledgeModal />
	<Welcome />

	<!-- Manual mode, so it shows nothing of its own accord: when to ask is decided
	     above. It reads the name, description and screenshots from the manifest. -->
	{#if browser && !isInstalled()}
		<pwa-install
			bind:this={pwaInstall}
			manual-apple
			manual-chrome
			manifest-url="/manifest.webmanifest"
		></pwa-install>
	{/if}

	{#if onMobileUi}
		<!-- The mobile interface brings its own frame. Nested inside this one it carried
	     a hidden sidebar, a chrome header and the page card underneath itself, each
	     with its own height, `overflow-hidden` and idea of what `100vh` means. -->
		{@render children()}
	{:else}
		<!-- shade-1 on mobile, so the notch and home-indicator strips are one chrome
	     colour; shade-2 canvas on desktop.

	     The wallpaper is painted by this box's own backdrop layer and handed over as
	     a custom property: a `filter` here would blur the application with it. -->
		<div
			class="app-shell bg-shade-1 lg:bg-shade-2 relative flex w-full overflow-hidden lg:p-4 lg:pt-4 lg:pb-4"
			style={wallpaper ? `--wallpaper: ${wallpaper}` : ''}
		>
			<CollapsibleSidebar />
			<!-- The card runs the full height of the display, so its corners round on the
			     corners of the screen. It owes the safe areas nothing: content is meant to
			     pass under the status bar and the home indicator, and the bars over it hold
			     themselves off the edge on their own account.

			     On mobile it is an opaque card sliding right to uncover the sidebar. The
			     rounding and the shadow are painted only while it is open and travel with
			     the slide, because a corner cut into a full-screen card shows the page's own
			     background. Open, what the corner shows is the column: it paints the full
			     width and lays its contents out to `--drawer-w`, so the card slides onto its
			     own material. A no-op on desktop, where the sidebar lives in flow. -->
			<div
				class="app-card max-lg:bg-shade-1 relative z-10 flex min-w-0 flex-1 flex-col max-lg:overflow-hidden {$mobileDrawerOpen
					? 'max-lg:translate-x-[var(--drawer-w)] max-lg:rounded-l-[1.75rem] max-lg:shadow-[-8px_0_24px_-2px_rgba(0,0,0,0.25)]'
					: 'max-lg:shadow-[-8px_0_24px_-2px_rgba(0,0,0,0)]'}"
			>
				<!-- Each route owns the sidebar toggle at its top-left, so there is no extra
				     top strip here. -->
				<div class="relative min-h-0 min-w-0 flex-1">
					{@render children()}
				</div>
				<!-- Inside the sliding card, so it dims the page and never the revealed
				     sidebar, and travels with it. -->
				{#if $mobileDrawerOpen}
					<div
						class="absolute inset-0 z-20 bg-black/30 lg:hidden"
						transition:fade={{ duration: 150 }}
						onclick={() => mobileDrawerOpen.set(false)}
						role="presentation"
					></div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style lang="postcss">
	:global(html) {
		/* Desktop: match bg-shade-2, so the rounded-corner margins share one
	   seamless background. */
		background-color: var(--color-shade-2);
		font-size: 1rem;
		line-height: 1.5rem;
		letter-spacing: normal;
	}

	/* Mobile: the shell is shade-1, so the root must match it for the OS status-bar
	   and home-indicator strips to blend in. */
	@media (max-width: 1023px) {
		:global(html),
		:global(body) {
			background-color: var(--color-shade-1);
		}
	}

	/* Full-height shell. In a browser tab `dvh` tracks the toolbars sliding in
	   and out. */
	.app-shell {
		height: 100dvh;
	}

	/* The installed app is a different animal, and these numbers were measured on
	   the device.

	   Under the status bar, iOS moves the document up but leaves the layout
	   viewport at the display height minus the status bar (812 against 874 on an
	   iPhone 16 Pro), so the strip left at the bottom shows nothing.

	   The cure is the display's height plus no scrolling: sized but scrollable, it
	   slides its own bottom off screen instead of filling the strip. `vh` is the
	   only unit that knows the real number. */
	@media (display-mode: standalone) {
		:global(html),
		:global(body) {
			height: 100vh;
			overflow: hidden;
		}

		.app-shell {
			height: 100vh;
		}
	}
</style>

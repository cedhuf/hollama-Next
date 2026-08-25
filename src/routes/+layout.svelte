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
	import { hydrateStores, refreshStores, settingsStore } from '$lib/localStorage';
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

	// Wait for the async hydration before rendering the app, so pages always read
	// fully-loaded stores (otherwise a refresh can show an empty session until you
	// navigate away and back).
	let booted = $state(false);

	$effect(() => {
		currentUser.set(data.user);
		setInstanceConfig(data.instance ?? null);
	});

	$effect(() => {
		const { latestVersion, isCurrentVersionLatest, isCheckingForUpdates } = $updateStatusStore;
		if (isCheckingForUpdates || isCurrentVersionLatest || !latestVersion) return;

		// On a shared instance only an admin can act on this. A user would get a
		// notice about something they can't do anything about: the About tab still
		// lets them check by hand.
		if ($currentRole !== 'admin') return;

		// Read through `get` rather than `$settingsStore`: subscribing here would
		// make the write below re-run this effect.
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
	 * The server is now serving a build this client isn't running.
	 *
	 * Distinct from the release notice above: that one says a newer version exists
	 * somewhere, this one says the instance in front of you has already moved:
	 * after a `podman auto-update`, say, and everyone's tab is running yesterday's
	 * code until it reloads. It notifies rather than reloading on its own: a reload
	 * would take an unsent message or a running generation with it.
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
	 * Which of the two interfaces this account is on.
	 *
	 * The redirect lives here, at the one place both trees pass through, and it
	 * runs in both directions on the same rule: this interface is for a phone, so
	 * a phone with the setting on goes there and anything wider comes back. Not
	 * only when the setting changes, but whenever the window stops being a phone,
	 * which is what a dragged corner does.
	 *
	 * Nothing under `/m` reads any of this: an interface that has to check whether
	 * it is allowed on screen is one that will one day be on screen wrongly.
	 *
	 * And nothing here touches the OS chrome. The tint follows the theme, once,
	 * where it always did: a version of this that repainted it on every navigation
	 * cost the app its safe area on both interfaces, and it is not worth a second
	 * attempt for a strip four percent off.
	 */
	let onPhone = $state(false);

	/** Which shell to draw: the mobile tree brings its own. */
	const onMobileUi = $derived($page.url.pathname === '/m' || $page.url.pathname.startsWith('/m/'));

	$effect(() => {
		if (!browser) return;
		// A phone, not a small screen. 640 keeps tablets out, including the small
		// ones: an iPad mini is 744 points across and has room for the sidebar and a
		// conversation beside it, which is the whole argument for the other
		// interface.
		const query = window.matchMedia('(max-width: 640px)');
		onPhone = query.matches;
		const update = (event: MediaQueryListEvent) => (onPhone = event.matches);
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	$effect(() => {
		if (!booted) return;
		const path = $page.url.pathname;
		if (path === '/login') return;
		const belongsThere = $settingsStore.simplifiedMobileUI && onPhone;

		if (belongsThere && !onMobileUi) void goto(resolve('/m'));
		else if (!belongsThere && onMobileUi) void goto(resolve('/sessions'));
	});

	onNavigate(async () => {
		// Check for updates whenever the user follows a link (if auto-check is enabled)
		if (!($settingsStore.autoCheckForUpdates === false)) await checkForUpdates();

		// Close the mobile drawer on every navigation (standard drawer behaviour).
		mobileDrawerOpen.set(false);
	});

	/**
	 * Coming back to an app that never went away.
	 *
	 * A browser tab is opened, used and closed; an installed PWA is suspended and
	 * resumed for days without ever re-running its boot. Both things it reads once
	 * at startup (the stored conversations and the running build) can have moved
	 * on in the meantime, so both are checked here, on the way back in.
	 */
	/**
	 * ⌘K / Ctrl+K opens conversation search from anywhere.
	 *
	 * Ignored while typing: the shortcut belongs to the app, but a message being
	 * composed owns the keyboard first.
	 */
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
		// Open: a rightward swipe that begins just *inland* of the very edge. The first
		// ~20px belong to iOS's system back-swipe, so we start the open band past it to
		// avoid fighting the system gesture (the extreme edge is left to iOS).
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
	 * Repaint the strips the OS draws around the app.
	 *
	 * A browser tab picks up a new `content` on the existing tag, but the
	 * installed app reads that tag when it launches and then keeps the colour it
	 * got, which is why switching themes left the status bar on the old one until
	 * the app was killed. Replacing the whole node is what gets it read again.
	 */
	function setThemeColor(color: string) {
		for (const stale of document.querySelectorAll('meta[name="theme-color"]')) stale.remove();
		const meta = document.createElement('meta');
		meta.name = 'theme-color';
		meta.content = color;
		document.head.appendChild(meta);
	}

	/**
	 * The wallpaper as CSS, which is a pack entry's gradient or the user's own file.
	 *
	 * Resolved once, here, so that the attribute driving the shadows and the layer
	 * that paints the picture cannot disagree about whether there is one.
	 */
	const wallpaper = $derived(wallpaperImage($settingsStore.backgroundImage));

	$effect(() => {
		// A locked instance theme wins over the stored one rather than overwriting
		// it: unlock it later and everyone gets their own back, which is not true of
		// a policy that rewrote people's settings on its way through. An offered one
		// applies only until this account picks for itself.
		const sharing = data.instance?.themeSharing ?? 'off';
		const locked =
			sharing === 'locked' || (sharing === 'overridable' && !$settingsStore.themeChosen);
		const mode = (locked ? data.instance?.themeMode : $settingsStore.themeMode) || 'system';
		const style = (locked ? data.instance?.themeStyle : $settingsStore.themeStyle) || 'classic';

		document.documentElement.setAttribute('data-theme-style', style);

		// One number for the whole app: every translucent surface scales itself from
		// it rather than being told, so a panel rendered anywhere is already in the
		// right state. Switching the effect off is the attribute's job, not the
		// number's: the bottom of the slider is the thinnest surface, not the absence
		// of one, and only the attribute can also turn `backdrop-filter` off.
		const on = $settingsStore.surfaceTransparency !== false;
		// 50 is the reference the surfaces are drawn for, so it maps to 1 and the
		// slider reaches past it as well as below it.
		const strength = ($settingsStore.surfaceTransparencyLevel ?? 50) / 50;
		document.documentElement.style.setProperty('--surface-strength', String(on ? strength : 0));
		document.documentElement.setAttribute('data-transparency', on ? 'on' : 'off');

		// Drives the wallpaper's own layer and the shadow the columns need to read as
		// panels on a picture rather than as holes cut in it.
		document.documentElement.setAttribute('data-wallpaper', wallpaper ? 'on' : 'off');
		// Same shape as the surfaces above, and 50 means the same thing here: the
		// value the effect was drawn for, in the middle of its own track.
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

			// Keep the OS/browser chrome tint in sync with the live safe-area chrome
			// colour (shade-1), across all theme styles. Dracula, Catppuccin, …
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
		await loadServerPlaybooks();
		// The gallery's index, which is small by construction: the pictures
		// themselves are fetched one at a time by the page that shows them.
		await loadImages();

		// No personas are written at boot any more. They used to be built here and
		// pushed straight into the store, which made "shipped with the app" and
		// "installed by you" the same thing: the starters were in your library
		// whether you wanted them or not, and they went out in your backup as if you
		// had written them. They now live in the store the Library browses, and
		// nothing arrives until you install it.
		booted = true;

		// Language
		if (!$settingsStore.userLanguage)
			// `detectLocale` is generated from the installed locale folders, so a new
			// language is picked up here without touching this file.
			$settingsStore.userLanguage = detectLocale(navigatorDetector);

		loadLocale($settingsStore.userLanguage);
		setLocale($settingsStore.userLanguage);

		// Color theme
		if (browser && !$settingsStore.themeMode) {
			$settingsStore.themeMode = 'system';
		}

		// One first run, composed for whoever is in front of it: the tour asks for a
		// connection and a name only where they are missing and the person is
		// allowed to give them, and skips straight to the introduction otherwise.
		// Two flows used to answer the same question, and a new arrival walked
		// through setup did not then need to be shown around it.
		//
		// Shown again when an administrator says so, which is what the epoch is for:
		// each browser remembers the stamp it acknowledged, so a newer one plays the
		// tour once for everybody and then stops, with nothing tracking who saw what.
		const epoch = data.instance?.onboardingEpoch ?? 0;
		const seen = $settingsStore.onboardingEpochSeen ?? 0;

		if (env.PUBLIC_DISABLE_ONBOARDING !== 'true') {
			if (!$settingsStore.welcomeComplete || epoch > seen) $welcomeOpen = true;
		}

		// The web component is only ever loaded in the browser: it registers a custom
		// element, which is not a thing the server can do.
		void import('@khmyznikov/pwa-install');
	});

	/** Handed to the store so anything can ask for it, the sidebar entry included. */
	let pwaInstall: PwaInstallDialog | undefined = $state();

	/**
	 * The offer, once the component says there is one to make.
	 *
	 * On its event rather than on its `isInstallAvailable` property, which is the
	 * mistake worth not making twice: that property belongs to a Lit element, so
	 * reading it here creates no dependency and the answer is taken once, too early.
	 * Chromium settles it when the browser hands its prompt over, and Apple half a
	 * second after load, by which time an effect that ran at mount is long finished.
	 *
	 * Never over the first-run wizard: two dialogs on a first launch is one too
	 * many, and the app has not yet given anyone a reason to want it on their home
	 * screen. On a returning visit there is no wizard, so the offer is immediate.
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
	<!-- The dialogs belong to the account, not to a frame: both interfaces open the
	     same settings, the same search and the same library, so they are mounted
	     once, above the choice of shell. -->
	<SettingsModal />
	<SearchModal bind:open={$searchModalOpen} initialQuery={$searchModalQuery} />
	<KnowledgeModal />
	<Welcome />

	<!-- Held in manual mode, so it shows nothing of its own accord: when to ask is
	     the product's business, and it is decided above. The manifest is where it
	     reads the name, the description and the screenshots from, so the sheet it
	     draws is the same one Chromium draws natively. -->
	{#if browser && !isInstalled()}
		<pwa-install
			bind:this={pwaInstall}
			manual-apple
			manual-chrome
			manifest-url="/manifest.webmanifest"
		></pwa-install>
	{/if}

	{#if onMobileUi}
		<!-- The mobile interface brings its own frame, so it gets none of this one.
		     Nested inside it, as it was, the page carried a hidden sidebar, a chrome
		     header and the page card underneath itself: three layers with their own
		     heights, their own `overflow-hidden` and, in the installed app, their own
		     idea of what `100vh` means. A second interface is a second shell or it is
		     a skin, and this one is not a skin. -->
		{@render children()}
	{:else}
		<!-- bg-shade-1 on mobile so the notch + home-indicator safe strips are one
	     consistent chrome colour everywhere (native feel); shade-2 canvas on desktop. -->
		<!-- The wallpaper, when there is one, is painted by this box's own backdrop layer
	     and handed over as a custom property: a `filter` set here would blur the
	     application along with the picture. It shows through the margin this padding
	     leaves and the gap between the two columns. -->
		<div
			class="app-shell bg-shade-1 lg:bg-shade-2 relative flex w-full overflow-hidden lg:p-4 lg:pt-4 lg:pb-4"
			style={wallpaper ? `--wallpaper: ${wallpaper}` : ''}
		>
			<CollapsibleSidebar />
			<!-- The card runs the full height of the display, so its corners round on the
		     corners of the screen rather than somewhere below them.

		     It owes the safe areas nothing at either end. Content is meant to reach both
		     edges and pass under the status bar and the home indicator; that is what
		     makes an app read as native rather than as a page in a frame. What has to
		     stay legible are the bars over it, and each of those holds itself off the
		     edge on its own account. -->
			<!-- Content side = the top layer (iOS-style reveal). On mobile it's an opaque card
		     that slides right to uncover the stationary sidebar underneath; left-rounded
		     corners (matching the phone's screen radius) + a left-edge shadow make it read
		     as a sheet lifted above the menu. The rounding and the shadow are painted only
		     while it is open, and travel with the slide: a corner cut into a card that
		     covers the whole screen shows whatever is behind it, which with the drawer
		     shut is the page's own background in the corner of the screen.

		     With it open, what the corner shows is the column, and by construction
		     rather than by arrangement: the column paints the full width of the display
		     and only lays its contents out to `--drawer-w`, so the card slides onto its
		     own material and the notch cannot land past its edge. The shadow falls on
		     that same material, exactly as it does along the rest of the edge.
		     A no-op on desktop, where the sidebar lives in flow. -->
			<div
				class="app-card max-lg:bg-shade-1 relative z-10 flex min-w-0 flex-1 flex-col max-lg:overflow-hidden {$mobileDrawerOpen
					? 'max-lg:translate-x-[var(--drawer-w)] max-lg:rounded-l-[1.75rem] max-lg:shadow-[-8px_0_24px_-2px_rgba(0,0,0,0.25)]'
					: 'max-lg:shadow-[-8px_0_24px_-2px_rgba(0,0,0,0)]'}"
			>
				<!-- Each route now owns the single sidebar toggle at its top-left (inside its
			     header bar, or a blank MobileMenuBar on headerless pages), so there's no
			     extra top strip here. -->
				<div class="relative min-h-0 min-w-0 flex-1">
					{@render children()}
				</div>
				<!-- Scrim lives inside the sliding card, so it only dims the page (never the
			     revealed sidebar) and travels with it; tap anywhere on the page to close. -->
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
		/* Desktop: match bg-shade-2 (the app-shell canvas) so the rounded-corner
		   margins share one seamless background. */
		background-color: var(--color-shade-2);
		font-size: 1rem;
		line-height: 1.5rem;
		letter-spacing: normal;
	}

	/* Mobile: the app shell is shade-1, so the root background must match it, because the OS-managed
	   status-bar and home-indicator strips then blend in seamlessly. */
	@media (max-width: 1023px) {
		:global(html),
		:global(body) {
			background-color: var(--color-shade-1);
		}
	}

	/* Full-height app shell. In a browser tab `dvh` is the right unit: it tracks the
	   toolbars sliding in and out. */
	.app-shell {
		height: 100dvh;
	}

	/* The installed app is a different animal, and these numbers were measured on the
	   device rather than argued about.

	   Under the status bar, iOS moves the document up but leaves the layout viewport
	   at the height of the display minus the status bar: 812 against 874 on an iPhone
	   16 Pro. The document is drawn at the top, and the strip left over at the bottom
	   shows nothing at all, which is the white bar every guide to this warns about.

	   The cure is to give the document the height of the display and to stop it
	   scrolling. Sized but scrollable, it merely slides its own bottom off the screen
	   instead of filling the strip, which is what happened on the first attempt here.
	   `vh` is the only unit that knows the real number: `dvh`, `svh` and a plain
	   percentage all report the short one. */
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

<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import { toast, Toaster } from 'svelte-sonner';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { navigatorDetector } from 'typesafe-i18n/detectors';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import { detectLocale } from '$i18n/i18n-util';
	import { loadLocale } from '$i18n/i18n-util.sync';

	import '../app.pcss';

	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import { page, updated } from '$app/stores';
	import { isServerMode } from '$lib/chat/endpoint';
	import { loadServerChatDefaults } from '$lib/chatDefaults';
	import CollapsibleSidebar from '$lib/components/CollapsibleSidebar.svelte';
	import KnowledgeModal from '$lib/components/KnowledgeModal.svelte';
	import SearchModal from '$lib/components/SearchModal.svelte';
	import { ConnectionType, getDefaultServer } from '$lib/connections';
	import { buildDefaultPersonas } from '$lib/defaultPersonas';
	import { releaseUrl } from '$lib/github';
	import {
		installDialog,
		isInstalled,
		markInstallOffered,
		shouldOfferInstall,
		type PwaInstallDialog
	} from '$lib/install';
	import {
		hydrateStores,
		knowledgeStore,
		personasStore,
		refreshStores,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import { loadServerPersonas } from '$lib/personasConfig';
	import { loadServerSearch } from '$lib/search';
	import { currentRole, currentUser } from '$lib/stores/auth';
	import {
		onboardingOpen,
		openSearch,
		searchModalOpen,
		searchModalQuery,
		welcomeOpen
	} from '$lib/stores/modal';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';
	import { loadServerSystemPrompts } from '$lib/systemPrompts';
	import { checkForUpdates, updateStatusStore } from '$lib/updates';
	import { wallpaperImage } from '$lib/wallpapers';
	import { loadWebFetchConfig } from '$lib/webFetch';

	import type { LayoutData } from './$types';
	import Onboarding from './Onboarding.svelte';
	import SettingsModal from './settings/SettingsModal.svelte';
	import Welcome from './Welcome.svelte';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// In server mode, wait for the async hydration before rendering the app, so
	// pages always read fully-loaded stores (otherwise a refresh can show an
	// empty session until you navigate away and back). Local mode is ready now.
	let booted = $state(env.PUBLIC_MODE !== 'server');

	$effect(() => {
		currentUser.set(data.user);
	});

	const updateToastClasses = {
		toast: 'flex-col items-start gap-y-1 bg-shade-1 text-active border border-shade-3 pr-8',
		description: 'text-muted',
		actionButton: 'text-accent font-medium hover:underline',
		// The close button is the toast's first child, so the `flex-col` above would
		// stack it on top of the title. Taking it out of the flow puts it back in the
		// corner every other dialog in the app closes from.
		closeButton:
			'absolute! left-auto! right-1! top-1! translate-x-0! translate-y-0! border-0! bg-transparent! text-muted hover:text-active'
	};

	$effect(() => {
		const { latestVersion, isCurrentVersionLatest, isCheckingForUpdates } = $updateStatusStore;
		if (isCheckingForUpdates || isCurrentVersionLatest || !latestVersion) return;

		// On a shared instance only an admin can act on this. A user would get a
		// notice about something they can't do anything about — the About tab still
		// lets them check by hand.
		if (isServerMode && $currentRole !== 'admin') return;

		// Read through `get` rather than `$settingsStore`: subscribing here would
		// make the write below re-run this effect.
		if (get(settingsStore).notifiedUpdateVersion === latestVersion) return;
		settingsStore.update((settings) => ({ ...settings, notifiedUpdateVersion: latestVersion }));

		toast($LL.isLatestVersion(), {
			description: latestVersion,
			position: 'bottom-right',
			// It stays until dismissed: an update notice that disappears on its own
			// is one the user never had a chance to act on.
			duration: Number.POSITIVE_INFINITY,
			closeButton: true,
			action: {
				label: $LL.viewRelease(),
				onClick: () => window.open(releaseUrl(latestVersion), '_blank', 'noopener,noreferrer')
			},
			classes: updateToastClasses
		});
	});

	/**
	 * The server is now serving a build this client isn't running.
	 *
	 * Distinct from the release notice above: that one says a newer version exists
	 * somewhere, this one says the instance in front of you has already moved —
	 * after a `podman auto-update`, say — and everyone's tab is running yesterday's
	 * code until it reloads. It notifies rather than reloading on its own: a reload
	 * would take an unsent message or a running generation with it.
	 */
	let notifiedReload = false;
	$effect(() => {
		if (!$updated || notifiedReload) return;
		notifiedReload = true;

		toast($LL.isLatestVersion(), {
			position: 'bottom-right',
			duration: Number.POSITIVE_INFINITY,
			closeButton: true,
			action: {
				label: $LL.refreshToUpdate(),
				onClick: () => location.reload()
			},
			classes: updateToastClasses
		});
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
	 * at startup — the stored conversations and the running build — can have moved
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
		const mode = $settingsStore.themeMode || 'system';
		const style = $settingsStore.themeStyle || 'classic';

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
			// colour (shade-1), across all theme styles — Dracula, Catppuccin, …
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
		// Fill the stores from the repository (no-op in local mode, network load in server mode).
		await hydrateStores();
		await loadServerSearch();
		await loadWebFetchConfig();
		await loadServerSystemPrompts();
		await loadServerChatDefaults();
		await loadServerPersonas();

		// Seed the built-in starter personas, for admins (and local-mode users, who are
		// always admin of their own data). Idempotent by name: a newly-added default
		// backfills on next boot, but a starter the user deleted is never re-added.
		const isAdmin = env.PUBLIC_MODE === 'server' ? data.user?.role === 'admin' : true;
		if (isAdmin) {
			const seeded = [...($settingsStore.seededPersonaNames ?? [])];
			// Migrate the old boolean: prior seeding accounts for the original three.
			if ($settingsStore.defaultPersonasSeeded && seeded.length === 0) {
				seeded.push('Max', 'Lou', 'Nova');
			}
			const model = $settingsStore.defaultModel || $settingsStore.models[0]?.name || '';
			const allDefaults = buildDefaultPersonas(model);
			const missing = allDefaults.filter((p) => !seeded.includes(p.name));
			for (const persona of missing) personasStore.upsert(persona);
			for (const p of allDefaults) if (!seeded.includes(p.name)) seeded.push(p.name);
			$settingsStore.seededPersonaNames = seeded;
			$settingsStore.defaultPersonasSeeded = true;
		}

		booted = true;

		// Language
		if (!$settingsStore.userLanguage)
			// `detectLocale` is generated from the installed locale folders, so a new
			// language is picked up here without touching this file.
			$settingsStore.userLanguage = detectLocale(navigatorDetector);

		loadLocale($settingsStore.userLanguage);
		setLocale($settingsStore.userLanguage);

		// Migrate old server settings to new format (local mode only — legacy localStorage data)
		const settingsLocalStorage =
			env.PUBLIC_MODE !== 'server' ? localStorage.getItem(StorageKey.Preferences) : null;
		if (settingsLocalStorage) {
			const settings = JSON.parse(settingsLocalStorage);

			if (settings.ollamaServer || settings.openaiServer) {
				// Migrate Ollama server settings
				if (settings.ollamaServer) {
					console.warn('Migrating Ollama server settings');
					serversStore.update((servers) => [
						...servers,
						{
							...getDefaultServer(ConnectionType.Ollama),
							baseUrl: settings.ollamaServer
						}
					]);

					delete settings.ollamaServer;
					delete settings.ollamaModel;
					delete settings.ollamaServerStatus;
					delete settings.ollamaModels;
				}

				// Migrate OpenAI server settings
				if (settings.openaiServer) {
					console.warn('Migrating OpenAI server settings');
					serversStore.update((servers) => [
						...servers,
						{
							...getDefaultServer(ConnectionType.OpenAI),
							baseUrl: settings.openaiServer,
							apiKey: settings.openaiApiKey
						}
					]);

					delete settings.openaiServer;
					delete settings.openaiApiKey;
				}

				// Reset the settings store with the removed keys
				localStorage.removeItem(StorageKey.Preferences);
				settingsStore.set(settings);

				// Ask the user to re-verify the server connections
				toast.warning($LL.serverSettingsUpdated());
			}
		}

		// Color theme
		if (browser && !$settingsStore.themeMode) {
			$settingsStore.themeMode = 'system';
		}

		// Pre-configure an Ollama server from env on a fresh local install, for
		// reproducible deployments (only when no server exists yet).
		const ollamaUrl = env.PUBLIC_OLLAMA_URL;
		if (env.PUBLIC_MODE !== 'server' && ollamaUrl && $serversStore.length === 0) {
			serversStore.update((servers) => [
				...servers,
				{ ...getDefaultServer(ConnectionType.Ollama), baseUrl: ollamaUrl, isEnabled: true }
			]);
		}

		// First-run onboarding: local mode only, can be disabled via env, and only
		// when there is truly no data yet.
		if (
			env.PUBLIC_MODE !== 'server' &&
			env.PUBLIC_DISABLE_ONBOARDING !== 'true' &&
			!$settingsStore.onboardingComplete &&
			$serversStore.length === 0 &&
			$sessionsStore.length === 0 &&
			$knowledgeStore.length === 0 &&
			!$settingsStore.profileFirstName &&
			!$settingsStore.profileLastName
		) {
			$onboardingOpen = true;
		}

		// Server mode has no first-run wizard (the account and its profile are
		// provisioned for the user), so new users get the welcome tour instead —
		// once, on their first connection.
		if (
			env.PUBLIC_MODE === 'server' &&
			env.PUBLIC_DISABLE_ONBOARDING !== 'true' &&
			!$settingsStore.welcomeComplete
		) {
			$welcomeOpen = true;
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
			if (get(onboardingOpen) || get(welcomeOpen)) return;
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

<Toaster
	toastOptions={{
		unstyled: true,
		classes: {
			toast:
				'shadow-xl px-4 py-3 flex items-center gap-x-3 max-w-full w-full rounded mx-auto text-xs mx-0',
			loading: 'bg-shade-0',
			error: 'text-red-50 bg-red-700',
			success: 'text-emerald-50 bg-emerald-700',
			warning: 'text-yellow-50 bg-yellow-700',
			info: 'bg-shade-1 text-muted'
		}
	}}
	position="top-center"
/>

<!-- Global drawer swipe gestures (mobile). -->
<svelte:window ontouchstart={onTouchStart} ontouchend={onTouchEnd} />

{#if $page.url.pathname === '/login'}
	<!-- Login renders standalone, without the app shell. -->
	{@render children()}
{:else if !booted}
	<div class="flex h-dvh w-screen items-center justify-center bg-shade-2">
		<LoaderCircle class="h-6 w-6 animate-spin text-muted" />
	</div>
{:else}
	<SettingsModal />
	<SearchModal bind:open={$searchModalOpen} initialQuery={$searchModalQuery} />
	<KnowledgeModal />
	<Onboarding />
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

	<!-- bg-shade-1 on mobile so the notch + home-indicator safe strips are one
	     consistent chrome colour everywhere (native feel); shade-2 canvas on desktop. -->
	<!-- The wallpaper, when there is one, is painted by this box's own backdrop layer
	     and handed over as a custom property: a `filter` set here would blur the
	     application along with the picture. It shows through the margin this padding
	     leaves and the gap between the two columns. -->
	<div
		class="app-shell relative flex w-full overflow-hidden bg-shade-1 lg:bg-shade-2 lg:p-4 lg:pb-4 lg:pt-4"
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
			class="app-card relative z-10 flex min-w-0 flex-1 flex-col max-lg:overflow-hidden max-lg:bg-shade-1 {$mobileDrawerOpen
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

<style lang="postcss">
	:global(html) {
		/* Desktop: match bg-shade-2 (the app-shell canvas) so the rounded-corner
		   margins share one seamless background. */
		background-color: var(--color-shade-2);
		font-size: 1rem;
		line-height: 1.5rem;
		letter-spacing: normal;
	}

	/* Mobile: the app shell is shade-1, so the root background must match it — the OS-managed
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

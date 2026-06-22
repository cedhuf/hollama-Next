<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import { toast, Toaster } from 'svelte-sonner';
	import { fade } from 'svelte/transition';
	import { detectLocale, navigatorDetector } from 'typesafe-i18n/detectors';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import { loadLocale } from '$i18n/i18n-util.sync';

	import '../app.pcss';

	import type { Locales } from '$i18n/i18n-types';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { loadServerChatDefaults } from '$lib/chatDefaults';
	import CollapsibleSidebar from '$lib/components/CollapsibleSidebar.svelte';
	import { ConnectionType, getDefaultServer } from '$lib/connections';
	import { buildDefaultPersonas } from '$lib/defaultPersonas';
	import {
		hydrateStores,
		knowledgeStore,
		personasStore,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import { loadServerPersonas } from '$lib/personasConfig';
	import { loadServerSearch } from '$lib/search';
	import { currentUser } from '$lib/stores/auth';
	import { onboardingOpen } from '$lib/stores/modal';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';
	import { loadServerSystemPrompts } from '$lib/systemPrompts';
	import { checkForUpdates } from '$lib/updates';

	import type { LayoutData } from './$types';
	import Onboarding from './Onboarding.svelte';
	import SettingsModal from './settings/SettingsModal.svelte';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// In server mode, wait for the async hydration before rendering the app, so
	// pages always read fully-loaded stores (otherwise a refresh can show an
	// empty session until you navigate away and back). Local mode is ready now.
	let booted = $state(env.PUBLIC_MODE !== 'server');

	$effect(() => {
		currentUser.set(data.user);
	});

	onNavigate(async () => {
		// Check for updates whenever the user follows a link (if auto-check is enabled)
		if (!($settingsStore.autoCheckForUpdates === false)) await checkForUpdates();

		// Close the mobile drawer on every navigation (standard drawer behaviour).
		mobileDrawerOpen.set(false);
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

	$effect(() => {
		const mode = $settingsStore.themeMode || 'system';
		const style = $settingsStore.themeStyle || 'classic';

		document.documentElement.setAttribute('data-theme-style', style);

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
				const meta = document.querySelector('meta[name="theme-color"]');
				const chrome = getComputedStyle(document.documentElement)
					.getPropertyValue('--color-shade-1')
					.trim();
				if (meta && chrome) meta.setAttribute('content', chrome);
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
			if (missing.length) personasStore.set([...($personasStore ?? []), ...missing]);
			for (const p of allDefaults) if (!seeded.includes(p.name)) seeded.push(p.name);
			$settingsStore.seededPersonaNames = seeded;
			$settingsStore.defaultPersonasSeeded = true;
		}

		booted = true;

		// Language
		if (!$settingsStore.userLanguage)
			$settingsStore.userLanguage = detectLocale(
				'en',
				['en', 'de', 'zh-cn', 'es', 'fr', 'pt-br', 'ja', 'tr', 'vi'],
				navigatorDetector
			) as Locales;

		loadLocale($settingsStore.userLanguage);
		setLocale($settingsStore.userLanguage);

		// Migrate old server settings to new format (local mode only — legacy localStorage data)
		const settingsLocalStorage =
			env.PUBLIC_MODE !== 'server' ? localStorage.getItem(StorageKey.HollamaNextPreferences) : null;
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
				localStorage.removeItem(StorageKey.HollamaNextPreferences);
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
	<Onboarding />

	<!-- bg-shade-1 on mobile so the notch + home-indicator safe strips are one
	     consistent chrome colour everywhere (native feel); shade-2 canvas on desktop. -->
	<div
		class="app-shell relative flex w-full overflow-hidden bg-shade-1 lg:bg-shade-2 lg:p-4 lg:pb-4 lg:pt-4"
	>
		<CollapsibleSidebar />
		<!-- Content side = the top layer (iOS-style reveal). On mobile it's an opaque card
		     that slides right to uncover the stationary sidebar underneath; left-rounded
		     corners (matching the phone's screen radius) + a left-edge shadow make it read
		     as a sheet lifted above the menu. The shadow is only painted while open and
		     fades with the slide — otherwise it would bleed through the rounded corner
		     notch and reveal the rounding even when the page covers the whole screen.
		     A no-op on desktop, where the sidebar lives in flow. -->
		<div
			class="relative z-10 flex min-w-0 flex-1 flex-col transition-all duration-200 ease-in-out max-lg:overflow-hidden max-lg:rounded-l-[1.75rem] max-lg:bg-shade-1 {$mobileDrawerOpen
				? 'max-lg:translate-x-[min(84vw,22rem)] max-lg:shadow-[-8px_0_24px_-2px_rgba(0,0,0,0.25)]'
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

	/* Full-height app shell — the same model as desktop, just responsive. No viewport-fit=cover,
	   so iOS keeps the web view inside the safe area itself and handles the keyboard natively;
	   `dvh` already tracks the dynamic viewport (browser toolbars) without any JS. */
	.app-shell {
		height: 100dvh;
	}
</style>

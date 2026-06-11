<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import { toast, Toaster } from 'svelte-sonner';
	import { detectLocale, navigatorDetector } from 'typesafe-i18n/detectors';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import { loadLocale } from '$i18n/i18n-util.sync';

	import '../app.pcss';

	import type { Locales } from '$i18n/i18n-types';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import CollapsibleSidebar from '$lib/components/CollapsibleSidebar.svelte';
	import { ConnectionType, getDefaultServer } from '$lib/connections';
	import {
		hydrateStores,
		knowledgeStore,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import { onboardingOpen } from '$lib/stores/modal';
	import { checkForUpdates } from '$lib/updates';

	import Onboarding from './Onboarding.svelte';
	import SettingsModal from './settings/SettingsModal.svelte';

	let { children }: { children: Snippet } = $props();

	onNavigate(async (navigation) => {
		// Check for updates whenever the user follows a link (if auto-check is enabled)
		if (!($settingsStore.autoCheckForUpdates === false)) await checkForUpdates();

		// Auto-collapse sidebar on mobile when navigating (except for exact /sessions and /knowledge)
		if (browser && window.innerWidth < 1024) {
			const pathname = navigation.to?.url.pathname;
			if (pathname && pathname !== '/sessions' && pathname !== '/knowledge') {
				$settingsStore.sidebarExpanded = false;
			}
		}
	});

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

<SettingsModal />
<Onboarding />

<div class="relative flex h-dvh w-screen bg-shade-2 lg:p-4">
	<CollapsibleSidebar />
	<div class="relative flex-1">
		<!-- Mobile-only trigger to reopen the sidebar drawer (sits in the header's left gutter) -->
		{#if !$settingsStore.sidebarExpanded}
			<button
				onclick={() => ($settingsStore.sidebarExpanded = true)}
				class="absolute left-3 top-3 z-10 rounded-lg border bg-shade-1 p-2 text-muted shadow-sm transition-colors hover:text-active lg:hidden"
				aria-label={$LL.expandSidebar()}
				title={$LL.expandSidebar()}
			>
				<PanelLeft class="h-5 w-5" />
			</button>
		{/if}
		{@render children()}
	</div>
</div>

<style lang="postcss">
	:global(html) {
		position: fixed;
		background-color: var(--color-shade-0);
		font-size: 1rem;
		line-height: 1.5rem;
		letter-spacing: normal;
	}

	@media (width >= 64rem) {
		:global(html) {
			background-color: var(--color-shade-2);
		}
	}
</style>

<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { settingsStore } from '$lib/localStorage';

	/** Writes straight to the settings store, so every change applies live and persists on its own. Shared by the Interface panel and the welcome tour. */
	const themeModes = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon }
	] as const;

	/** Each style carries both ramps, and the preview shows the one the app is wearing: hardcoding a single set advertised a mix of light and dark palettes whatever the mode. Values mirror the `--hsl-*` blocks in `app.pcss`. */
	const themeStyles = [
		{
			value: 'classic',
			label: 'Classic',
			light: {
				bg: '#ebebeb',
				sidebar: '#f5f5f5',
				accent: '#eb6d47',
				text: '#0d0d0d',
				muted: '#808080'
			},
			dark: {
				bg: '#1a1a1a',
				sidebar: '#242424',
				accent: '#eb6d47',
				text: '#f2f2f2',
				muted: '#808080'
			}
		},
		{
			value: 'dracula',
			label: 'Dracula',
			light: {
				bg: '#f2f2ea',
				sidebar: '#fdfdf7',
				accent: '#ff79c6',
				text: '#282a36',
				muted: '#6272a4'
			},
			dark: {
				bg: '#282a36',
				sidebar: '#1e1f29',
				accent: '#ff79c6',
				text: '#f8f8f2',
				muted: '#6272a4'
			}
		},
		{
			value: 'catppuccin',
			label: 'Catppuccin',
			light: {
				bg: '#e6e9ef',
				sidebar: '#eff1f5',
				accent: '#cba6f7',
				text: '#4c4f69',
				muted: '#7c7f93'
			},
			dark: {
				bg: '#1e1e2e',
				sidebar: '#181825',
				accent: '#cba6f7',
				text: '#cdd6f4',
				muted: '#6c7086'
			}
		},
		{
			value: 'gruvbox',
			label: 'Gruvbox',
			light: {
				bg: '#f2e5bc',
				sidebar: '#fbf1c7',
				accent: '#d65d0e',
				text: '#282828',
				muted: '#7c6f64'
			},
			dark: {
				bg: '#282828',
				sidebar: '#1d2021',
				accent: '#fe8019',
				text: '#ebdbb2',
				muted: '#7c6f64'
			}
		},
		{
			value: 'nord',
			label: 'Nord',
			light: {
				bg: '#e5e9f0',
				sidebar: '#eceff4',
				accent: '#5e81ac',
				text: '#2e3440',
				muted: '#4c566a'
			},
			dark: {
				bg: '#2e3440',
				sidebar: '#272c36',
				accent: '#88c0d0',
				text: '#d8dee9',
				muted: '#4c566a'
			}
		},
		{
			value: 'solarized',
			label: 'Solarized',
			light: {
				bg: '#eee8d5',
				sidebar: '#fdf6e3',
				accent: '#268bd2',
				text: '#073642',
				muted: '#839496'
			},
			dark: {
				bg: '#002b36',
				sidebar: '#073642',
				accent: '#268bd2',
				text: '#93a1a1',
				muted: '#586e75'
			}
		}
	] as const;

	// `system` follows the OS, so the previews follow it too, including when it
	// flips while the panel is open.
	let systemPrefersDark = $state(false);

	$effect(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		systemPrefersDark = query.matches;
		const onChange = (event: MediaQueryListEvent) => (systemPrefersDark = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	const mode = $derived($settingsStore.themeMode || 'system');

	/** An instance can hand out a starting theme without fixing it, and that offer stops the moment someone chooses for themselves, including choosing what they were being given. */
	function chooseMode(value: (typeof themeModes)[number]['value']) {
		$settingsStore.themeMode = value;
		$settingsStore.themeChosen = true;
	}

	function chooseStyle(value: (typeof themeStyles)[number]['value']) {
		$settingsStore.themeStyle = value;
		$settingsStore.themeChosen = true;
	}
	const isDark = $derived(mode === 'dark' || (mode === 'system' && systemPrefersDark));
</script>

<!-- Theme mode: segmented control -->
<div class="flex flex-col gap-1.5">
	<span class="text-sm font-medium">{$LL.theme()}</span>
	<div class="border-shade-3 bg-shade-0 inline-flex gap-1 rounded-lg border p-1">
		{#each themeModes as themeMode (themeMode.value)}
			{@const Icon = themeMode.icon}
			<button
				type="button"
				onclick={() => chooseMode(themeMode.value)}
				class="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors
					{mode === themeMode.value ? 'bg-shade-2 text-active shadow-sm' : 'text-muted hover:text-active'}"
			>
				<Icon class="h-4 w-4" />
				{themeMode.label}
			</button>
		{/each}
	</div>
</div>

<!-- Theme style: mini-preview cards -->
<div class="flex flex-col gap-1.5">
	<span class="text-sm font-medium">{$LL.themeStyle()}</span>
	<!-- Three per row at most, so the preview cards keep a usable size. -->
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
		{#each themeStyles as style (style.value)}
			{@const swatch = isDark ? style.dark : style.light}
			<button
				type="button"
				onclick={() => chooseStyle(style.value)}
				class="flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors
					{$settingsStore.themeStyle === style.value
					? 'border-accent bg-shade-1'
					: 'border-shade-3 bg-shade-0 hover:bg-shade-1'}"
			>
				<!-- Mini chat app preview -->
				<div class="flex w-full overflow-hidden rounded-md" style="background:{swatch.bg}">
					<div class="flex w-1/3 flex-col gap-1 p-1.5" style="background:{swatch.sidebar}">
						<div class="h-1 w-3/4 rounded" style="background:{swatch.muted}"></div>
						<div class="h-1 w-1/2 rounded" style="background:{swatch.muted}"></div>
						<div class="h-1 w-2/3 rounded" style="background:{swatch.muted}"></div>
					</div>
					<div class="flex flex-1 flex-col gap-1 p-1.5">
						<div class="h-1.5 w-3/4 rounded" style="background:{swatch.text}"></div>
						<div class="self-end rounded-sm px-1 py-0.5" style="background:{swatch.accent}">
							<div class="h-1 w-6 rounded" style="background:rgba(255,255,255,0.7)"></div>
						</div>
					</div>
				</div>
				<span class="text-xs font-medium">{style.label}</span>
			</button>
		{/each}
	</div>
</div>

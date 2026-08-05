<script lang="ts">
	import { onMount } from 'svelte';

	import { settingsStore } from '$lib/localStorage';

	/**
	 * A code editor, loaded only if someone asks for one.
	 *
	 * CodeMirror is 124 kB compressed, which is a lot to hand every visitor for a
	 * field most of them will write prose in. So it is imported on mount, and this
	 * component is only ever mounted by the tab that wants it: the plain textarea
	 * beside it costs nothing and covers the common case.
	 *
	 * Line numbers, bracket matching and a monospace grid earn their keep when the
	 * collection holds a schema, a config file or a snippet, which is exactly when
	 * a soft-wrapped textarea stops being readable.
	 */
	interface Props {
		value: string;
		/** Fired on Mod+Enter, so the dialog's shortcut still works inside the editor. */
		onSubmit?: () => void;
	}

	let { value = $bindable(), onSubmit }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);

	const isDark = $derived(
		$settingsStore.themeMode === 'dark' ||
			($settingsStore.themeMode === 'system' &&
				typeof window !== 'undefined' &&
				window.matchMedia('(prefers-color-scheme: dark)').matches)
	);

	onMount(() => {
		let view: { destroy: () => void } | null = null;
		let cancelled = false;

		void (async () => {
			// One import for the four packages: they are a single dependency graph, so
			// splitting them would only add round trips.
			const [{ basicSetup }, { EditorView, keymap }, { Prec }, { createTheme }] = await Promise.all(
				[
					import('codemirror'),
					import('@codemirror/view'),
					import('@codemirror/state'),
					import('thememirror')
				]
			);
			if (cancelled || !container) return;

			// Colours come from the app's own tokens rather than from a packaged theme,
			// so the editor follows whichever of the twelve ramps is on.
			const styles = getComputedStyle(document.documentElement);
			const token = (name: string) => styles.getPropertyValue(name).trim();
			const theme = createTheme({
				variant: isDark ? 'dark' : 'light',
				settings: {
					background: token('--color-shade-0') || (isDark ? '#1e1e1e' : '#ffffff'),
					foreground: token('--color-active') || (isDark ? '#c0c0c0' : '#333333'),
					caret: token('--color-accent') || '#f97316',
					selection: token('--color-shade-2') || '#e5e5e5',
					lineHighlight: 'transparent',
					gutterBackground: 'transparent',
					gutterForeground: token('--color-muted') || '#9ca3af'
				},
				styles: []
			});

			view = new EditorView({
				doc: value,
				extensions: [
					basicSetup,
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) value = update.state.doc.toString();
					}),
					// Wins over CodeMirror's own binding, which would otherwise insert a
					// newline and swallow the dialog's save shortcut.
					Prec.highest(
						keymap.of([
							{
								key: 'Mod-Enter',
								run: () => {
									onSubmit?.();
									return true;
								}
							}
						])
					),
					theme,
					EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } })
				],
				parent: container
			});
		})();

		return () => {
			cancelled = true;
			view?.destroy();
		};
	});
</script>

<div
	class="code-editor min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-shade-3 bg-shade-0 text-sm focus-within:border-accent"
	bind:this={container}
	data-testid="code-editor"
></div>

<style>
	.code-editor :global(.cm-editor) {
		height: 100%;
	}

	.code-editor :global(.cm-editor.cm-focused) {
		outline: none;
	}

	.code-editor :global(.cm-gutters) {
		border-right: none;
	}
</style>

<script lang="ts">
	import { ImagePlus, Pencil, Trash2 } from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';

	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import { personaGlyph, type PersonaGlyph } from '$lib/personaGlyphs';

	/**
	 * A circular avatar that opens its own edit menu: colour swatches while there is
	 * no picture, replace and remove once there is one. Shared by the user profile
	 * and the persona editor, which had grown identical copies of it.
	 *
	 * It also draws a glyph, and had to: the faces were readable everywhere a
	 * persona appeared *except* in the editor, which fell back to initials. Callers
	 * with no glyphs to offer pass none, and the section is not there.
	 */
	interface Props {
		/** Image data URI (or URL). Empty means "show initials on `color`". */
		image?: string;
		color: string;
		initials: string;
		colors: readonly string[];
		/** Id of the chosen glyph, drawn when there is no picture. */
		glyph?: string;
		/** The glyphs on offer. Empty (the default) leaves the section out entirely. */
		glyphs?: readonly PersonaGlyph[];
		size?: number;
		/** Read-only rendering: no menu, no hover affordance (e.g. OIDC-managed). */
		readonly?: boolean;
		label?: string;
		onColorChange?: (color: string) => void;
		onGlyphChange?: (glyph: string | undefined) => void;
		onImageChange?: (dataUrl: string) => void;
		onImageRemove?: () => void;
	}

	let {
		image = '',
		color,
		initials,
		colors,
		glyph,
		glyphs = [],
		size = 64,
		readonly = false,
		label = 'Avatar',
		onColorChange,
		onGlyphChange,
		onImageChange,
		onImageRemove
	}: Props = $props();

	const chosen = $derived(personaGlyph(glyph));

	function uploadImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/png,image/jpeg,image/webp';
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (e) => onImageChange?.(e.target?.result as string);
			reader.readAsDataURL(file);
		};
		input.click();
	}
</script>

<!-- Three faces, in the order they win, and the order `PersonaAvatar` uses: an
     uploaded picture, a glyph the app draws, the initials.

     `{@html}` is safe here for the reason it is safe there: what it renders is
     never a stored value, it is the body of an entry in our own table. -->
{#snippet face()}
	{#if image}
		<img src={image} alt={label} class="h-full w-full object-cover" />
	{:else if chosen}
		<svg
			viewBox="0 0 64 64"
			class="text-shade-0 h-full w-full"
			style="--persona-glyph-cut:{color}"
			role="presentation"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html chosen.body}
		</svg>
	{:else}
		{initials}
	{/if}
{/snippet}

<!-- One tile of the face grid, drawn on the avatar's own colour so the choice is
     made against the disc it will sit on. -->
{#snippet tile(body: string | undefined, id: string | undefined, name: string)}
	<button
		type="button"
		aria-label={name}
		title={name}
		onclick={() => onGlyphChange?.(id)}
		class="ring-offset-shade-0 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white ring-2 ring-offset-2 transition-all {glyph ===
		id
			? 'ring-accent'
			: 'hover:ring-shade-4 ring-transparent'}"
		style="background-color:{color};--persona-glyph-cut:{color}"
	>
		{#if body}
			<svg viewBox="0 0 64 64" class="text-shade-0 h-full w-full" role="presentation">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html body}
			</svg>
		{:else}
			{initials}
		{/if}
	</button>
{/snippet}

{#if readonly}
	<div
		class="ring-shade-3 flex items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2"
		style="width:{size}px;height:{size}px;background-color:{color};font-size:{Math.round(
			size * 0.31
		)}px"
	>
		{@render face()}
	</div>
{:else}
	<Menu align="start" class="w-52">
		{#snippet trigger({ props })}
			<button
				{...props}
				type="button"
				title="Edit avatar"
				aria-label="Edit avatar"
				class="group ring-shade-3 relative flex items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2"
				style="width:{size}px;height:{size}px;background-color:{color};font-size:{Math.round(
					size * 0.31
				)}px"
			>
				{@render face()}
				<span
					class="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
				>
					<Pencil class="h-4 w-4" />
				</span>
			</button>
		{/snippet}

		{#if image}
			<MenuItem icon={ImagePlus} onclick={uploadImage}>Replace picture</MenuItem>
			<MenuItem icon={Trash2} onclick={() => onImageRemove?.()}>Remove picture</MenuItem>
		{:else}
			<!-- Swatches are a grid, not menu rows: kept out of the roving-focus list so the
			     arrow keys still walk the actions below. -->
			<div class="grid grid-cols-4 gap-2 p-1">
				{#each colors as swatch (swatch)}
					<button
						type="button"
						aria-label="Choose avatar colour"
						onclick={() => onColorChange?.(swatch)}
						class="ring-offset-shade-0 h-8 w-8 rounded-full ring-2 ring-offset-2 transition-all {color ===
						swatch
							? 'ring-accent'
							: 'hover:ring-shade-4 ring-transparent'}"
						style="background-color: {swatch}"
					></button>
				{/each}
			</div>
			{#if glyphs.length}
				<DropdownMenu.Separator class="border-shade-2 my-1 border-t" />
				<!-- Scrolls rather than growing the menu: the table of faces is meant to get
				     longer, and a menu as tall as the window has a bottom you cannot reach. -->
				<div class="grid max-h-36 grid-cols-4 gap-2 overflow-y-auto p-1">
					{@render tile(undefined, undefined, 'Initials')}
					{#each glyphs as option (option.id)}
						{@render tile(option.body, option.id, option.label)}
					{/each}
				</div>
			{/if}
			<DropdownMenu.Separator class="border-shade-2 my-1 border-t" />
			<MenuItem icon={ImagePlus} onclick={uploadImage}>Upload a picture</MenuItem>
		{/if}
	</Menu>
{/if}

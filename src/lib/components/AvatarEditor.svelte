<script lang="ts">
	import { ImagePlus, Pencil, Trash2 } from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';

	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';

	/**
	 * Circular avatar that opens its own edit menu: colour swatches while there is
	 * no picture, replace/remove once there is one. Shared by the user profile and
	 * the persona editor, which had grown identical copies of it.
	 */
	interface Props {
		/** Image data URI (or URL). Empty means "show initials on `color`". */
		image?: string;
		color: string;
		initials: string;
		colors: readonly string[];
		size?: number;
		/** Read-only rendering — no menu, no hover affordance (e.g. OIDC-managed). */
		readonly?: boolean;
		label?: string;
		onColorChange?: (color: string) => void;
		onImageChange?: (dataUrl: string) => void;
		onImageRemove?: () => void;
	}

	let {
		image = '',
		color,
		initials,
		colors,
		size = 64,
		readonly = false,
		label = 'Avatar',
		onColorChange,
		onImageChange,
		onImageRemove
	}: Props = $props();

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

{#snippet face()}
	{#if image}
		<img src={image} alt={label} class="h-full w-full object-cover" />
	{:else}
		{initials}
	{/if}
{/snippet}

{#if readonly}
	<div
		class="flex items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2 ring-shade-3"
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
				class="group relative flex items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2 ring-shade-3"
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
			<!-- Swatches are a grid, not menu rows: kept out of the roving-focus list so
			     arrow keys still walk the actions below. -->
			<div class="grid grid-cols-4 gap-2 p-1">
				{#each colors as swatch (swatch)}
					<button
						type="button"
						aria-label="Choose avatar colour"
						onclick={() => onColorChange?.(swatch)}
						class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-shade-0 transition-all {color ===
						swatch
							? 'ring-accent'
							: 'ring-transparent hover:ring-shade-4'}"
						style="background-color: {swatch}"
					></button>
				{/each}
			</div>
			<DropdownMenu.Separator class="my-1 border-t border-shade-2" />
			<MenuItem icon={ImagePlus} onclick={uploadImage}>Upload a picture</MenuItem>
		{/if}
	</Menu>
{/if}

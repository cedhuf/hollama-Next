/**
 * The wallpapers the app ships with.
 *
 * Two kinds, on purpose. The photographs are what most people actually want
 * behind an application; the gradients are there because they cost a dozen bytes
 * to store, never look soft on a large display, and cannot be got wrong at any
 * size.
 *
 * Both are handed over as a CSS `background-image`, so the layer that paints the
 * wallpaper never learns which kind it was given.
 *
 * The names are proper nouns, the way the theme styles are, so they stay put in
 * every language.
 */
export interface Wallpaper {
	/** Stored as `pack:<id>`, so the setting stays a handful of bytes. */
	id: string;
	name: string;
	/** A CSS `background-image` value. */
	image: string;
	/**
	 * What the picker draws instead, where the full-size one would be a waste.
	 *
	 * A tile is eighty pixels wide. Opening the settings should not fetch a
	 * megabyte of photographs to fill a row of stamps.
	 */
	thumb?: string;
}

/** Marks a stored value as one of ours. Anything else is the user's own file. */
export const PACK_PREFIX = 'pack:';

/**
 * The ceiling on an imported picture.
 *
 * Settings travel, and an import is kept as a data URL, which is the encoding
 * tax on top: three megabytes of JPEG land as four of base64 in a store that is
 * synchronised whole. The limit is on the file rather than on its dimensions
 * because that is the number the user can see before choosing.
 */
export const CUSTOM_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Pixabay, under their Content License, which asks for no attribution. Credited
 * in `static/wallpapers/CREDITS.md` regardless.
 *
 * Encoded at 1600px and no wider, which is generous rather than tight: the
 * picture is blurred before it is ever shown, so what a larger file would carry
 * is detail that gets destroyed on the way to the screen.
 */
function photo(id: string, name: string): Wallpaper {
	return {
		id,
		name,
		image: `url(/wallpapers/${id}.webp)`,
		thumb: `url(/wallpapers/${id}-thumb.webp)`
	};
}

export const WALLPAPERS: Wallpaper[] = [
	photo('ridge', 'Ridge'),
	photo('storm', 'Storm'),
	photo('ocean', 'Ocean'),
	photo('nebula', 'Nebula'),
	photo('flames', 'Flames'),
	photo('summit', 'Summit'),
	photo('sandstone', 'Sandstone'),
	photo('autumn', 'Autumn'),
	{
		id: 'aurora',
		name: 'Aurora',
		image: [
			'radial-gradient(at 12% 18%, #22d3a5 0%, transparent 52%)',
			'radial-gradient(at 82% 8%, #7c3aed 0%, transparent 55%)',
			'radial-gradient(at 58% 88%, #0ea5e9 0%, transparent 50%)',
			'linear-gradient(160deg, #0b1a2b 0%, #142c4a 100%)'
		].join(', ')
	},
	{
		id: 'ember',
		name: 'Ember',
		image: [
			'radial-gradient(at 18% 82%, #f97316 0%, transparent 52%)',
			'radial-gradient(at 76% 22%, #ef4444 0%, transparent 50%)',
			'radial-gradient(at 40% 12%, #a21caf 0%, transparent 55%)',
			'linear-gradient(200deg, #2a0a12 0%, #451021 100%)'
		].join(', ')
	},
	{
		id: 'lagoon',
		name: 'Lagoon',
		image: [
			'radial-gradient(at 14% 26%, #22d3ee 0%, transparent 50%)',
			'radial-gradient(at 84% 74%, #14b8a6 0%, transparent 52%)',
			'radial-gradient(at 62% 12%, #3b82f6 0%, transparent 48%)',
			'linear-gradient(170deg, #062a3d 0%, #0b3f52 100%)'
		].join(', ')
	},
	{
		id: 'dusk',
		name: 'Dusk',
		image: [
			'radial-gradient(at 22% 84%, #fb923c 0%, transparent 52%)',
			'radial-gradient(at 70% 78%, #f472b6 0%, transparent 50%)',
			'radial-gradient(at 46% 10%, #6366f1 0%, transparent 58%)',
			'linear-gradient(190deg, #2b1240 0%, #17103a 100%)'
		].join(', ')
	},
	{
		id: 'meadow',
		name: 'Meadow',
		image: [
			'radial-gradient(at 16% 20%, #84cc16 0%, transparent 50%)',
			'radial-gradient(at 80% 30%, #facc15 0%, transparent 48%)',
			'radial-gradient(at 52% 92%, #22c55e 0%, transparent 54%)',
			'linear-gradient(165deg, #0d2818 0%, #123a20 100%)'
		].join(', ')
	},
	{
		id: 'cobalt',
		name: 'Cobalt',
		image: [
			'radial-gradient(at 10% 12%, #2563eb 0%, transparent 54%)',
			'radial-gradient(at 88% 40%, #06b6d4 0%, transparent 48%)',
			'radial-gradient(at 44% 90%, #4f46e5 0%, transparent 56%)',
			'linear-gradient(175deg, #071236 0%, #0d1c4f 100%)'
		].join(', ')
	},
	{
		id: 'coral',
		name: 'Coral',
		image: [
			'radial-gradient(at 18% 22%, #fb7185 0%, transparent 52%)',
			'radial-gradient(at 82% 16%, #f59e0b 0%, transparent 48%)',
			'radial-gradient(at 64% 88%, #f472b6 0%, transparent 52%)',
			'linear-gradient(160deg, #fde5d9 0%, #f7c9c0 100%)'
		].join(', ')
	},
	{
		id: 'graphite',
		name: 'Graphite',
		image: [
			'radial-gradient(at 24% 16%, #4b5563 0%, transparent 55%)',
			'radial-gradient(at 78% 82%, #6366f1 0%, transparent 45%)',
			'radial-gradient(at 90% 8%, #64748b 0%, transparent 50%)',
			'linear-gradient(180deg, #14161a 0%, #22262e 100%)'
		].join(', ')
	}
];

/**
 * What the setting means, as a `background-image`.
 *
 * Empty for no wallpaper, and empty too for a pack entry that no longer exists,
 * so that a setting written by a later version degrades into no picture instead
 * of into a blank one drawn as though there were.
 */
export function wallpaperImage(value: string): string {
	if (!value) return '';
	if (!value.startsWith(PACK_PREFIX)) return `url(${value})`;
	const id = value.slice(PACK_PREFIX.length);
	return WALLPAPERS.find((wallpaper) => wallpaper.id === id)?.image ?? '';
}

/**
 * What the picker draws for a value, which is a lighter file where there is one.
 */
export function wallpaperThumb(value: string): string {
	if (!value) return '';
	if (!value.startsWith(PACK_PREFIX)) return `url(${value})`;
	const id = value.slice(PACK_PREFIX.length);
	const wallpaper = WALLPAPERS.find((entry) => entry.id === id);
	return wallpaper?.thumb ?? wallpaper?.image ?? '';
}

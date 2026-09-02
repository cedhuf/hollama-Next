import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { Sitemap } from '$lib/sitemap';
import { generateRandomId } from '$lib/utils';

/** A knowledge collection has no address of its own: it is written in a dialog, from wherever you are. The Library is where they are listed. */
export function generateNewUrl(sitemap: Sitemap, id?: string): ResolvedPathname {
	const newId = id ?? generateRandomId();
	switch (sitemap) {
		case Sitemap.SESSIONS:
			return resolve('/sessions/[id]', { id: newId });
		case Sitemap.KNOWLEDGE:
			return resolve('/library');
		case Sitemap.SETTINGS:
			return resolve('/settings');
	}
}

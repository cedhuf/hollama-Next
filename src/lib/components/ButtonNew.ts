import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { Sitemap } from '$lib/sitemap';
import { generateRandomId } from '$lib/utils';

export function generateNewUrl(sitemap: Sitemap, id?: string): ResolvedPathname {
	const newId = id ?? generateRandomId();
	switch (sitemap) {
		case Sitemap.SESSIONS:
			return resolve('/sessions/[id]', { id: newId });
		case Sitemap.KNOWLEDGE:
			return resolve('/knowledge/[id]', { id: newId });
		case Sitemap.SETTINGS:
			return resolve('/settings');
	}
}

import { json } from '@sveltejs/kit';

import type { Persona } from '$lib/personas';
import { requireUser } from '$lib/server/api';
import { allowUserPersonas, getConfig } from '$lib/server/db/config';

export async function GET(event) {
	const user = await requireUser(event);

	let shared: Persona[] = [];
	try {
		const raw = getConfig('sharedPersonas');
		if (raw) shared = JSON.parse(raw) as Persona[];
	} catch {
		shared = [];
	}

	return json({ shared, canCreate: user.role === 'admin' || allowUserPersonas() });
}

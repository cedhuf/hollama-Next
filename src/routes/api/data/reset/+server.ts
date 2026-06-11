import { requireUser } from '$lib/server/api';
import { resetUserData } from '$lib/server/db/collections';

export async function POST(event) {
	const user = await requireUser(event);
	resetUserData(user.id);
	return new Response(null, { status: 204 });
}

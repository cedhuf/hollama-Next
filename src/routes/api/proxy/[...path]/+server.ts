export async function GET({ request, params }) {
	return proxy(request, params.path);
}

export async function POST({ request, params }) {
	return proxy(request, params.path);
}

async function proxy(request: Request, path: string | undefined) {
	const targetBaseUrl = request.headers.get('X-Target-Base-Url');
	if (!targetBaseUrl) {
		return new Response('Missing X-Target-Base-Url header', { status: 400 });
	}

	const url = `${targetBaseUrl.replace(/\/+$/, '')}${path ? `/${path}` : ''}`;

	const headers = new Headers();
	for (const name of ['authorization', 'content-type', 'accept']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	const body = request.method === 'POST' ? await request.text() : undefined;

	const response = await fetch(url, {
		method: request.method,
		headers,
		body,
	});

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			'content-type': response.headers.get('content-type') || 'application/json'
		}
	});
}

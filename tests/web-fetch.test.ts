import { expect, test } from '@playwright/test';

/**
 * The web fetch endpoint reads a URL the client chooses, from inside the
 * server's network. These cover the boundary that makes that safe; none of them
 * touches the network, because every one is refused before a request goes out.
 */

test('refuses addresses inside the server network', async ({ request }) => {
	const res = await request.post('/api/fetch', {
		data: {
			urls: [
				'http://127.0.0.1:4173/',
				// The cloud metadata endpoint: the reason link-local is blocked.
				'http://169.254.169.254/latest/meta-data/',
				'file:///etc/passwd'
			]
		}
	});

	expect(res.ok()).toBe(true);
	const { pages } = await res.json();
	expect(pages).toHaveLength(3);
	expect(pages[0].error).toMatch(/not routable/);
	expect(pages[1].error).toMatch(/not routable/);
	expect(pages[2].error).toMatch(/Unsupported protocol/);
});

test('applies the per-message page cap before fetching', async ({ request }) => {
	const res = await request.post('/api/fetch', {
		data: {
			urls: [
				'http://10.0.0.1/',
				'http://10.0.0.2/',
				'http://10.0.0.3/',
				'http://10.0.0.4/',
				'http://10.0.0.5/'
			]
		}
	});

	// The default is three pages; the extras are dropped, not attempted.
	const { pages } = await res.json();
	expect(pages).toHaveLength(3);
});

test('rejects a request with no usable URL', async ({ request }) => {
	expect((await request.post('/api/fetch', { data: { urls: [] } })).status()).toBe(400);
	expect((await request.post('/api/fetch', { data: {} })).status()).toBe(400);
});

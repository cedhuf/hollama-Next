/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

import { APP_SLUG } from '$lib/brand';

// `self` is the worker global; cast it so we get the worker-scoped API.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `${APP_SLUG}-cache-${version}`;
// Immutable, hashed build output + everything under static/.
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	// Drop caches from previous versions, then take control immediately.
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	// Dynamic + auth endpoints must always hit the network.
	if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

	// Hashed build assets and static files never change — serve them from cache.
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}

	// Page navigations: network-first (always fresh when online), cache a copy so
	// previously-visited pages still open offline.
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					if (response.ok && response.type === 'basic') {
						const cache = await caches.open(CACHE);
						cache.put(request, response.clone());
					}
					return response;
				} catch {
					const cache = await caches.open(CACHE);
					return (await cache.match(request)) ?? (await cache.match('/')) ?? Response.error();
				}
			})()
		);
	}
});

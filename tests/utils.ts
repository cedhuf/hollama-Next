import type { Page } from '@playwright/test';

import type { FakeProvider } from './fake-provider';

/**
 * What every test here needs and nothing else.
 *
 * The suite this replaced grew helpers for an app that no longer exists: local
 * mode, a browser that called the provider itself, and a dozen test ids that
 * have since been renamed or removed. What is left is the shape of a test now:
 * stand up a provider, tell the instance about it, and drive the app.
 */
export { startFakeProvider, FAKE_MODEL, type FakeProvider } from './fake-provider';

/**
 * Give the instance a connection to the fake provider.
 *
 * Through the app's own API rather than by seeding a database: the endpoint is
 * what a person's click reaches, so a connection made this way is a connection
 * the app agrees exists, catalogue and all.
 */
export async function connectFakeProvider(page: Page, provider: FakeProvider): Promise<string> {
	// The admin endpoint, which is the one that matters: a lone owner is an
	// administrator, and personal connections are off unless an administrator turns
	// them on. A test that used the other one would be testing a path most
	// instances never take.
	const created = await page.request.post('/api/admin/servers', {
		data: {
			connectionType: 'openai-compatible',
			baseUrl: provider.url,
			label: 'Fake',
			isEnabled: true
		}
	});
	const { id } = (await created.json()) as { id: string };

	// The catalogue is read at boot in the browser, so a connection added after
	// that is invisible until the page is loaded again. Which is what the caller
	// does next, and this only makes the ordering explicit.
	await page.request.get('/api/providers');
	return id;
}

/**
 * Ask for the phone interface, or stop asking.
 *
 * Read, merge, write: the endpoint stores the settings blob whole, so putting one
 * key would replace every other and the app would boot into a state no person
 * could have produced.
 */
export async function preferMobileInterface(page: Page, wanted: boolean): Promise<void> {
	const current = await page.request.get('/api/data/settings');
	const settings = current.ok() ? ((await current.json()) ?? {}) : {};
	await page.request.put('/api/data/settings', {
		data: { ...settings, simplifiedMobileUI: wanted }
	});
}

/**
 * Open the settings dialog, from the sidebar where the app puts it.
 *
 * Not by visiting `/settings`: that route asks for the dialog and immediately
 * navigates away, which is right for a link somebody typed and useless for a
 * test that wants the dialog on screen.
 */
export async function openSettings(page: Page, tab: string): Promise<void> {
	await page
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await page.getByRole('tab', { name: tab, exact: true }).click();
}

/** A phone, for the interface that is only ever offered to one. */
export const PHONE = { width: 390, height: 844 };

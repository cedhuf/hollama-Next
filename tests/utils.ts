import type { Page } from '@playwright/test';

import type { FakeProvider } from './fake-provider';

/** The shape of a test now: stand up a provider, tell the instance about it, and drive the app. */
export { startFakeProvider, FAKE_MODEL, type FakeProvider } from './fake-provider';

/** Through the app's own API rather than by seeding a database: the endpoint is what a person's click reaches, so a connection made this way is one the app agrees exists. */
export async function connectFakeProvider(page: Page, provider: FakeProvider): Promise<string> {
	// The admin endpoint, which is the one that matters: a lone owner is an
	// administrator, and personal connections are off unless one turns them on.
	const created = await page.request.post('/api/admin/servers', {
		data: {
			connectionType: 'openai-compatible',
			baseUrl: provider.url,
			label: 'Fake',
			isEnabled: true
		}
	});
	const { id } = (await created.json()) as { id: string };

	// The catalogue is read at boot, so a connection added after that is invisible
	// until the page loads again. Which is what the caller does next.
	await page.request.get('/api/providers');
	return id;
}

/** Read, merge, write: the endpoint stores the settings blob whole, so putting one key would replace every other. */
export async function preferMobileInterface(page: Page, wanted: boolean): Promise<void> {
	const current = await page.request.get('/api/data/settings');
	const settings = current.ok() ? ((await current.json()) ?? {}) : {};
	await page.request.put('/api/data/settings', {
		data: { ...settings, simplifiedMobileUI: wanted }
	});
}

/** Not by visiting `/settings`: that route asks for the dialog and immediately navigates away, which is right for a typed link and useless for a test. */
export async function openSettings(page: Page, tab: string): Promise<void> {
	await page
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await page.getByRole('tab', { name: tab, exact: true }).click();
}

/** A phone, for the interface that is only ever offered to one. */
export const PHONE = { width: 390, height: 844 };

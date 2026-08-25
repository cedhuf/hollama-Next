import { expect, test, type Page } from '@playwright/test';

import { connectFakeProvider, FAKE_MODEL, startFakeProvider, type FakeProvider } from './utils';

/**
 * The one thing this application is for.
 *
 * A connection, a model, a question, an answer on screen. If this passes, the
 * composer, the run in the server, the streaming back to the browser and the
 * message list all did their part; if it fails, one of them did not, which is
 * worth knowing before anything else.
 */
let provider: FakeProvider;

test.beforeEach(async ({ page }) => {
	provider = await startFakeProvider('The fake provider answers.');
	await connectFakeProvider(page, provider);
});

test.afterEach(async () => {
	await provider.close();
});

/** Chosen the way a person chooses it, from the picker on the home screen. */
async function pickTheModel(page: Page) {
	await page.getByLabel(/available models/i).click();
	await page.getByRole('option', { name: FAKE_MODEL }).click();
}

test('sends a message and shows what comes back', async ({ page }) => {
	await page.goto('/sessions');
	await pickTheModel(page);

	const composer = page.getByPlaceholder(/how can i help/i);
	await expect(composer).toBeVisible();
	await composer.fill('Say something.');
	await composer.press('Enter');

	// The answer arrives word by word from the fake provider, so this waits on the
	// text rather than on a request.
	await expect(page.getByText('The fake provider answers.')).toBeVisible({ timeout: 15_000 });

	// And the app asked the provider for the right thing.
	expect(provider.requests.length).toBeGreaterThan(0);
	const sent = provider.requests[0] as { model?: string; messages?: { content?: string }[] };
	expect(sent.model).toBe(FAKE_MODEL);
	expect(JSON.stringify(sent.messages)).toContain('Say something.');
});

test('keeps the conversation after a reload', async ({ page }) => {
	await page.goto('/sessions');
	await pickTheModel(page);

	const composer = page.getByPlaceholder(/how can i help/i);
	await composer.fill('Remember this.');
	await composer.press('Enter');
	await expect(page.getByText('The fake provider answers.')).toBeVisible({ timeout: 15_000 });

	// Written by the server as it goes, so it is there without the tab that asked.
	// Scoped to the thread: the words are also in the sidebar and in the header,
	// which is how a conversation gets its name and not what this is checking.
	await page.reload();
	const thread = page.locator('#message-0');
	await expect(thread.getByText('Remember this.')).toBeVisible();
	await expect(page.getByText('The fake provider answers.')).toBeVisible();
});

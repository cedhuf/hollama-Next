import { expect, test } from '@playwright/test';

import type { Model } from '$lib/settings';
import { generateRandomId } from '$lib/utils';

import { MOCK_API_TAGS_RESPONSE, MOCK_KNOWLEDGE, mockOllamaModelsResponse } from './utils';

test.beforeEach(async ({ page }) => {
	await mockOllamaModelsResponse(page);
});

/**
 * Produces the screenshots used in README.md. Everything is seeded through
 * `localStorage`, so the app looks populated while staying offline: no provider
 * is ever called.
 */
test('seed data and take screenshots for README.md', async ({ page }) => {
	const models: Model[] = MOCK_API_TAGS_RESPONSE.models.map((model) => ({
		name: model.name,
		serverId: generateRandomId()
	}));

	await page.evaluate(
		({ modelA, modelB, knowledge }) => {
			// A named profile: the sidebar, the greeting and the avatar all read from
			// it, and "?" initials in three places make for a poor screenshot.
			const settingsKey = 'hollamanext-settings';
			const settings = JSON.parse(window.localStorage.getItem(settingsKey) ?? '{}');
			window.localStorage.setItem(
				settingsKey,
				JSON.stringify({ ...settings, profileFirstName: 'John', profileLastName: 'Smith' })
			);

			window.localStorage.setItem('hollamanext-knowledge', JSON.stringify(knowledge));

			// A second connection, so the Servers tab shows what multi-provider looks
			// like: two cards, two colours, one of them never synced.
			const serversKey = 'hollamanext-servers';
			const servers = JSON.parse(window.localStorage.getItem(serversKey) ?? '[]');
			window.localStorage.setItem(
				serversKey,
				JSON.stringify([
					...servers,
					{
						id: 'openai-demo',
						connectionType: 'openai',
						baseUrl: 'https://api.openai.com/v1',
						label: 'OpenAI',
						modelFilter: 'gpt',
						color: '#378ADD',
						isVerified: null,
						isEnabled: false
					}
				])
			);

			window.localStorage.setItem(
				'hollamanext-sessions',
				JSON.stringify([
					{
						id: 'u4pozr',
						model: modelA,
						title: 'Odds calculator in Python',
						messages: [
							{
								role: 'user',
								content:
									'Write a Python function that returns the odds of each fighter winning, from their age, height, weight and experience.',
								createdAt: new Date().toISOString()
							},
							{
								role: 'assistant',
								content:
									"Here's a compact version. It scores each fighter, then normalises the two scores into probabilities.\n\n```python\ndef score(f):\n    return f['experience'] * 3 + f['height'] * 0.1 - f['age'] * 0.2\n\n\ndef odds(a, b):\n    sa, sb = score(a), score(b)\n    total = sa + sb\n    return {'a': round(sa / total, 3), 'b': round(sb / total, 3)}\n```\n\nThe weights are arbitrary — tune them against real fight data before trusting the output.",
								createdAt: new Date().toISOString()
							}
						],
						updatedAt: new Date().toISOString()
					},
					{
						id: 'bbpz8o',
						model: modelB,
						title: 'The meaning of life',
						messages: [
							{
								role: 'user',
								content: 'What is the meaning of life?',
								createdAt: new Date().toISOString()
							},
							{
								role: 'assistant',
								content:
									'**A question philosophers, theologians and a great many people have chewed on for a long time.** Good luck with that.',
								createdAt: new Date().toISOString()
							}
						],
						updatedAt: new Date().toISOString()
					}
				])
			);
		},
		{ modelA: models[0], modelB: models[1], knowledge: MOCK_KNOWLEDGE }
	);

	// --- Home ----------------------------------------------------------------
	await page.goto('/sessions');

	// Wait for fonts to load
	expect(await page.evaluate(() => document.fonts.size)).toBe(19);
	expect(await page.evaluate(() => document.fonts.ready)).toBeTruthy();

	await expect(page.getByTestId('session-item')).toHaveCount(2);
	await expect(page.getByText('John Smith')).toBeVisible();
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({ name: 'home.png' });

	// --- Settings › Interface -------------------------------------------------
	await page.getByLabel('Settings', { exact: true }).click();
	await page.getByRole('tab', { name: 'Interface' }).click();
	await expect(page.getByText('Theme style')).toBeVisible();
	// The dialog animates in over 200ms; `animations: 'disabled'` fast-forwards it
	// to its end state rather than freezing it half-way.
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({
		name: 'settings.png'
	});

	// --- Settings › Servers ---------------------------------------------------
	await page.getByRole('tab', { name: 'Servers' }).click();
	await expect(page.getByTestId('server')).toHaveCount(2);
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({
		name: 'servers.png'
	});
	await page.keyboard.press('Escape');

	// --- A conversation -------------------------------------------------------
	await page.goto('/sessions/u4pozr');
	await expect(page.locator('.article--assistant')).toBeVisible();
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({
		name: 'session.png'
	});

	// --- Library: personas + knowledge ----------------------------------------
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	await expect(page.getByText(MOCK_KNOWLEDGE[0].name)).toBeVisible();
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({
		name: 'library.png'
	});

	// --- The same conversation, in dark mode ----------------------------------
	await page.evaluate(() => {
		const key = 'hollamanext-settings';
		const settings = JSON.parse(window.localStorage.getItem(key) ?? '{}');
		window.localStorage.setItem(key, JSON.stringify({ ...settings, themeMode: 'dark' }));
	});
	await page.goto('/sessions/u4pozr');
	await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
	await expect(page.locator('.article--assistant')).toBeVisible();
	expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot({
		name: 'session-dark.png'
	});
});

import { expect, test } from '@playwright/test';

import { PHONE, preferMobileInterface } from './utils';

/**
 * The phone interface is what a phone gets, and nothing else does.
 *
 * Which is its whole contract with the rest of the app, and the part that broke
 * twice while it was being built: sent one way and not the other, a widened
 * window kept a one-column interface with a tab bar on a screen three times too
 * big for it.
 *
 * The setting is written through the API rather than clicked in Settings. What
 * is under test is the redirect, and driving a dialog on a 390-pixel screen to
 * reach it would fail for reasons that have nothing to do with it.
 */
test.describe('the simplified mobile interface', () => {
	test.use({ viewport: PHONE });

	test('is what a phone gets, without being asked', async ({ page }) => {
		await preferMobileInterface(page, true);
		await page.goto('/sessions');
		await expect(page).toHaveURL(/\/m$/);
	});

	test('gives the classic one back to whoever asks for it', async ({ page }) => {
		await preferMobileInterface(page, false);
		await page.goto('/m');
		await expect(page).toHaveURL(/\/sessions/);
	});

	test('takes a phone across, and gives a wider window back', async ({ page }) => {
		await preferMobileInterface(page, true);
		await page.goto('/sessions');

		await expect(page).toHaveURL(/\/m$/);
		await expect(page.getByRole('link', { name: /home/i })).toBeVisible();

		// The same rule in reverse: this is not an interface for a desktop, whatever
		// the setting says.
		await page.setViewportSize({ width: 1280, height: 900 });
		await expect(page).toHaveURL(/\/sessions/);
	});
});

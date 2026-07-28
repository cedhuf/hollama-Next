import { expect, test } from '@playwright/test';

import { mockOllamaModelsResponse } from './utils';

test.describe('Locales', () => {
	test('can switch language to french and back to english', async ({ page }) => {
		await mockOllamaModelsResponse(page);
		const languageCombobox = page.getByLabel('Language');
		const langueCombobox = page.getByLabel('Langue');

		await page.goto('/settings');
		await expect(langueCombobox).not.toBeVisible();
		await expect(languageCombobox).toBeVisible();
		await expect(languageCombobox).toHaveValue('English');
		await expect(page.getByTestId('data-management-hollama-servers')).toContainText('Servers');

		await languageCombobox.click();

		// Only the installed locales are offered.
		await expect(page.getByRole('option', { name: 'English' })).toBeVisible();
		await expect(page.getByRole('option', { name: 'Français' })).toBeVisible();
		await expect(page.getByRole('option')).toHaveCount(2);
		await page.getByRole('option', { name: 'Français' }).click();

		await expect(languageCombobox).not.toBeVisible();
		await expect(langueCombobox).toHaveValue('Français');
		let localStorageValue = await page.evaluate(() =>
			window.localStorage.getItem('hollama-settings')
		);
		expect(localStorageValue).toContain('"userLanguage":"fr"');

		await expect(page.getByTestId('data-management-hollama-servers')).toContainText('Serveurs');
		await expect(page.getByTestId('data-management-hollama-servers')).not.toContainText('Servers');

		await langueCombobox.click();
		await page.getByRole('option', { name: 'English' }).click();

		localStorageValue = await page.evaluate(() => window.localStorage.getItem('hollama-settings'));
		expect(localStorageValue).toContain('"userLanguage":"en"');
		await expect(page.getByTestId('data-management-hollama-servers')).toContainText('Servers');
	});

	test.describe('French', () => {
		test.use({ locale: 'fr-FR' });
		test('default language is French', async ({ page }) => {
			await page.goto('/settings');
			expect(await page.evaluate(() => navigator.language)).toBe('fr-FR');

			await page.evaluate(() => window.localStorage.clear());
			await page.reload();
			await expect(page.getByText('Servers')).not.toBeVisible();
			await expect(page.getByTestId('data-management-hollama-servers')).toContainText('Serveurs');
			expect(await page.evaluate(() => window.localStorage.getItem('hollama-settings'))).toContain(
				'"userLanguage":"fr"'
			);
		});
	});

	test.describe('Unsupported browser language', () => {
		test.use({ locale: 'de-DE' });
		test('falls back to the base locale', async ({ page }) => {
			await page.goto('/settings');
			await page.evaluate(() => window.localStorage.clear());
			await page.reload();

			// German is no longer installed, so detection settles on English.
			await expect(page.getByTestId('data-management-hollama-servers')).toContainText('Servers');
			expect(await page.evaluate(() => window.localStorage.getItem('hollama-settings'))).toContain(
				'"userLanguage":"en"'
			);
		});
	});
});

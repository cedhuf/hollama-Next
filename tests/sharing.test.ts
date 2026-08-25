import { expect, test } from '@playwright/test';

import { openSettings } from './utils';

/**
 * What an administrator publishes reaches the people on the instance.
 *
 * Every group of defaults on the Admin tab answers the same three-state question
 * (off, locked, overridable) through one resolver, so exercising one of them
 * exercises the mechanism. Sampling is the one chosen because it is the only
 * group whose values are typed in Settings and published from Admin, which is
 * the arrangement that took the longest to get right.
 */
test('publishes the instance sampling settings', async ({ page }) => {
	await page.goto('/sessions');

	// A value of this account's own, typed where everyone types theirs.
	await openSettings(page, 'Chat');
	const temperature = page.getByLabel(/temperature/i).first();
	await temperature.fill('0.4');
	await temperature.blur();

	// Published from the Admin tab, which holds the decision and not the numbers.
	await page.getByRole('tab', { name: 'Admin', exact: true }).click();
	// The label, not the input: the app's switches are a visually hidden checkbox
	// behind a drawn track, so there is nothing at the input's own coordinates and
	// the label is what a finger lands on anyway.
	const share = page.getByText(/share your sampling settings/i);
	await share.scrollIntoViewIfNeeded();
	await share.click();

	// The instance now answers with them, which is what every reader reads.
	await expect
		.poll(async () => {
			const config = await page.request.get('/api/chat-defaults/config');
			const defaults = (await config.json()) as {
				sampling: { adminValue: Record<string, unknown> };
			};
			return defaults.sampling.adminValue.temperature;
		})
		.toBe(0.4);
});

import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * The app's own pictures of itself.
 *
 * Not a test: nothing here asserts anything about behaviour. It drives the app
 * to a few known states and photographs them, because those photographs are
 * needed in two places and neither should be kept by hand.
 *
 * The manifest is the first. Chromium draws its own install sheet, and what it
 * puts in it comes from `screenshots`: with none, the sheet is a single line
 * with a button; with them, it is the gallery you see when installing a real
 * app. The second is the documentation, where a screenshot taken by hand is out
 * of date by the following week.
 *
 * Run it on purpose (`pnpm run screenshots`), not on every suite: it writes into
 * `static/`, which is source, and a test that edits the repository as a side
 * effect of `pnpm test` would be a trap.
 *
 * Chromium is particular about what it will show. Every picture for one form
 * factor has to share an aspect ratio, none may be narrower than 320px or wider
 * than 3840, and the ratio must stay under 2.3:1. The two viewports below are
 * chosen to satisfy that rather than to imitate any particular device.
 */

const OUT = 'static/screenshots';

/**
 * A phone, which is the only form factor here.
 *
 * `wide` was tried and dropped: the desktop layout photographs as a column of
 * chat beside a column of chrome, which is what the app is and not what a
 * gallery of three pictures can say about it. A phone screenshot shows one
 * thing at a time, which is what this kind of gallery is for.
 */
const NARROW = { width: 440, height: 956 };

/**
 * A conversation worth photographing.
 *
 * Written down rather than produced by driving the app: what the pictures need
 * is a plausible exchange, not a demonstration that sending a message works,
 * and the fewer moving parts between the seed and the shutter the fewer reasons
 * a picture has to come out different tomorrow.
 */
const SEEDED_SESSIONS = [
	{
		id: 'ab12cd',
		title: 'Self-hosting everything, one service at a time',
		updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		model: { name: 'llama3.1:8b', serverId: 'seed' },
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [
			{ role: 'user', content: 'Is self-hosting worth it for a household?' },
			{
				role: 'assistant',
				content:
					'It trades a monthly fee for occasional hours. Not many hours, and rarely at a bad moment if you set up monitoring and backups first.\n\nThe question that decides it: what happens if this service stops for a day? If the answer is *nothing much*, self-host it and enjoy it. If it involves someone else’s job or a payment failing, pay a professional.'
			},
			{ role: 'user', content: 'Where would you start?' },
			{
				role: 'assistant',
				content:
					'Files and photos. They are the ones you already own, the failure mode is inconvenience rather than loss, and they teach you backups on the day you care least about the outcome.'
			}
		]
	},
	{
		id: 'ef34gh',
		title: 'Reading a sourdough starter',
		updatedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
		model: { name: 'llama3.1:8b', serverId: 'seed' },
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'How do I know it is ready?' }]
	},
	{
		id: 'ij56kl',
		title: 'What changed in CSS this year',
		updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
		model: { name: 'llama3.1:8b', serverId: 'seed' },
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'Give me the three that matter.' }]
	}
];

/**
 * Everything that would otherwise photograph badly: the first-run wizard, the
 * install offer we would be photographing ourselves into, and a theme chosen
 * rather than inherited from whatever machine is running this.
 */
async function seed(page: Page, theme: 'light' | 'dark') {
	await page.addInitScript(
		([sessions, mode]) => {
			window.localStorage.setItem(
				'llooma-settings',
				JSON.stringify({
					onboardingComplete: true,
					welcomeComplete: true,
					offerInstall: false,
					themeMode: mode,
					themeStyle: 'classic',
					userLanguage: 'en'
				})
			);
			window.localStorage.setItem('llooma-sessions', JSON.stringify(sessions));
			// So the offer never fires while the shutter is open.
			window.localStorage.setItem('llooma-install-offered-at', String(Date.now()));
		},
		[SEEDED_SESSIONS, theme] as const
	);
}

async function shoot(page: Page, name: string) {
	// Fonts and the wallpaper layer settle a frame or two after the route does,
	// and a picture taken before they do is a picture of the app loading.
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.beforeAll(async () => {
	await mkdir(OUT, { recursive: true });
});

test.describe('screenshots', () => {
	// Off unless asked for, because `testMatch` cannot tell this file from a test
	// and nobody running the suite expects their working tree to change.
	test.skip(!process.env.SCREENSHOTS, 'run with `pnpm run screenshots`');
	test.describe.configure({ timeout: 60_000 });

	test('narrow', async ({ page }) => {
		await page.setViewportSize(NARROW);
		await seed(page, 'dark');

		await page.goto('/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await shoot(page, 'narrow-conversation');

		await page.goto('/sessions');
		await shoot(page, 'narrow-home');

		await page.goto('/library');
		await shoot(page, 'narrow-library');

		// The drawer, which on a phone is the only way to see the conversations at
		// all, and therefore the one screen a gallery of an app like this owes its
		// reader. Opened from the round button, and given its slide before the
		// shutter.
		await page.goto('/sessions/ab12cd');
		await page.getByLabel('Expand sidebar').first().click();
		await expect(page.getByText('Reading a sourdough starter')).toBeVisible();
		await shoot(page, 'narrow-sidebar');
	});
});

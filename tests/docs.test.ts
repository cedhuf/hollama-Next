import { expect, test, type Page } from '@playwright/test';

import type { Model } from '$lib/settings';
import { generateRandomId } from '$lib/utils';

import { MOCK_API_TAGS_RESPONSE, MOCK_KNOWLEDGE, mockOllamaModelsResponse } from './utils';

test.beforeEach(async ({ page }) => {
	await mockOllamaModelsResponse(page);
});

/**
 * Fills `localStorage` so the app looks lived-in while staying offline: no
 * provider is ever called. Shared by every screenshot below.
 */
async function seed(page: Page) {
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
}

/** Produces the screenshots used in README.md. */
test('seed data and take screenshots for README.md', async ({ page }) => {
	await seed(page);

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

const THEME_STYLES = ['classic', 'dracula', 'catppuccin', 'gruvbox', 'nord', 'solarized'] as const;

/** Slant of the cuts between two slices, in degrees off the vertical. */
const SLICE_ANGLE = 10;

/** A banner rather than a window: slices of a 1280px viewport are too narrow. */
const STRIP_VIEWPORT = { width: 1800, height: 760 };

/**
 * Assembles full-page screenshots into one strip cut by diagonal seams.
 *
 * Playwright can't composite images, so the pieces are put together in the
 * browser: every screenshot becomes a layer of a plain HTML page, clipped to its
 * own slanted band, and that page is what gets captured.
 *
 * `gap` is the width of the seam in CSS pixels. Zero draws a hairline on the cut
 * instead, for strips whose slices would otherwise melt into one another.
 *
 * `focus` is, per slice, the x of the screenshot that should end up in the middle
 * of its band. Without it every layer stays where it was captured, which only
 * works when the slices show the same page; a strip of different sections needs
 * each one panned so its content lands in the band rather than off to the side.
 */
async function composeStrip(
	page: Page,
	shots: string[],
	{ gap = 0, focus = [] }: { gap?: number; focus?: number[] } = {}
) {
	const { width, height } = page.viewportSize()!;
	// Half the horizontal travel of a seam, as a share of the width: the cut
	// leans by `SLICE_ANGLE`, so it drifts `tan(angle) * height / 2` either side
	// of its nominal x.
	const skew = ((Math.tan((SLICE_ANGLE * Math.PI) / 180) * height) / 2 / width) * 100;
	const half = (gap / 2 / width) * 100;

	const layers = shots
		.map((src, i) => {
			// The outer edges run past the canvas so the slant never clips a corner.
			const left = i === 0 ? -50 : (i / shots.length) * 100 + half;
			const right = i === shots.length - 1 ? 150 : ((i + 1) / shots.length) * 100 - half;
			const clip = `polygon(${left + skew}% 0, ${right + skew}% 0, ${right - skew}% 100%, ${left - skew}% 100%)`;
			// The pan rides on the image, not on the wrapper: a transform on the
			// clipped element would drag its clip along with it.
			const pan = focus[i] === undefined ? 0 : ((i + 0.5) / shots.length) * width - focus[i];
			return `<div style="clip-path:${clip}"><img src="${src}" style="transform:translateX(${pan}px)"></div>`;
		})
		.join('');
	const seams = gap
		? ''
		: shots
				.slice(1)
				.map((_, i) => `<i style="left:${((i + 1) / shots.length) * 100}%"></i>`)
				.join('');

	await page.setContent(`
		<style>
			html, body { margin: 0; height: 100%; overflow: hidden; }
			div, img { position: absolute; inset: 0; width: 100%; height: 100%; }
			i {
				position: absolute;
				top: 0;
				height: 100%;
				width: 2px;
				margin-left: -1px;
				background: rgba(127, 127, 127, 0.55);
				transform: skewX(-${SLICE_ANGLE}deg);
			}
		</style>
		${layers}${seams}
	`);
	// With a gap the seams are punched out of the alpha channel rather than
	// painted, so GitHub's own background shows through and the strip suits both
	// its light and its dark theme.
	return page.screenshot({ animations: 'disabled', omitBackground: gap > 0 });
}

/** Sets the theme the next navigation will render with. */
async function setTheme(page: Page, themeStyle: string, themeMode: 'light' | 'dark') {
	await page.evaluate(
		({ style, mode }) => {
			const key = 'hollamanext-settings';
			const settings = JSON.parse(window.localStorage.getItem(key) ?? '{}');
			window.localStorage.setItem(
				key,
				JSON.stringify({ ...settings, themeMode: mode, themeStyle: style })
			);
		},
		{ style: themeStyle, mode: themeMode }
	);
}

/**
 * Every theme side by side, all on the same conversation. Each layer holds the
 * *whole* screenshot at the same position, so the sidebar, the messages and the
 * composer line up across the seams as if it were a single window.
 */
test('take the theme strip for README.md', async ({ page }) => {
	test.slow();
	await seed(page);
	await page.setViewportSize(STRIP_VIEWPORT);

	const shots: string[] = [];
	for (const [i, themeStyle] of THEME_STYLES.entries()) {
		// Alternating the ramp shows both halves of every palette, and keeps
		// neighbouring slices from blending into one another.
		const themeMode = i % 2 === 0 ? 'light' : 'dark';
		await setTheme(page, themeStyle, themeMode);
		await page.goto('/sessions/u4pozr');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', themeMode);
		await expect(page.locator('.article--assistant')).toBeVisible();
		const shot = await page.screenshot({ animations: 'disabled' });
		shots.push(`data:image/png;base64,${shot.toString('base64')}`);
	}

	expect(await composeStrip(page, shots)).toMatchSnapshot({ name: 'themes.png' });
});

/**
 * The companion strip: one theme, five sections of the app. Same trick, but the
 * seams are punched out instead of drawn, so the strip carries no background of
 * its own and reads on either GitHub theme.
 */
test('take the sections strip for README.md', async ({ page }) => {
	test.slow();
	await seed(page);
	await page.setViewportSize(STRIP_VIEWPORT);

	const shots: string[] = [];
	const capture = async () => {
		const shot = await page.screenshot({ animations: 'disabled' });
		shots.push(`data:image/png;base64,${shot.toString('base64')}`);
	};

	// --- Home, then a conversation: the two light slices -----------------------
	await setTheme(page, 'classic', 'light');
	await page.goto('/sessions');
	await expect(page.getByTestId('session-item')).toHaveCount(2);
	await expect(page.getByText('John Smith')).toBeVisible();
	await capture();

	await page.goto('/sessions/u4pozr');
	await expect(page.locator('.article--assistant')).toBeVisible();
	await capture();

	// --- Library, then the two settings tabs: the dark ones --------------------
	await setTheme(page, 'classic', 'dark');
	await page.goto('/library');
	await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	await expect(page.getByText(MOCK_KNOWLEDGE[0].name)).toBeVisible();
	await capture();

	await page.goto('/sessions');
	await page.getByLabel('Settings', { exact: true }).click();
	await page.getByRole('tab', { name: 'Interface' }).click();
	await expect(page.getByText('Theme style')).toBeVisible();
	await capture();

	await page.getByRole('tab', { name: 'Servers' }).click();
	await expect(page.getByTestId('server')).toHaveCount(2);
	await capture();

	// Where each section actually has something to show: the sidebar sits left,
	// the conversation fills the right two thirds, and the settings dialog is
	// centred. Panning brings each of those into its own band.
	const focus = [200, 1100, 950, 900, 900];
	expect(await composeStrip(page, shots, { gap: 12, focus })).toMatchSnapshot({
		name: 'sections.png'
	});
});

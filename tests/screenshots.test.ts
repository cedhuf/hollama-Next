import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * The app's own pictures of itself.
 *
 * Not a test: nothing here asserts anything about behaviour. It drives the app
 * to a set of known states and photographs them, because those pictures are
 * needed in three places and none of them should be kept by hand: the manifest,
 * where Chromium reads them to draw its install sheet; the README; and the
 * documentation's home page.
 *
 * It replaces `docs.test.ts`, which did the same job through `toMatchSnapshot`.
 * That made every screenshot an assertion, so any change to the interface failed
 * the suite instead of updating the picture, which is the wrong way round: these
 * are output, not expectations.
 *
 * Run it on purpose (`pnpm run screenshots`), never as part of the suite: it
 * writes into `static/`, which is source, and a test that edits the repository
 * as a side effect of `pnpm test` would be a trap.
 */

const OUT = 'static/screenshots';
/** Astro's image pipeline needs its own copy, beside the page that imports it. */
const DOCS_OUT = 'docs/src/assets/screenshots';

/**
 * A phone, and a laptop.
 *
 * The phone's dimensions also serve the manifest, which is particular: every
 * picture of one form factor has to share an aspect ratio, none may be under
 * 320px or over 3840, and the ratio must stay below 2.3:1.
 */
const MOBILE = { width: 440, height: 956 };
const DESKTOP = { width: 1440, height: 900 };

/** A banner rather than a window: slices of a 1440px viewport are too narrow. */
const STRIP = { width: 1800, height: 760 };

const THEME_STYLES = ['classic', 'dracula', 'catppuccin', 'gruvbox', 'nord', 'solarized'] as const;

/** Slant of the cuts between two slices, in degrees off the vertical. */
const SLICE_ANGLE = 7;

const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * 3600 * 1000).toISOString();

const MODEL = { name: 'llama3.1:8b', serverId: 'seed-ollama' };
const MODEL_B = { name: 'gpt-4o-mini', serverId: 'seed-openai' };

/**
 * Enough of a life to photograph.
 *
 * Two conversations carry real length, because a picture of two lines says
 * nothing about what the app is for; the rest are there to fill the sidebar, so
 * the list reads as someone's rather than as a fixture.
 */
const SESSIONS = [
	{
		id: 'ab12cd',
		title: 'Self-hosting everything, one service at a time',
		updatedAt: ago(1),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [
			{ role: 'user', content: 'Is self-hosting worth it for a household, honestly?' },
			{
				role: 'assistant',
				content: `It trades a monthly fee for occasional hours. Not many hours, and rarely at a bad moment, **if** you set up monitoring and backups before you need them.

The question that decides it, service by service:

> What happens if this stops for a day?

If the answer is *nothing much*, self-host it and enjoy it. Photos, files, notes, a calendar. A day of downtime is an inconvenience.

If the answer involves someone else's job, a payment failing or a message not arriving, pay a professional. Not because you could not do it, but because at three in the morning you will not want to.`
			},
			{ role: 'user', content: 'Where would you start?' },
			{
				role: 'assistant',
				content: `Files and photos, in that order.

1. **Files.** You already own them, the failure mode is inconvenience rather than loss, and they teach you backups on the day you care least about the outcome.
2. **Photos.** The same shape with more emotional weight, so you will actually test the restore.
3. **Notes and bookmarks.** Small, and they make the whole thing feel worth it every day.

Leave mail until last. It is the one where a bad afternoon costs you a job offer.`
			},
			{ role: 'user', content: 'How do I check a backup actually restores?' },
			{
				role: 'assistant',
				content: `Restore it somewhere else, on a schedule, and look at the result. A backup nobody has read is a hypothesis.

\`\`\`bash
# Weekly, into a scratch directory, then compare a known file
restic restore latest --target /tmp/verify
diff -q /tmp/verify/home/photos/2019/summer.jpg ~/photos/2019/summer.jpg
\`\`\`

The point is not the command, it is the calendar entry. Anything that only runs when you remember it does not run.`
			}
		]
	},
	{
		id: 'ef34gh',
		title: 'Reading a sourdough starter',
		updatedAt: ago(20),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [
			{ role: 'user', content: 'How do I know it is ready to bake with?' },
			{
				role: 'assistant',
				content: `Three signs, and you want all three on the same day.

- It **doubles** within four to six hours of a feed, reliably, not once.
- The surface is domed and webbed rather than flat and soupy.
- It smells of yoghurt and apples. Acetone means hungry, not dead.

The float test is popular and unreliable: a starter can float on gas it made yesterday.`
			},
			{ role: 'user', content: 'Mine smells like nail polish remover.' },
			{
				role: 'assistant',
				content: `Underfed, not ruined. Feed it twice a day at 1:5:5 for three days, somewhere around 24°C, and it will come back. If it does not, the flour is the next suspect.`
			}
		]
	},
	{
		id: 'ij56kl',
		title: 'What changed in CSS this year',
		updatedAt: ago(30),
		model: MODEL_B,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [
			{ role: 'user', content: 'Give me the three that actually matter.' },
			{
				role: 'assistant',
				content: `**Container queries**, so a component answers to the space it is in rather than to the window. **Parent selectors**, which finally let a parent depend on its children. And **pretty text wrapping**, which quietly fixes a decade of orphaned words in headings.`
			}
		]
	},
	{
		id: 'mn78op',
		title: 'Naming things in a small team',
		updatedAt: ago(52),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'Is a glossary worth the effort?' }],
		pinned: true
	},
	{
		id: 'qr90st',
		title: 'Choosing a backup strategy',
		updatedAt: ago(76),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'Three copies, two media, one offsite. Still true?' }]
	},
	{
		id: 'uv12wx',
		title: 'A shorter way to say this',
		updatedAt: ago(120),
		model: MODEL_B,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'Trim this paragraph without losing the argument.' }]
	},
	{
		id: 'yz34ab',
		title: 'Reading a flight manual',
		updatedAt: ago(160),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'What does V1 actually commit you to?' }]
	},
	{
		id: 'cd56ef',
		title: 'Sharpening a kitchen knife',
		updatedAt: ago(220),
		model: MODEL,
		options: {},
		systemPrompt: { role: 'system', content: '' },
		messages: [{ role: 'user', content: 'One stone or three?' }]
	}
];

const SERVERS = [
	{
		id: 'seed-ollama',
		connectionType: 'ollama',
		baseUrl: 'http://localhost:11434',
		label: 'Ollama',
		color: '#C8553D',
		isVerified: new Date(NOW).toISOString(),
		isEnabled: true
	},
	{
		id: 'seed-openai',
		connectionType: 'openai',
		baseUrl: 'https://api.openai.com/v1',
		label: 'OpenAI',
		modelFilter: 'gpt',
		color: '#378ADD',
		isVerified: null,
		isEnabled: false
	}
];

const BASE_SETTINGS = {
	onboardingComplete: true,
	welcomeComplete: true,
	// Never photograph ourselves being asked to install.
	offerInstall: false,
	profileFirstName: 'John',
	profileLastName: 'Smith',
	userLanguage: 'en',
	themeStyle: 'classic',
	themeMode: 'light',
	models: [MODEL, MODEL_B]
};

/**
 * Seeds the stores before the page's first script runs.
 *
 * Only if they are empty, which matters: this runs again on every navigation,
 * and writing unconditionally would put the base settings back each time and
 * undo whatever `configure` had just asked for.
 */
async function seed(page: Page) {
	await page.addInitScript(
		([sessions, servers, settings]) => {
			if (window.localStorage.getItem('llooma-settings')) return;
			window.localStorage.setItem('llooma-settings', JSON.stringify(settings));
			window.localStorage.setItem('llooma-sessions', JSON.stringify(sessions));
			window.localStorage.setItem('llooma-servers', JSON.stringify(servers));
			window.localStorage.setItem('llooma-install-offered-at', String(Date.now()));
		},
		[SESSIONS, SERVERS, BASE_SETTINGS] as const
	);
}

/**
 * Changes settings for the next navigation.
 *
 * Needs a real page under it: `localStorage` on `about:blank` belongs to no
 * origin and reading it throws, which is what happens when this is the first
 * thing a run does.
 */
async function configure(page: Page, patch: Record<string, unknown>) {
	if (!page.url().startsWith('http')) await page.goto('/sessions');

	await page.evaluate((p) => {
		const key = 'llooma-settings';
		const settings = JSON.parse(window.localStorage.getItem(key) ?? '{}');
		window.localStorage.setItem(key, JSON.stringify({ ...settings, ...p }));
	}, patch);
}

async function shoot(page: Page, name: string) {
	// Fonts and the wallpaper layer settle a frame or two after the route does,
	// and a picture taken before they do is a picture of the app loading.
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

/** One full screenshot, as a data URL, for the composites to layer. */
async function capture(page: Page) {
	const shot = await page.screenshot({ animations: 'disabled' });
	return `data:image/png;base64,${shot.toString('base64')}`;
}

/**
 * Assembles full screenshots into rows cut by diagonal seams.
 *
 * Playwright cannot composite images, so the pieces are put together in the
 * browser: every screenshot becomes a layer of a plain HTML page, clipped to its
 * own slanted band, and that page is what gets captured.
 *
 * `gap` is the width of the seam in CSS pixels. Zero draws a hairline on the cut
 * instead, for strips whose slices would otherwise melt into one another.
 *
 * `focus` is, per slice, the x of the screenshot that should end up in the
 * middle of its band. Without it every layer stays where it was captured, which
 * only works when the slices show the same page; a strip of different sections
 * needs each one panned so its content lands in the band rather than off to one
 * side.
 */
async function composeRows(
	page: Page,
	rows: string[][],
	{ gap = 0, focus = [], name }: { gap?: number; focus?: number[]; name: string }
) {
	const width = STRIP.width;
	const rowHeight = STRIP.height;
	await page.setViewportSize({ width, height: rowHeight * rows.length });

	// Half the horizontal travel of a seam, as a share of the width: the cut
	// leans by `SLICE_ANGLE`, so it drifts `tan(angle) * height / 2` either side
	// of its nominal x.
	const skew = ((Math.tan((SLICE_ANGLE * Math.PI) / 180) * rowHeight) / 2 / width) * 100;
	const half = (gap / 2 / width) * 100;

	const html = rows
		.map((shots) => {
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
			return `<section>${layers}${seams}</section>`;
		})
		.join('');

	await page.setContent(`
		<style>
			html, body { margin: 0; height: 100%; overflow: hidden; }
			section { position: relative; width: 100%; height: ${rowHeight}px; }
			div, img { position: absolute; inset: 0; width: 100%; height: 100%; }
			i {
				position: absolute;
				top: 0;
				height: 100%;
				width: 1px;
				margin-left: -0.5px;
				background: rgba(127, 127, 127, 0.5);
				transform: skewX(-${SLICE_ANGLE}deg);
			}
		</style>
		${html}
	`);

	// With a gap the seams are punched out of the alpha channel rather than
	// painted, so the host page's own background shows through and the strip
	// suits a light theme and a dark one alike.
	const png = await page.screenshot({ animations: 'disabled', omitBackground: gap > 0 });
	await writeFile(`${OUT}/${name}.png`, png);
	await writeFile(`${DOCS_OUT}/${name}.png`, png);
}

test.beforeAll(async () => {
	await mkdir(OUT, { recursive: true });
	await mkdir(DOCS_OUT, { recursive: true });
});

test.describe('screenshots', () => {
	// Off unless asked for: `testMatch` cannot tell this file from a test, and
	// nobody running the suite expects their working tree to change.
	test.skip(!process.env.SCREENSHOTS, 'run with `pnpm run screenshots`');
	test.describe.configure({ timeout: 120_000 });

	test('mobile', async ({ page }) => {
		await page.setViewportSize(MOBILE);
		await seed(page);

		await page.goto('/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await shoot(page, 'mobile_conversation');

		await page.getByLabel('Expand sidebar').first().click();
		await expect(page.getByText('Reading a sourdough starter')).toBeVisible();
		await shoot(page, 'mobile_sidebar');

		await configure(page, { themeMode: 'dark' });
		await page.goto('/sessions');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await shoot(page, 'mobile_home');

		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		await shoot(page, 'mobile_library');
	});

	test('desktop', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await seed(page);

		await page.goto('/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await shoot(page, 'desktop_conversation');

		// The collapsed rail, which is a different way of using the app rather than
		// the same one made narrower.
		await configure(page, { sidebarExpanded: false });
		await page.goto('/sessions/ab12cd');
		await expect(page.getByLabel('Expand sidebar').first()).toBeVisible();
		await shoot(page, 'desktop_rail');

		await configure(page, { sidebarExpanded: true, themeMode: 'dark' });
		await page.goto('/sessions/ab12cd');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await shoot(page, 'desktop_conversation_dark');

		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		await shoot(page, 'desktop_library');

		// A wallpaper, which is where the surface system finally shows: the column
		// translucent over the picture, the conversation opaque on top of it.
		await configure(page, { backgroundImage: 'pack:ocean', surfaceTransparency: true });
		await page.goto('/sessions/ab12cd');
		await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'on');
		await shoot(page, 'desktop_wallpaper');

		await configure(page, { backgroundImage: '', themeMode: 'light' });
		await page.goto('/sessions');
		await page.getByLabel('Settings', { exact: true }).click();
		await page.getByRole('tab', { name: 'Interface' }).click();
		await expect(page.getByText('Theme style')).toBeVisible();
		await shoot(page, 'desktop_settings');
	});

	/**
	 * The six palettes, light on the top row and dark on the bottom.
	 *
	 * Every slice is the same conversation at the same scroll position, so the
	 * sidebar, the messages and the composer line up across the seams as if it
	 * were one window wearing six coats. Two rows rather than one alternating
	 * ramp: alternating showed each palette in only one of its halves, which is
	 * half of what a palette is.
	 */
	test('theme strip', async ({ page }) => {
		await seed(page);
		await page.setViewportSize(STRIP);

		const rows: string[][] = [];
		for (const themeMode of ['light', 'dark'] as const) {
			const row: string[] = [];
			for (const themeStyle of THEME_STYLES) {
				// The flat bar rather than the floating pill: the pill hovers over the
				// transcript, which is right in use and untidy in a photograph, where a
				// half-covered line of text is all anyone sees.
				await configure(page, { themeStyle, themeMode, floatingChatHeader: false });
				await page.goto('/sessions/ab12cd');
				await expect(page.locator('html')).toHaveAttribute('data-color-theme', themeMode);
				await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
				await page.waitForTimeout(250);
				row.push(await capture(page));
			}
			rows.push(row);
		}

		await composeRows(page, rows, { name: 'themes' });
	});

	/**
	 * The companion strip: one palette, four parts of the app.
	 *
	 * Four bands rather than five, cut at seven degrees rather than ten, with a
	 * seam half as wide. All three for one reason: the strip was handsome and
	 * unreadable, because a narrow band of a wide window shows mostly the space
	 * between things. Wider bands, straighter cuts and a thinner seam give each
	 * section room enough to be recognised.
	 */
	test('sections strip', async ({ page }) => {
		await seed(page);
		await page.setViewportSize(STRIP);

		const shots: string[] = [];

		await configure(page, { themeStyle: 'classic', themeMode: 'light' });
		await page.goto('/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		shots.push(await capture(page));

		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		shots.push(await capture(page));

		await configure(page, { themeMode: 'dark' });
		await page.goto('/sessions');
		await page.getByLabel('Settings', { exact: true }).click();
		await page.getByRole('tab', { name: 'Interface' }).click();
		await expect(page.getByText('Theme style')).toBeVisible();
		shots.push(await capture(page));

		await configure(page, { backgroundImage: 'pack:ocean' });
		await page.goto('/sessions/ab12cd');
		await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'on');
		await page.waitForTimeout(400);
		shots.push(await capture(page));

		// Where each section has something to show: the sidebar and its list sit
		// left, the library's cards fill the middle, the settings dialog is centred,
		// and the wallpaper reads best across the conversation.
		await composeRows(page, [shots], { gap: 6, focus: [260, 620, 900, 1150], name: 'sections' });
	});
});

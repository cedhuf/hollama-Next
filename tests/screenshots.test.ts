import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

/**
 * Where the pictures live, and where the working ones do not.
 *
 * `RAW` is every single-screen capture, and none of them is a deliverable: each
 * exists to be read back and dressed in a frame. They used to be written into
 * `static/screenshots` beside the finished ones, so the repository carried two of
 * everything and it was never obvious which of the two the README was using.
 * Gitignored, and wiped at the start of a run.
 *
 * `OUT` keeps only what something actually points at: the composites, which are
 * finished as they are, and the framed folder beneath it.
 */
const RAW = '.screenshots';
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
/**
 * An iPhone 17 Pro Max's screen, in points.
 *
 * The size of the glass, which the app fills and the frame matches. The system's
 * share of it is reserved by the app itself, from the insets a shot hands it.
 */
const MOBILE = { width: 440, height: 956 };

/**
 * The app gets the whole glass, and reserves the system's share itself.
 *
 * Which is what a device does. The insets are handed to it as CSS variables in
 * `shootPhone`, so it pads its own header and its own tab bar exactly as it would
 * on the phone, its background runs under both bars, and the frame paints nothing.
 */
const MOBILE_VIEWPORT = { width: MOBILE.width, height: MOBILE.height };

/** What an iPhone 17 Pro Max keeps for the clock and the home indicator. */
const INSETS = { top: 54, bottom: 34 };
const DESKTOP = { width: 1440, height: 900 };

/** A banner rather than a window: slices of a 1440px viewport are too narrow. */
const STRIP = { width: 1800, height: 760 };

const THEME_STYLES = ['classic', 'dracula', 'catppuccin', 'gruvbox', 'nord', 'solarized'] as const;

/** Slant of the cuts between two slices, in degrees off the vertical. */
const SLICE_ANGLE = 7;

const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * 3600 * 1000).toISOString();

/**
 * The two models the fixtures name, with a stand-in connection.
 *
 * The real id is not known until the instance has made the connection, so these
 * carry a placeholder and `sessionsFor` swaps in the true one by name just before
 * the sessions are written.
 */
const MODEL = { name: 'llama3.1:8b', serverId: 'pending' };
const MODEL_B = { name: 'gpt-4o-mini', serverId: 'pending' };

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

/**
 * Three to talk to, for the phone interface's home row.
 *
 * Enough to show that the row is a row and that the faces differ, and no more:
 * these exist to be photographed, not to demonstrate the persona system. Each
 * carries a tagline because the Library draws one under the name, and three cards
 * with a blank second line is a picture of an app with nothing in it.
 */
/**
 * One conversation that belongs to a persona.
 *
 * Apart from the others because it is what the voice screen is photographed on:
 * opened with a `?session=`, that screen shows whose voice it is in the corner
 * and their greeting in the transcript, where an unbound one shows an orb on an
 * empty screen. A picture of a feature should have the feature in it.
 */
const PERSONA_SESSION = {
	id: 'nova01',
	title: 'Nova',
	personaId: 'seed-persona-nova',
	updatedAt: ago(2),
	model: MODEL,
	options: {},
	systemPrompt: { role: 'system', content: 'You are Nova, a patient explainer.' },
	systemPromptEdited: true,
	messages: [{ role: 'assistant', content: 'Nova here. What are we untangling?' }]
};

const PERSONAS = [
	{
		id: 'seed-persona-nova',
		name: 'Nova',
		tagline: 'Explains things twice, without sighing',
		systemPrompt: 'You are Nova, a patient explainer.',
		greeting: 'Nova here. What are we untangling?',
		avatarColor: '#6366f1',
		params: {}
	},
	{
		id: 'seed-persona-atlas',
		name: 'Atlas',
		tagline: 'Short answers, no preamble',
		systemPrompt: 'You are Atlas, blunt and quick.',
		greeting: 'Atlas. Keep it short and I will too.',
		avatarColor: '#1D9E75',
		params: {}
	},
	{
		id: 'seed-persona-wren',
		name: 'Wren',
		tagline: 'Reads a draft properly before saying anything',
		systemPrompt: 'You are Wren, careful with words.',
		greeting: 'Wren speaking. Take your time.',
		avatarColor: '#D85A30',
		params: {}
	}
];

/**
 * Two connections, and what each one serves.
 *
 * Paired here rather than listed apart, because a model without its connection is
 * a name with no badge and no colour. Neither endpoint is ever called: nothing in
 * these pictures sends a turn, so an address that does not answer is enough.
 */
const SERVERS = [
	{
		connection: {
			connectionType: 'ollama',
			baseUrl: 'http://localhost:11434',
			label: 'Ollama',
			color: '#C8553D',
			isEnabled: true
		},
		// Named so `guessModelKind` sorts them without anybody storing a correction:
		// the drawing tab and the voice screen both check what a model is before they
		// offer themselves, and a catalogue of chat models leaves both of them saying
		// there is nothing set up.
		models: ['llama3.1:8b', 'flux.1-schnell', 'whisper-large-v3', 'kokoro-82m']
	},
	{
		connection: {
			connectionType: 'openai',
			baseUrl: 'https://api.openai.com/v1',
			label: 'OpenAI',
			modelFilter: 'gpt',
			color: '#378ADD',
			isEnabled: false
		},
		models: ['gpt-4o-mini']
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
	/**
	 * The responsive interface, explicitly.
	 *
	 * A phone gets the `/m` interface by default now, so every shot taken at a phone
	 * viewport would be redirected out of the route it asked for. The classic
	 * pictures still want the responsive layout, and the ones that want `/m` say so
	 * by turning this back off.
	 */
	simplifiedMobileUI: false,
	/**
	 * Already migrated, as far as the app is concerned.
	 *
	 * The one-time switch to the phone interface fires for any account that has not
	 * been through it, and it overrode the line above on a fresh database: the
	 * classic mobile shots were redirected to `/m` on the first run of a clean
	 * checkout and photographed the wrong interface. Saying it has already happened
	 * is what makes these fixtures an account that chose, rather than one waiting to
	 * be moved.
	 */
	mobileDefaultApplied: true,
	/**
	 * Voice, set up.
	 *
	 * Not to use it: nothing in these pictures records or speaks. It is so the voice
	 * screen photographs as itself rather than as the notice it shows when there is
	 * no model to hear or answer with, which is a picture of an unconfigured
	 * instance rather than of the feature.
	 */
	voiceInput: true,
	voiceModel: 'whisper-large-v3',
	speechOutput: true,
	speechModel: 'kokoro-82m',
	speechVoice: 'ff_siwis'
};

/**
 * A life to photograph, written where the app actually keeps one.
 *
 * Through the API, not `localStorage`. That is the whole of what broke this file:
 * the instance under test runs in server mode, every store hydrates from
 * `/api/data`, and seeding the browser's own storage wrote into a place nothing
 * reads any more. Four of these five tests had been failing on a clean checkout
 * for that one reason, each of them at the first line that expected to see any of
 * the seeded content.
 *
 * The connection goes through the admin route for the same reason it does in the
 * functional suite: a lone owner is an administrator, and that is the endpoint a
 * click reaches.
 *
 * Everything is written before the first navigation. The stores read once at boot,
 * so anything written after it is invisible until the page loads again.
 */
/** Cleared once per run, so a picture never inherits the last run's leftovers. */
let wiped = false;

async function seed(page: Page, patch: Record<string, unknown> = {}) {
	if (!wiped) {
		wiped = true;
		// The database outlives a run. Without this the sessions of a previous one
		// stack up behind the seeded ones and the sidebar fills with history nobody
		// wrote, which is only ever noticed once it is in a published picture.
		await page.request.post('/api/data/reset');
	}

	/**
	 * The connections first, because everything else is keyed to them.
	 *
	 * Their ids are the instance's to give, not this file's: `POST` generates one
	 * and there is no way to ask for a particular one. So the models are built from
	 * what comes back rather than from a constant, which is what keeps a model's
	 * badge the colour of the connection it actually belongs to.
	 *
	 * Created once per run. The database outlives a test, so a second call would
	 * hang a duplicate connection off the same instance and put two badges where
	 * the picture wants one.
	 */
	if (!models.length) {
		for (const server of SERVERS) {
			const made = await page.request.post('/api/admin/servers', { data: server.connection });
			const { id } = (await made.json()) as { id: string };
			models.push(...server.models.map((name) => ({ name, serverId: id })));
		}
	}

	await page.request.put('/api/data/sessions', { data: sessionsFor(models) });
	await page.request.put('/api/data/personas', { data: PERSONAS });
	await configure(page, patch);
}

/** Filled by the first `seed`, and the same for every shot after it. */
const models: { name: string; serverId: string }[] = [];

/** The fixtures, pointed at the connections this instance actually made. */
function sessionsFor(resolved: { name: string; serverId: string }[]) {
	return [...SESSIONS, PERSONA_SESSION].map((session) => ({
		...session,
		model: resolved.find((model) => model.name === session.model.name) ?? session.model
	}));
}

/**
 * Settings, merged rather than replaced.
 *
 * The endpoint stores the blob whole, so putting one key would drop every other
 * and boot the app into a state no person could have produced.
 */
async function configure(page: Page, patch: Record<string, unknown>) {
	/**
	 * Nothing live while this writes.
	 *
	 * A page that is still open owns a hydrated settings store, and that store
	 * flushes its own copy as it is torn down. Written straight after this, the
	 * flush lands last and puts the previous shot's settings back: the theme strip
	 * photographed six dark palettes in light, because each configure was undone by
	 * the page it was about to replace.
	 */
	if (page.url().startsWith('http')) await page.goto('about:blank');

	const current = await page.request.get('/api/data/settings');
	const stored = current.ok() ? ((await current.json()) ?? {}) : {};
	await page.request.put('/api/data/settings', {
		data: { ...stored, ...BASE_SETTINGS, models, ...patch }
	});
}

/**
 * The expand control that is actually on screen.
 *
 * Two buttons carry that label: one for the drawer on a narrow window and one on
 * the rail for a wide one, each hidden at the other's width. Taking the first
 * match found the mobile one on a desktop, where it is permanently hidden, and
 * the desktop shots waited five seconds for something that was never going to
 * appear.
 */
function expandSidebar(page: Page) {
	return page.locator('button[aria-label="Expand sidebar"]:visible').first();
}

/**
 * A phone shot: the device's insets, then the picture.
 *
 * Injected rather than emulated, because no browser will pretend to have a notch.
 * The app reads its safe areas from these variables and pads itself, which is the
 * whole reason the frame no longer has to paint anything behind the clock.
 */
async function shootPhone(page: Page, name: string) {
	await page.addStyleTag({
		content: `:root{--safe-top:${INSETS.top}px;--safe-bottom:${INSETS.bottom}px}`
	});
	await shoot(page, name);
}

async function shoot(page: Page, name: string) {
	// Fonts and the wallpaper layer settle a frame or two after the route does,
	// and a picture taken before they do is a picture of the app loading.
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${RAW}/${name}.png`, animations: 'disabled' });
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

/**
 * Dressing the shots.
 *
 * A bare viewport capture reads as a rectangle of pixels rather than as
 * software someone runs, so the README's copies get a frame around them: a Mac
 * window for the desktop shots, a phone for the mobile ones. Drawn in the
 * browser around the picture, the same trick `composeRows` uses, since
 * Playwright still cannot composite.
 *
 * Written beside the originals rather than over them, because the originals
 * have another job: the manifest declares their exact sizes, and Chromium wants
 * every narrow screenshot at one aspect ratio, under 2.3:1. A phone's bezel
 * breaks both.
 */
const FRAMED_OUT = `${OUT}/framed`;

/** Room around a frame for its shadow to fall into. */
const PAD = 60;

/** The Mac window's title bar: tall enough for three lights and nothing else. */
const TITLE_BAR = 30;

/** An iPhone 17 Pro Max, in the CSS pixels its 440x956pt screen is captured at. */
const PHONE = { bezel: 13, corner: 66, screen: 53, statusBar: 54, homeBar: 34 };

/**
 * The whole screen is 956, furniture included, and so is the capture.
 *
 * Two earlier constructions were wrong in opposite directions. Adding the bars
 * around the capture made a framed phone 1044 tall, the shape of nothing, and
 * painted a strip above the app in a flat colour it never used: the band. Cutting
 * the capture short fixed the shape and kept the band.
 *
 * What a device does is neither. The app is given the whole glass and told what
 * the system is keeping, it pads itself, and its own background runs behind the
 * clock and the home indicator. That is now what happens here, because the insets
 * are variables the shot can set rather than an `env()` that is always nought in a
 * plain viewport.
 */
const PHONE_SCREEN = { width: MOBILE.width, height: MOBILE.height };

/** A framed window and a framed phone, outer edge to outer edge. */
const WINDOW_SIZE = { width: DESKTOP.width, height: DESKTOP.height + TITLE_BAR };
const PHONE_SIZE = {
	width: PHONE_SCREEN.width + PHONE.bezel * 2,
	height: PHONE_SCREEN.height + PHONE.bezel * 2
};

const WINDOW_SHOTS = [
	'desktop_conversation',
	'desktop_conversation_dark',
	'desktop_wallpaper',
	'desktop_library',
	'desktop_settings',
	'desktop_rail'
] as const;

const PHONE_SHOTS = [
	'mobile_conversation',
	'mobile_sidebar',
	'mobile_home',
	'mobile_library',
	'phone_home',
	'phone_conversation',
	'phone_voice'
] as const;

async function readShot(name: string) {
	const png = await readFile(`${RAW}/${name}.png`);
	return `data:image/png;base64,${png.toString('base64')}`;
}

type Edges = { top: string; bottom: string; darkTop: boolean; darkBottom: boolean };

/**
 * The colour a screenshot ends on, top and bottom.
 *
 * A phone's status bar and home indicator are bands the app does not draw, and
 * painting them a guessed grey would put a seam across the picture. Reading the
 * shot's own edge instead lets the frame continue it, so the theme, the palette
 * and a wallpaper all come out right without being told which one is in force.
 * The same reading decides the window's chrome: a light title bar over a dark
 * interface looks like a screenshot of a different program.
 */
async function edges(page: Page, src: string): Promise<Edges> {
	return page.evaluate(
		(s) =>
			new Promise<Edges>((resolve) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext('2d')!;
					ctx.drawImage(img, 0, 0);
					const at = (y: number) => {
						const [r, g, b] = ctx.getImageData(2, y, 1, 1).data;
						return {
							css: `rgb(${r},${g},${b})`,
							dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 140
						};
					};
					const top = at(2);
					const bottom = at(img.height - 3);
					resolve({ top: top.css, bottom: bottom.css, darkTop: top.dark, darkBottom: bottom.dark });
				};
				img.src = s;
			}),
		src
	);
}

/**
 * The frames themselves, as one stylesheet.
 *
 * Written once and shared, because a frame is needed twice: alone, for the
 * README's tables, and beside another one in the composite at the top of the
 * page. Everything a single shot decides for itself travels as a custom
 * property on the element rather than as its own rule.
 */
const FRAME_CSS = `
	html, body { margin: 0; background: transparent; }

	.window {
		position: absolute;
		width: ${WINDOW_SIZE.width}px;
		border-radius: 11px;
		overflow: hidden;
		background: var(--bar);
		box-shadow: 0 2px 5px rgba(0, 0, 0, .16), 0 26px 64px rgba(0, 0, 0, .3), 0 0 0 1px var(--ring);
		transform-origin: top left;
	}
	.window .bar {
		height: ${TITLE_BAR}px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding-left: 14px;
		border-bottom: 1px solid var(--line);
	}
	.window .bar span {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 .5px rgba(0, 0, 0, .16);
	}
	.window img { display: block; width: ${DESKTOP.width}px; height: ${DESKTOP.height}px; }

	.phone {
		position: absolute;
		width: calc(var(--screen-w) + var(--bezel) * 2);
		height: calc(var(--screen-h) + var(--bezel) * 2);
		padding: var(--bezel);
		box-sizing: border-box;
		border-radius: var(--corner);
		background: linear-gradient(145deg, #7c7c82 0%, #33333a 22%, #1c1c1f 52%, #5e5e66 78%, #232327 100%);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .22), 0 30px 70px rgba(0, 0, 0, .35);
		transform-origin: top left;
	}
	.phone .screen {
		position: relative;
		width: var(--screen-w);
		height: var(--screen-h);
		border-radius: var(--screen-corner);
		overflow: hidden;
		background: var(--top);
	}
	/* Over the capture, not above it, and with no background of its own. On a
	   device the app runs under the status bar and its own colour is what shows
	   behind the clock; a strip painted here was the band across the top. */
	.phone .status {
		position: absolute;
		top: 0; left: 0; right: 0;
		height: ${PHONE.statusBar}px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 32px 0 36px;
		box-sizing: border-box;
		color: var(--ink);
		font: 600 17px/1 -apple-system, "SF Pro Text", system-ui, sans-serif;
		letter-spacing: .2px;
	}
	.phone .glyphs { display: flex; align-items: center; gap: 6px; }
	.phone .island {
		position: absolute;
		top: 11px;
		left: 50%;
		transform: translateX(-50%);
		width: 125px;
		height: 37px;
		border-radius: 19px;
		background: #000;
	}
	.phone .home {
		position: absolute;
		bottom: 0; left: 0; right: 0;
		height: ${PHONE.homeBar}px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.phone .home i { width: 143px; height: 5px; border-radius: 3px; background: var(--ink-home); }
	.phone img { display: block; width: var(--screen-w); height: var(--shot-h); }

	/* The side buttons, sitting on the band's edge rather than through it. */
	.phone b {
		position: absolute;
		width: 3px;
		border-radius: 2px;
		background: linear-gradient(180deg, #6a6a70, #3a3a40);
	}
	.phone .action { top: 11%; height: 3%; }
	.phone .louder { top: 16.8%; height: 5.8%; }
	.phone .quieter { top: 23.9%; height: 5.8%; }
	.phone .side { top: 19.8%; height: 9.3%; }
`;

/**
 * A minimal macOS window: rounded corners, one bar, three lights.
 *
 * No toolbar, no address bar, no title. The point is to say "this is an
 * application window" and then get out of the way of the application.
 */
function windowHtml(src: string, e: Edges, place = `top:${PAD}px;left:${PAD}px`) {
	const bar = e.darkTop ? '#37373b' : '#f0efee';
	const line = e.darkTop ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';
	const ring = e.darkTop ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)';

	return `
		<div class="window" style="--bar:${bar};--line:${line};--ring:${ring};${place}">
			<div class="bar">
				<span style="background:#ff5f57"></span>
				<span style="background:#febc2e"></span>
				<span style="background:#28c840"></span>
			</div>
			<img src="${src}">
		</div>
	`;
}

/** The side buttons, placed as fractions of the chassis so a shorter phone keeps them. */
const BUTTONS = `
			<b class="action" style="left:-2px"></b>
			<b class="louder" style="left:-2px"></b>
			<b class="quieter" style="left:-2px"></b>
			<b class="side" style="right:-2px"></b>`;

/** Everything the chassis needs to be a given phone rather than one particular phone. */
function chassis(screenW: number, screenH: number, shotH: number, bezel: number, corner: number) {
	return (
		`--screen-w:${screenW}px;--screen-h:${screenH}px;--shot-h:${shotH}px;` +
		`--bezel:${bezel}px;--corner:${corner + bezel}px;--screen-corner:${corner}px;`
	);
}

/**
 * A phone around a mobile shot.
 *
 * The status bar and the home indicator sit above and below the screenshot rather
 * than over it: the app is captured in a plain viewport where the safe area is
 * nought, so its header is at the very top and an island painted on top would
 * cover it. The capture is taken short by exactly their height, so the screen
 * inside the chassis is a real 440 by 956 rather than that plus furniture.
 */
function phoneHtml(src: string, e: Edges, place = `top:${PAD}px;left:${PAD}px`) {
	const ink = e.darkTop ? '#fff' : '#000';
	const inkHome = e.darkBottom ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)';

	const size = chassis(
		PHONE_SCREEN.width,
		PHONE_SCREEN.height,
		PHONE_SCREEN.height,
		PHONE.bezel,
		PHONE.screen
	);

	return `
		<div class="phone" style="${size}--top:${e.top};--bottom:${e.bottom};--ink:${ink};--ink-home:${inkHome};${place}">
${BUTTONS}
			<div class="screen">
				<div class="status">
					<span>9:41</span>
					<span class="glyphs">
						<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
							<rect y="8" width="3" height="4" rx="1"/>
							<rect x="5" y="5.5" width="3" height="6.5" rx="1"/>
							<rect x="10" y="3" width="3" height="9" rx="1"/>
							<rect x="15" width="3" height="12" rx="1"/>
						</svg>
						<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
							<path d="M8.5 12 5.9 9.1a4 4 0 0 1 5.2 0z"/>
							<path d="M13 7.5a6.9 6.9 0 0 0-9 0L2.2 5.6a9.6 9.6 0 0 1 12.6 0z"/>
						</svg>
						<svg width="27" height="13" viewBox="0 0 27 13" fill="none">
							<rect x=".5" y=".5" width="22" height="12" rx="3.5" stroke="currentColor" opacity=".4"/>
							<rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor"/>
							<path d="M24.5 4.3c1.1.5 1.1 3.9 0 4.4z" fill="currentColor" opacity=".4"/>
						</svg>
					</span>
					<div class="island"></div>
				</div>
				<img src="${src}">
				<div class="home"><i></i></div>
			</div>
		</div>
	`;
}

/** Waits for the layers to decode: a frame photographed too early is an empty frame. */
async function settle(page: Page) {
	await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
	await page.waitForTimeout(120);
}

/** Lays out a page of frames and photographs it onto a transparent ground. */
async function draw(
	page: Page,
	{
		width,
		height,
		body,
		out,
		alsoOut
	}: { width: number; height: number; body: string; out: string; alsoOut?: string }
) {
	await page.setViewportSize({ width, height });
	await page.setContent(`<style>${FRAME_CSS}</style>${body}`);
	await settle(page);

	const png = await page.screenshot({ animations: 'disabled', omitBackground: true });
	await writeFile(out, png);
	// A second copy where Astro's image pipeline can reach it: it reads from its
	// own folder, not from `static/`.
	if (alsoOut) await writeFile(alsoOut, png);
}

async function frameWindow(page: Page, name: string) {
	const src = await readShot(name);
	await page.setContent('<body></body>');
	const e = await edges(page, src);

	await draw(page, {
		width: WINDOW_SIZE.width + PAD * 2,
		height: WINDOW_SIZE.height + PAD * 2,
		body: windowHtml(src, e),
		out: `${FRAMED_OUT}/${name}.png`
	});
}

async function framePhone(page: Page, name: string) {
	const src = await readShot(name);
	await page.setContent('<body></body>');
	const e = await edges(page, src);

	await draw(page, {
		width: PHONE_SIZE.width + PAD * 2,
		height: PHONE_SIZE.height + PAD * 2,
		body: phoneHtml(src, e),
		out: `${FRAMED_OUT}/${name}.png`
	});
}

/**
 * The picture at the top of the README: a window, and a phone leaning on it.
 *
 * It replaces a strip of four diagonal slices, which was handsome from a
 * distance and told a visitor nothing: every band cut through a word or a
 * control, so the app was never shown once in one piece. Here both formats are
 * whole, and the transparent ground leaves a silhouette rather than a
 * rectangle, which is what stops the top of a README looking like a table.
 *
 * Dark, over a wallpaper, because a white window at the top of a page reads as
 * a document from ten years ago rather than as something anyone would want to
 * open.
 */
const HERO = {
	/** The shot in the window, and the one in the phone. */
	window: 'desktop_wallpaper',
	/**
	 * The phone interface, not the responsive one at a phone's width.
	 *
	 * The picture at the top of the README is the first thing anybody sees of this
	 * app, and what it should say is that there are two interfaces rather than one
	 * that shrinks. A narrow copy of the window beside it says the opposite.
	 */
	phone: 'phone_home',
	/** How much smaller the phone is, so it reads as nearer rather than as huge. */
	scale: 0.62,
	/** How far the phone hangs past the window, right and below. */
	overhangX: 150,
	overhangY: 70
};

async function composeHero(page: Page) {
	const windowSrc = await readShot(HERO.window);
	const phoneSrc = await readShot(HERO.phone);
	await page.setContent('<body></body>');
	const windowEdges = await edges(page, windowSrc);
	const phoneEdges = await edges(page, phoneSrc);

	const phoneWidth = PHONE_SIZE.width * HERO.scale;
	const phoneHeight = PHONE_SIZE.height * HERO.scale;
	const phoneLeft = PAD + WINDOW_SIZE.width + HERO.overhangX - phoneWidth;
	const phoneTop = PAD + WINDOW_SIZE.height + HERO.overhangY - phoneHeight;

	await draw(page, {
		width: WINDOW_SIZE.width + HERO.overhangX + PAD * 2,
		height: WINDOW_SIZE.height + HERO.overhangY + PAD * 2,
		body:
			windowHtml(windowSrc, windowEdges) +
			phoneHtml(
				phoneSrc,
				phoneEdges,
				// A darker, wider shadow than the frame carries on its own: the phone
				// sits on top of the window, and without it the two look pasted.
				`top:${phoneTop}px;left:${phoneLeft}px;transform:scale(${HERO.scale});` +
					`box-shadow:inset 0 0 0 1px rgba(255,255,255,.22), 0 40px 90px rgba(0,0,0,.45)`
			),
		out: `${OUT}/hero.png`,
		// The documentation's home opens on this one too, and Astro's image
		// pipeline reads from its own folder rather than from `static/`.
		alsoOut: `${DOCS_OUT}/hero.png`
	});
}

test.beforeAll(async () => {
	// The working captures, gone before anything reads one. A stale file from a
	// previous run is worse than a missing one: it frames cleanly and ships.
	await rm(RAW, { recursive: true, force: true });
	await mkdir(RAW, { recursive: true });
	await mkdir(OUT, { recursive: true });
	await mkdir(DOCS_OUT, { recursive: true });
	await mkdir(FRAMED_OUT, { recursive: true });
});

test.describe('screenshots', () => {
	// Off unless asked for: `testMatch` cannot tell this file from a test, and
	// nobody running the suite expects their working tree to change.
	test.skip(!process.env.SCREENSHOTS, 'run with `pnpm run screenshots`');
	test.describe.configure({ timeout: 120_000 });

	test('mobile', async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await seed(page);

		await page.goto('/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await shootPhone(page, 'mobile_conversation');

		await expandSidebar(page).click();
		await expect(page.getByText('Reading a sourdough starter')).toBeVisible();
		await shootPhone(page, 'mobile_sidebar');

		await configure(page, { themeMode: 'dark' });
		await page.goto('/sessions');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await shootPhone(page, 'mobile_home');

		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		await shootPhone(page, 'mobile_library');
	});

	/**
	 * The phone interface, which is a different product rather than a narrower one.
	 *
	 * Its own test because it needs the setting the others turn off, and because it
	 * is what the README opens on: the picture at the top of the page is a desktop
	 * window with one of these leaning on it.
	 */
	test('phone interface', async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await seed(page);
		await configure(page, { simplifiedMobileUI: true, themeStyle: 'dracula', themeMode: 'dark' });

		await page.goto('/m');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
		// The orb draws from a frame loop and the card's light drifts on its own
		// clock, so this waits for a shape rather than for a paint.
		await page.waitForTimeout(900);
		await shootPhone(page, 'phone_home');

		await page.goto('/m/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await page.waitForTimeout(600);
		await shootPhone(page, 'phone_conversation');

		// Opened on somebody, so the screen has a face, a name and a greeting rather
		// than an orb alone on an empty page.
		await page.goto(`/m/voice?session=${PERSONA_SESSION.id}`);
		// The name in the corner, not the greeting. The greeting is drawn one letter
		// per element with the spaces as widths rather than characters, so its text
		// content has no spaces in it and no text query will ever match it.
		await expect(page.getByRole('link', { name: /Nova/ })).toBeVisible();
		await page.waitForTimeout(900);
		await shootPhone(page, 'phone_voice');
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
		// The state, not the control that undoes it. Asserting on the expand button was
		// asserting on a detail of how the rail is escaped, and it broke the moment two
		// buttons carried that label; what the picture needs is that the conversation
		// list is no longer showing its conversations.
		await expect(page.getByText('Reading a sourdough starter')).toBeHidden();
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

	/**
	 * The framed copies, for the README.
	 *
	 * Last, and from disk rather than from a live page: it dresses whatever the
	 * two tests above have just written, so a frame can never disagree with the
	 * picture it surrounds. Running it on its own works only if the shots are
	 * already there.
	 */
	test('frames', async ({ page }) => {
		for (const name of WINDOW_SHOTS) await frameWindow(page, name);
		for (const name of PHONE_SHOTS) await framePhone(page, name);
		await composeHero(page);
	});
});

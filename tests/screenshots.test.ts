import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * The app's own pictures of itself: drives it to known states and photographs
 * them for the manifest, the README and the docs home page.
 *
 * Run on purpose (`pnpm run screenshots`), never with the suite: it writes into
 * `static/`, which is source.
 */

/** `RAW` is the working captures, gitignored and wiped per run. `OUT` ships. */
const RAW = '.screenshots';
const OUT = 'static/screenshots';
/** Astro's image pipeline needs its own copy, beside the page that imports it. */
const DOCS_OUT = 'docs/src/assets/screenshots';

/**
 * A phone and a laptop. The phone's size also serves the manifest, which wants
 * one aspect ratio per form factor, 320 to 3840px, under 2.3:1.
 */
const MOBILE = { width: 440, height: 956 };

/** The app gets the whole glass; `shootPhone` hands it the insets as CSS variables so it pads itself. */
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

/** The real connection id is the instance's to give, so `sessionsFor` swaps it in by name. */
const MODEL = { name: 'llama3.1:8b', serverId: 'pending' };
const MODEL_B = { name: 'gpt-4o-mini', serverId: 'pending' };

/** Two conversations carry real length; the rest are there to fill the sidebar. */
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
 * Three to talk to for the home row, plus one session bound to a persona: the
 * voice screen is photographed on it, so it shows a face and a greeting rather
 * than an orb on an empty page.
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

/** Two connections, never called. A model without one is a name with no badge. */
const SERVERS = [
	{
		connection: {
			connectionType: 'ollama',
			baseUrl: 'http://localhost:11434',
			label: 'Ollama',
			color: '#C8553D',
			isEnabled: true
		},
		// Named so `guessModelKind` sorts them: the drawing tab and the voice screen
		// both check what a model is before offering themselves.
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
	/** A phone gets `/m` by default, so a shot wanting the responsive layout must say so. */
	simplifiedMobileUI: false,
	/** The one-time switch to `/m` fires for any account that has not had it, and would override the line above. */
	mobileDefaultApplied: true,
	/** Set up but never used: otherwise the voice screen photographs its "nothing configured" notice. */
	voiceInput: true,
	voiceModel: 'whisper-large-v3',
	speechOutput: true,
	speechModel: 'kokoro-82m',
	speechVoice: 'ff_siwis'
};

/**
 * Seeds through the API, not `localStorage`: the instance runs in server mode
 * and every store hydrates from `/api/data`. Written before the first
 * navigation, since the stores read once at boot.
 */
/** Cleared once per run, so a picture never inherits the last run's leftovers. */
let wiped = false;

async function seed(page: Page, patch: Record<string, unknown> = {}) {
	if (!wiped) {
		wiped = true;
		// The database outlives a run, so old sessions would stack up in the sidebar.
		await page.request.post('/api/data/reset');
	}

	/** Connections first: their ids are the instance's to give, so the models are built from what comes back. */
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

/** Merged, not replaced: the endpoint stores the blob whole. */
async function configure(page: Page, patch: Record<string, unknown>) {
	/** An open page flushes its own settings store on teardown, which would land after this. */
	if (page.url().startsWith('http')) await page.goto('about:blank');

	const current = await page.request.get('/api/data/settings');
	const stored = current.ok() ? ((await current.json()) ?? {}) : {};
	await page.request.put('/api/data/settings', {
		data: { ...stored, ...BASE_SETTINGS, models, ...patch }
	});
}

/** Two buttons carry that label, one per width; `.first()` alone found the hidden one. */
function expandSidebar(page: Page) {
	return page.locator('button[aria-label="Expand sidebar"]:visible').first();
}

/** Insets injected rather than emulated: no browser will pretend to have a notch. */
async function shootPhone(page: Page, name: string) {
	await page.addStyleTag({
		content: `:root{--safe-top:${INSETS.top}px;--safe-bottom:${INSETS.bottom}px}`
	});
	await shoot(page, name);
}

/**
 * The app's own faces, before anything is captured.
 *
 * Inter and JetBrains Mono are self-hosted with `font-display: swap`, so the
 * first paint is the system stack. A fixed delay only hid that on a fast
 * machine. `document.fonts.load` resolves when the two families are usable,
 * which is the fact the delay was standing in for.
 */
async function fontsReady(page: Page) {
	await page.evaluate(async () => {
		await Promise.all([
			document.fonts.load('400 1rem Inter'),
			document.fonts.load('700 1rem Inter'),
			document.fonts.load('400 1rem "JetBrains Mono"')
		]);
		await document.fonts.ready;
	});
}

async function shoot(page: Page, name: string) {
	await fontsReady(page);
	// The wallpaper settles a frame or two after the route does.
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${RAW}/${name}.png`, animations: 'disabled' });
}

/** One full screenshot, as a data URL, for the composites to layer. */
async function capture(page: Page) {
	await fontsReady(page);
	const shot = await page.screenshot({ animations: 'disabled' });
	return `data:image/png;base64,${shot.toString('base64')}`;
}

/**
 * Composites screenshots into rows cut by diagonal seams, in the browser, since
 * Playwright cannot. `gap` is the seam width in px, zero draws a hairline;
 * `focus` pans each slice so its content lands inside its band.
 */
async function composeRows(
	page: Page,
	rows: string[][],
	{ gap = 0, focus = [], name }: { gap?: number; focus?: number[]; name: string }
) {
	const width = STRIP.width;
	const rowHeight = STRIP.height;
	await page.setViewportSize({ width, height: rowHeight * rows.length });

	// Half a seam's horizontal travel, as a share of the width.
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
					// The pan rides on the image: a transform on the clipped element drags its clip.
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

	// Seams punched out of the alpha channel, so the strip suits either theme.
	const png = await page.screenshot({ animations: 'disabled', omitBackground: gap > 0 });
	await writeFile(`${OUT}/${name}.png`, png);
	await writeFile(`${DOCS_OUT}/${name}.png`, png);
}

/**
 * Frames for the README, written beside the originals rather than over them:
 * the manifest declares the originals' exact sizes, and a bezel breaks them.
 */
const FRAMED_OUT = `${OUT}/framed`;

/** The frames the documentation site imports. Astro's image pipeline reads its
    own folder, and a frame copied there by hand is a frame that drifts. */
const DOCS_FRAMES = new Set([
	'desktop_conversation',
	'desktop_library',
	'desktop_wallpaper',
	'phone_home',
	'phone_voice'
]);

const docsCopy = (name: string) => (DOCS_FRAMES.has(name) ? `${DOCS_OUT}/${name}.png` : undefined);

/*
 * A frame is written with no room around it: the shadow is drawn by whoever
 * displays it now.
 *
 * Baked in, it went into `PAD` pixels of margin, and a 64px blur does not fit in
 * 60: every file ended while its shadow was still at 8% black. The docs site
 * puts it back in CSS, and the README shows the frames flat.
 *
 * The hero is the exception: a phone leaning on a window has to cast onto it to
 * read as leaning, so it keeps its shadows and the room they need.
 */
const PAD = 0;

/** The hero's shadows are deep, and they fall inside the file. */
const HERO_PAD = 160;

/** The side buttons sit on the chassis edge and stand 2px off it, so a phone
    written with no margin at all would have them shaved off. */
const BUTTON = 2;

/** The Mac window's title bar: tall enough for three lights and nothing else. */
const TITLE_BAR = 30;

/** An iPhone 17 Pro Max, in the CSS pixels its 440x956pt screen is captured at. */
const PHONE = { bezel: 13, corner: 66, screen: 53, statusBar: 54, homeBar: 34 };

/** The whole screen is 956, furniture included, and so is the capture: the app runs behind the clock as it does on a device. */
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

/** The colour the shot ends on, so the frame continues it whatever theme or wallpaper is in force. */
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

/** Shared, since a frame is needed alone and inside the composite. Per-shot values travel as custom properties. */
const FRAME_CSS = `
	html, body { margin: 0; background: transparent; }

	.window {
		position: absolute;
		width: ${WINDOW_SIZE.width}px;
		border-radius: 11px;
		overflow: hidden;
		background: var(--bar);
		/* The ring is the chassis; the drop is the composite's business, and off by
		   default. Transparent rather than none, which cannot sit in a list. */
		box-shadow: var(--drop, 0 0 0 rgba(0, 0, 0, 0)), 0 0 0 1px var(--ring);
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
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .22), var(--drop, 0 0 0 rgba(0, 0, 0, 0));
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

/** A minimal macOS window: rounded corners, one bar, three lights. */
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

/** The bars sit above and below the shot: the app is captured with a nought safe area, so an island on top would cover its header. */
function phoneHtml(src: string, e: Edges, place = `top:${PAD + BUTTON}px;left:${PAD + BUTTON}px`) {
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
	// A second copy for Astro's image pipeline, which reads its own folder.
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
		out: `${FRAMED_OUT}/${name}.png`,
		alsoOut: docsCopy(name)
	});
}

async function framePhone(page: Page, name: string) {
	const src = await readShot(name);
	await page.setContent('<body></body>');
	const e = await edges(page, src);

	await draw(page, {
		width: PHONE_SIZE.width + (PAD + BUTTON) * 2,
		height: PHONE_SIZE.height + (PAD + BUTTON) * 2,
		body: phoneHtml(src, e),
		out: `${FRAMED_OUT}/${name}.png`,
		alsoOut: docsCopy(name)
	});
}

/**
 * The README's picture: a window with a phone leaning on it, dark, over a
 * wallpaper. Both formats whole, on a transparent ground.
 */
const HERO = {
	/** The shot in the window, and the one in the phone. */
	window: 'desktop_wallpaper',
	/** The phone interface, not the responsive layout at a phone's width: the README should show two interfaces, not one that shrinks. */
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
	const phoneLeft = HERO_PAD + WINDOW_SIZE.width + HERO.overhangX - phoneWidth;
	const phoneTop = HERO_PAD + WINDOW_SIZE.height + HERO.overhangY - phoneHeight;

	await draw(page, {
		width: WINDOW_SIZE.width + HERO.overhangX + HERO_PAD * 2,
		height: WINDOW_SIZE.height + HERO.overhangY + HERO_PAD * 2,
		body:
			windowHtml(
				windowSrc,
				windowEdges,
				`top:${HERO_PAD}px;left:${HERO_PAD}px;` +
					`--drop:0 2px 5px rgba(0,0,0,.16), 0 26px 64px rgba(0,0,0,.3)`
			) +
			phoneHtml(
				phoneSrc,
				phoneEdges,
				// Darker and wider than the window's, or the two look pasted.
				`top:${phoneTop}px;left:${phoneLeft}px;transform:scale(${HERO.scale});` +
					`--drop:0 40px 90px rgba(0,0,0,.45)`
			),
		out: `${OUT}/hero.png`,
		// Astro's image pipeline reads from its own folder rather than from `static/`.
		alsoOut: `${DOCS_OUT}/hero.png`
	});
}

test.beforeAll(async () => {
	// Astro's image pipeline reads its own folder, not `static/`.
	await rm(RAW, { recursive: true, force: true });
	await mkdir(RAW, { recursive: true });
	await mkdir(OUT, { recursive: true });
	await mkdir(DOCS_OUT, { recursive: true });
	await mkdir(FRAMED_OUT, { recursive: true });
});

test.describe('screenshots', () => {
	// Wiped first: a stale capture frames cleanly and ships.
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

	/** Its own test: it needs the setting the others turn off, and the README opens on it. */
	test('phone interface', async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await seed(page);
		await configure(page, { simplifiedMobileUI: true, themeStyle: 'dracula', themeMode: 'dark' });

		await page.goto('/m');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
		// The orb and the card's light run on their own clocks.
		await page.waitForTimeout(900);
		await shootPhone(page, 'phone_home');

		await page.goto('/m/sessions/ab12cd');
		await expect(page.getByText('Is self-hosting worth it')).toBeVisible();
		await page.waitForTimeout(600);
		await shootPhone(page, 'phone_conversation');

		// Opened on somebody, so the screen has a face, a name and a greeting.
		await page.goto(`/m/voice?session=${PERSONA_SESSION.id}`);
		// The greeting is drawn one letter per element, so no text query matches it.
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

		// The collapsed rail, which is a different way of using the app.
		await configure(page, { sidebarExpanded: false });
		await page.goto('/sessions/ab12cd');
		// Asserting on the expand button broke once two buttons carried that label.
		await expect(page.getByText('Reading a sourdough starter')).toBeHidden();
		await shoot(page, 'desktop_rail');

		await configure(page, { sidebarExpanded: true, themeMode: 'dark' });
		await page.goto('/sessions/ab12cd');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await shoot(page, 'desktop_conversation_dark');

		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		await shoot(page, 'desktop_library');

		// A wallpaper: the column translucent over it, the conversation opaque on top.
		// Dark, because this is the hero's window on the README and the docs home.
		// `configure` lays `BASE_SETTINGS` over what is stored, so the mode has to be
		// said again rather than carried over from the shot above.
		await configure(page, {
			backgroundImage: 'pack:ocean',
			surfaceTransparency: true,
			themeMode: 'dark'
		});
		await page.goto('/sessions/ab12cd');
		await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'on');
		await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'dark');
		await shoot(page, 'desktop_wallpaper');

		await configure(page, { backgroundImage: '', themeMode: 'light' });
		await page.goto('/sessions');
		await page.getByLabel('Settings', { exact: true }).click();
		await page.getByRole('tab', { name: 'Interface' }).click();
		await expect(page.getByText('Theme style')).toBeVisible();
		await shoot(page, 'desktop_settings');
	});

	/**
	 * Six palettes, light on top and dark below, same conversation at the same
	 * scroll. Two rows: alternating showed each palette in only one of its halves.
	 */
	test('theme strip', async ({ page }) => {
		await seed(page);
		await page.setViewportSize(STRIP);

		const rows: string[][] = [];
		for (const themeMode of ['light', 'dark'] as const) {
			const row: string[] = [];
			for (const themeStyle of THEME_STYLES) {
				// The flat bar, not the floating pill, which half-covers a line of text.
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

	/** One palette, four parts of the app. Wide bands and a thin seam: a narrow band of a wide window is mostly the space between things. */
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

		// Where each section has something to show.
		await composeRows(page, [shots], { gap: 6, focus: [260, 620, 900, 1150], name: 'sections' });
	});

	/** Last, and from disk, so a frame can never disagree with the picture it surrounds. */
	test('frames', async ({ page }) => {
		for (const name of WINDOW_SHOTS) await frameWindow(page, name);
		for (const name of PHONE_SHOTS) await framePhone(page, name);
		await composeHero(page);
	});
});

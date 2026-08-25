import { existsSync } from 'node:fs';
import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * A Chromium already on the machine, when there is one.
 *
 * `playwright install` fetches its own build, a few hundred megabytes a laptop
 * that already has Chromium in /Applications has no use for. CI has no such
 * copy and installs the browser itself, so the probe is skipped there, and
 * `CHROMIUM_PATH` overrides both.
 */
const INSTALLED = [
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

const executablePath =
	process.env.CHROMIUM_PATH ?? (process.env.CI ? undefined : INSTALLED.find(existsSync));

const config: PlaywrightTestConfig = {
	/**
	 * An instance of its own, for the run.
	 *
	 * Two things matter here and both used to be inherited from whatever `.env`
	 * the machine happened to have. `AUTH_CREDENTIALS` off, so the instance has no
	 * way to sign in and therefore never asks: with it on, every test failed at the
	 * login page rather than at the thing it was testing. And `DATA_DIR` in a
	 * throwaway folder, so a run never reads or writes the database somebody is
	 * using.
	 */
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		env: {
			AUTH_CREDENTIALS: 'false',
			DATA_DIR: './.playwright-data',
			// The secret is what encrypts stored keys, and the app refuses to start
			// without one. Fixed here because nothing in a test run outlives it.
			AUTH_SECRET: 'playwright-only-secret-not-used-anywhere-else',
			// The welcome tour opens over a fresh instance, which is the correct
			// behaviour and covers every page a test wants to click. The app already
			// has the switch for this.
			PUBLIC_DISABLE_ONBOARDING: 'true'
		}
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,
	// Five seconds was right for a browser talking to a mocked endpoint. A turn now
	// runs in the server, streams back, and is written down on the way: fifteen.
	timeout: 15_000,
	workers: process.env.CI ? 1 : undefined,
	retries: process.env.CI ? 2 : 0,
	use: {
		trace: 'retain-on-failure',
		contextOptions: {
			permissions: ['clipboard-write', 'clipboard-read']
		},
		viewport: { width: 1280, height: 1024 },
		launchOptions: executablePath ? { executablePath } : {}
	},
	snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
	expect: {
		toMatchSnapshot: {
			maxDiffPixels: 900
		}
	}
};

export default config;

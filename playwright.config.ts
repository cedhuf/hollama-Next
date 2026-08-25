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
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,
	timeout: 5000,
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

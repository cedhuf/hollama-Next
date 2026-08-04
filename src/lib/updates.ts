import { getUnixTime } from 'date-fns';
import semver from 'semver';
import { get, writable } from 'svelte/store';

import { version } from '$app/environment';
import { APP_NAME } from '$lib/brand';
import { settingsStore } from '$lib/localStorage';

import type { LloomaMetadata } from '../routes/api/metadata/+server';
import { GITHUB_RELEASES_API } from './github';

const DEV_VERSION_SUFFIX = '-dev';
const METADATA_ENDPOINT = '/api/metadata';
const ONE_WEEK_IN_SECONDS = 604800;

/**
 * Which half of the check failed.
 *
 * A check asks two different things: this instance's own `/api/metadata`, and
 * the release list on GitHub. They fail for unrelated reasons and call for
 * unrelated answers, so reporting a single "couldn't check" told the user the
 * one thing they already knew. `server` takes precedence when both fail: a
 * server that cannot be reached is the more immediate problem.
 */
export type UpdateFailure = 'server' | 'releases' | null;

export interface UpdateStatus {
	isCurrentVersionLatest: boolean;
	isCheckingForUpdates: boolean;
	failure: UpdateFailure;
	/** Empty until a check has run, so nothing is announced on a cold start. */
	latestVersion: string;
}

export const updateStatusStore = writable<UpdateStatus>({
	isCurrentVersionLatest: false,
	isCheckingForUpdates: false,
	failure: null,
	latestVersion: ''
});

/**
 * Whether `candidate` is a strictly newer version than `current`.
 *
 * Development builds carry a `-dev` suffix, and a release tag may not be a clean
 * semver string, so both sides go through `coerce`. Anything it can't make sense
 * of answers `false`: an unreadable tag must not be announced as an update, and
 * `semver.gt` throws on invalid input rather than returning false.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
	const parse = (value: string) =>
		semver.valid(semver.coerce(value.replace(DEV_VERSION_SUFFIX, '')));
	const a = parse(candidate ?? '');
	const b = parse(current ?? '');
	return !!a && !!b && semver.gt(a, b);
}

export async function checkForUpdates(isUserInitiated = false): Promise<void> {
	const settings = get(settingsStore);
	if (!(settings.autoCheckForUpdates === false)) settings.autoCheckForUpdates = true;

	// If the user hasn't initiated the check we check if the last update check
	// was made more than a week ago
	const oneWeekAgoInSeconds = getUnixTime(new Date()) - ONE_WEEK_IN_SECONDS;
	if (!settings.lastUpdateCheck) settings.lastUpdateCheck = oneWeekAgoInSeconds - 1;
	if (!isUserInitiated && settings.lastUpdateCheck > oneWeekAgoInSeconds) return;

	// `get()` hands back the stored object itself, so mutating it in place never
	// reaches a subscriber: the spinner and the disabled button both need a set().
	// `failure` is cleared here too, or one failure would stick to every later
	// check.
	updateStatusStore.update((current) => ({
		...current,
		isCheckingForUpdates: true,
		failure: null
	}));
	const status: UpdateStatus = { ...get(updateStatusStore) };

	// The server may have been updated under a tab that stayed open, so start from
	// what it reports rather than from what this build was compiled with.
	try {
		const response = await fetch(METADATA_ENDPOINT);
		settings.lloomaMetadata = (await response.json()) as LloomaMetadata;
	} catch {
		console.error(`Failed to fetch ${APP_NAME} server metadata`);
		status.failure = 'server';
	}

	status.latestVersion = settings.lloomaMetadata.currentVersion;
	// The running server is already ahead of the code this tab loaded: a reload is
	// enough, no need to ask GitHub anything.
	const serverIsAhead = isNewerVersion(status.latestVersion, version);

	if (!serverIsAhead) {
		// This build is what the server serves, so the only place left to look is
		// the release list on GitHub.
		try {
			const releases = await (await fetch(GITHUB_RELEASES_API)).json();
			// Drafts and pre-releases come back in the same list, and the newest
			// entry is not necessarily one we want to offer.
			const release = Array.isArray(releases)
				? releases.find((entry) => entry?.tag_name && !entry.draft && !entry.prerelease)
				: undefined;
			if (release) status.latestVersion = release.tag_name;
		} catch {
			// The release list is public but rate limited per IP, so a shared
			// instance behind one address can be refused while everything else works.
			console.error('Failed to fetch GitHub releases');
			status.failure ??= 'releases';
		}
	}

	status.isCurrentVersionLatest = !isNewerVersion(status.latestVersion, version);
	status.isCheckingForUpdates = false;
	updateStatusStore.set(status);

	// Update the settings store with today's date so we don't check again for updates
	settings.lastUpdateCheck = getUnixTime(new Date());
	// The store is in memory, so a reload would leave the panel with nothing to
	// report next to the timestamp it just showed. Only a clean check is recorded:
	// a failed one must not overwrite an answer that was known to be good.
	if (!status.failure) settings.lastKnownVersion = status.latestVersion;
	settingsStore.set(settings);
}

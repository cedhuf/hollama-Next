import { getUnixTime } from 'date-fns';
import semver from 'semver';
import { get, writable } from 'svelte/store';

import { version } from '$app/environment';
import { settingsStore } from '$lib/localStorage';

import type { HollamaNextMetadata } from '../routes/api/metadata/+server';
import { GITHUB_RELEASES_API } from './github';

const HOLLAMA_DEV_VERSION_SUFFIX = '-dev';
const HOLLAMA_METADATA_ENDPOINT = '/api/metadata';
const ONE_WEEK_IN_SECONDS = 604800;

export interface UpdateStatus {
	canRefreshToUpdate: boolean;
	isCurrentVersionLatest: boolean;
	isCheckingForUpdates: boolean;
	showSidebarNotification: boolean;
	couldntCheckForUpdates: boolean;
	latestVersion: string;
}

export const updateStatusStore = writable<UpdateStatus>({
	canRefreshToUpdate: false,
	isCurrentVersionLatest: false,
	isCheckingForUpdates: false,
	showSidebarNotification: false,
	couldntCheckForUpdates: false,
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
function isNewerVersion(candidate: string, current: string): boolean {
	const parse = (value: string) =>
		semver.valid(semver.coerce(value.replace(HOLLAMA_DEV_VERSION_SUFFIX, '')));
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
	// `couldntCheckForUpdates` is cleared here too, or one failure would stick to
	// every later check.
	updateStatusStore.update((current) => ({
		...current,
		isCheckingForUpdates: true,
		couldntCheckForUpdates: false
	}));
	const status: UpdateStatus = { ...get(updateStatusStore) };

	// The server may have been updated under a tab that stayed open, so start from
	// what it reports rather than from what this build was compiled with.
	try {
		const response = await fetch(HOLLAMA_METADATA_ENDPOINT);
		settings.hollamaMetadata = (await response.json()) as HollamaNextMetadata;
	} catch {
		console.error('Failed to fetch Hollama Next server metadata');
		status.couldntCheckForUpdates = true;
	}

	status.latestVersion = settings.hollamaMetadata.currentVersion;
	status.canRefreshToUpdate = isNewerVersion(status.latestVersion, version);

	if (!status.canRefreshToUpdate) {
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
			console.error('Failed to fetch GitHub releases');
			status.couldntCheckForUpdates = true;
		}
	}

	status.isCurrentVersionLatest = !isNewerVersion(status.latestVersion, version);
	status.showSidebarNotification = !status.isCurrentVersionLatest;
	status.isCheckingForUpdates = false;
	updateStatusStore.set(status);

	// Update the settings store with today's date so we don't check again for updates
	settings.lastUpdateCheck = getUnixTime(new Date());
	settingsStore.set(settings);
}

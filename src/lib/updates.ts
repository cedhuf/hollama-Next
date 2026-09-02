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
 * Which half of the check failed: this instance's `/api/metadata`, or the
 * release list on GitHub. They fail for unrelated reasons, so one "couldn't
 * check" told the user what they already knew. `server` wins when both fail.
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

/** Both sides go through `coerce`: development builds carry `-dev`, and a release tag may not be clean semver. Anything unreadable answers `false`, since `semver.gt` throws on invalid input. */
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

	// Unprompted, only if the last check was more than a week ago.
	const oneWeekAgoInSeconds = getUnixTime(new Date()) - ONE_WEEK_IN_SECONDS;
	if (!settings.lastUpdateCheck) settings.lastUpdateCheck = oneWeekAgoInSeconds - 1;
	if (!isUserInitiated && settings.lastUpdateCheck > oneWeekAgoInSeconds) return;

	// `get()` hands back the stored object itself, so mutating in place never
	// reaches a subscriber. `failure` is cleared here too, or one failure would
	// stick to every later check.
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
	// enough, and there is nothing to ask GitHub.
	const serverIsAhead = isNewerVersion(status.latestVersion, version);

	if (!serverIsAhead) {
		// This build is what the server serves, so the only place left is GitHub.
		try {
			const releases = await (await fetch(GITHUB_RELEASES_API)).json();
			// Drafts and pre-releases come back in the same list, and the newest entry is
			// not necessarily one to offer.
			const release = Array.isArray(releases)
				? releases.find((entry) => entry?.tag_name && !entry.draft && !entry.prerelease)
				: undefined;
			if (release) status.latestVersion = release.tag_name;
		} catch {
			// The release list is public but rate limited per IP, so a shared instance
			// behind one address can be refused while everything else works.
			console.error('Failed to fetch GitHub releases');
			status.failure ??= 'releases';
		}
	}

	status.isCurrentVersionLatest = !isNewerVersion(status.latestVersion, version);
	status.isCheckingForUpdates = false;
	updateStatusStore.set(status);

	// Stamped, so the next unprompted check waits a week.
	settings.lastUpdateCheck = getUnixTime(new Date());
	// The store is in memory, so a reload would leave the panel with nothing to
	// report next to its timestamp. Only a clean check is recorded: a failed one
	// must not overwrite an answer that was known to be good.
	if (!status.failure) settings.lastKnownVersion = status.latestVersion;
	settingsStore.set(settings);
}

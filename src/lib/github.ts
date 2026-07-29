export const GITHUB_RELEASES_API = 'https://api.github.com/repos/cedhuf/hollama-Next/releases';
export const GITHUB_RELEASES_URL = 'https://github.com/cedhuf/hollama-Next/releases';
export const GITHUB_URL = 'https://github.com/cedhuf/hollama-Next';

/** The page for one release, so an update points at its own notes. */
export function releaseUrl(version: string): string {
	return version ? `${GITHUB_RELEASES_URL}/tag/${version}` : GITHUB_RELEASES_URL;
}

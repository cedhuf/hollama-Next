export const GITHUB_RELEASES_API = 'https://api.github.com/repos/cedhuf/llooma/releases';
export const GITHUB_RELEASES_URL = 'https://github.com/cedhuf/llooma/releases';
export const GITHUB_URL = 'https://github.com/cedhuf/llooma';
/** The maintainer's profile — what "by cedhuf" points at. */
export const AUTHOR_URL = 'https://github.com/cedhuf';
/** The documentation site, published from `docs/` by GitHub Actions. */
export const DOCS_URL = 'https://llooma.eu';

/** The page for one release, so an update points at its own notes. */
export function releaseUrl(version: string): string {
	return version ? `${GITHUB_RELEASES_URL}/tag/${version}` : GITHUB_RELEASES_URL;
}

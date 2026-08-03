import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { APP_NAME } from '$lib/brand';

/**
 * Reads a web page server-side and returns its text.
 *
 * The URL comes from the client, so this runs inside the server's network: left
 * unguarded it is a Server-Side Request Forgery hole, letting anyone who can
 * reach the instance probe its private network or read a cloud provider's
 * metadata endpoint. Every address is therefore resolved and checked before a
 * request goes out, on the initial URL *and* on every redirect it is sent to.
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
/** Bytes read off the wire before giving up, whatever the page claims. */
const MAX_BYTES = 2 * 1024 * 1024;

export interface FetchedPage {
	url: string;
	title: string;
	text: string;
	truncated: boolean;
}

export class FetchPageError extends Error {}

/** Address ranges a request from the server must never reach. */
function isBlockedAddress(address: string): boolean {
	if (isIP(address) === 6) {
		const ip = address.toLowerCase();
		// Loopback, unspecified, unique-local (fc00::/7) and link-local (fe80::/10).
		if (ip === '::1' || ip === '::') return true;
		if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true;
		if (/^fe[89ab][0-9a-f]:/.test(ip)) return true;
		// IPv4-mapped addresses smuggle an IPv4 target through an IPv6 literal.
		const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		return mapped ? isBlockedAddress(mapped[1]) : false;
	}

	const [a, b] = address.split('.').map(Number);
	if (a === 127 || a === 0 || a === 10) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	// 169.254/16 is link-local, and holds the cloud metadata endpoint.
	if (a === 169 && b === 254) return true;
	// Carrier-grade NAT, and anything from 224 up (multicast, reserved).
	if (a === 100 && b >= 64 && b <= 127) return true;
	return a >= 224;
}

/** Throws unless the URL is http(s) and every address its host resolves to is public. */
async function assertReachable(url: URL, allowedOrigins: string[]): Promise<void> {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new FetchPageError(`Unsupported protocol: ${url.protocol}`);
	}

	if (allowedOrigins.length && !allowedOrigins.includes(url.origin)) {
		throw new FetchPageError(`${url.origin} is not in the allowed origins`);
	}

	// A literal IP never reaches DNS, so check it directly.
	if (isIP(url.hostname)) {
		if (isBlockedAddress(url.hostname)) throw new FetchPageError('Address is not routable');
		return;
	}

	let addresses: { address: string }[];
	try {
		addresses = await lookup(url.hostname, { all: true });
	} catch {
		throw new FetchPageError(`Cannot resolve ${url.hostname}`);
	}
	// Every answer has to be public: one private address in the set is enough for
	// the request to land somewhere it shouldn't.
	if (addresses.some(({ address }) => isBlockedAddress(address))) {
		throw new FetchPageError('Address is not routable');
	}
}

/** GitHub's HTML page for a file is mostly chrome; the raw file is the content. */
export function toRawUrl(raw: string): string {
	const blob = raw.match(
		/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:[?#].*)?$/
	);
	if (blob) {
		const [, owner, repo, ref, path] = blob;
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
	}
	return raw;
}

/** Strips the markup and keeps what a reader would actually read. */
function htmlToText(html: string): { title: string; text: string } {
	const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';

	let body = html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');

	// Prefer the article container when the page marks one: it drops menus,
	// cookie banners and comment threads without needing to score anything.
	const main = body.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
	if (main) body = main[2];

	const text = body
		// Keep the line structure the block elements imply.
		.replace(/<(\/?(p|div|li|tr|h[1-6]|br|pre))\b[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^[ \t]+|[ \t]+$/gm, '')
		.trim();

	return { title, text };
}

/** Reads the body without letting a huge (or endless) response through. */
async function readCapped(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';

	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < MAX_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.length;
	}
	await reader.cancel().catch(() => {});

	return new TextDecoder('utf-8', { fatal: false }).decode(
		chunks.reduce((all, chunk) => {
			const next = new Uint8Array(all.length + chunk.length);
			next.set(all);
			next.set(chunk, all.length);
			return next;
		}, new Uint8Array())
	);
}

/**
 * Fetches one page and returns its readable text, capped at `maxChars`.
 *
 * Redirects are followed by hand so each hop can be checked: `redirect: 'follow'`
 * would let a public host bounce the request to a private one.
 */
export async function fetchPage(
	target: string,
	maxChars: number,
	allowedOrigins: string[] = []
): Promise<FetchedPage> {
	let url: URL;
	try {
		url = new URL(toRawUrl(target));
	} catch {
		throw new FetchPageError(`Not a valid URL: ${target}`);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		let response: Response | undefined;
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			await assertReachable(url, allowedOrigins);
			response = await fetch(url, {
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					// Some sites serve a stub to unknown agents; identify honestly anyway.
					'user-agent': `${APP_NAME}/1.0 (+https://github.com/cedhuf/hollama-Next)`,
					accept: 'text/html,text/plain,text/markdown;q=0.9,*/*;q=0.1'
				}
			});

			const location = response.headers.get('location');
			if (response.status >= 300 && response.status < 400 && location) {
				url = new URL(location, url);
				continue;
			}
			break;
		}

		if (!response) throw new FetchPageError('No response');
		if (!response.ok) throw new FetchPageError(`${response.status} ${response.statusText}`);

		const contentType = response.headers.get('content-type') ?? '';
		const isText = /^text\/(html|plain|markdown|x-markdown)/i.test(contentType);
		if (!isText) {
			throw new FetchPageError(
				`Unsupported content type: ${contentType.split(';')[0] || 'unknown'}`
			);
		}

		const body = await readCapped(response);
		const { title, text } = /^text\/html/i.test(contentType)
			? htmlToText(body)
			: { title: '', text: body.trim() };

		if (!text) throw new FetchPageError('The page has no readable text');

		return {
			url: url.toString(),
			title: title || url.hostname,
			text: text.slice(0, maxChars),
			truncated: text.length > maxChars
		};
	} finally {
		clearTimeout(timeout);
	}
}

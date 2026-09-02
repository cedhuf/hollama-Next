/**
 * A written answer, turned into things a voice can say.
 *
 * Lifted out of `speech.svelte.ts` when the server needed it too: two copies of
 * a splitter is two answers to "where does a sentence end", and the seams would
 * be in different places depending on who was reading.
 *
 * No runtime of its own and no imports. It is string work, and it runs on both
 * sides.
 */

/** The ceiling the server enforces, repeated here so a sentence is cut before it is sent rather than refused after. */
const CHUNK_LIMIT = 2_000;

/** The first piece is shorter than the rest: it is the only one whose wait anybody experiences, since every other is made while the one before it plays. */
const FIRST_CHUNK = 240;
const CHUNK = 700;

/**
 * What a reply sounds like once the typography is taken out of it: read
 * literally, a heading becomes "hash hash Results" and a code block a minute of
 * punctuation. It goes before anything is sent, so it is not paid for either.
 *
 * Fenced code goes entirely rather than being flattened: nobody wants a shell
 * script read to them, and the screen still has it.
 */
export function spoken(text: string): string {
	return (
		text
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/`([^`]+)`/g, '$1')
			// A link is read as its words. The address is for the eye.
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/^\s{0,3}#{1,6}\s+/gm, '')
			.replace(/^\s{0,3}>\s?/gm, '')
			.replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, '')
			.replace(/(\*\*|__|\*|_|~~)/g, '')
			.replace(/^\s*\|.*\|\s*$/gm, ' ')
			.replace(/[ \t]+/g, ' ')
			.replace(/\n{2,}/g, '\n')
			.trim()
	);
}

/** Sentence ends first, then any line break, then a space, and only failing all three does it cut mid-word: a wall of text with no punctuation, where any cut is arbitrary. */
export function split(text: string): string[] {
	const pieces: string[] = [];
	let rest = text;
	let budget = FIRST_CHUNK;

	while (rest.length) {
		if (rest.length <= budget) {
			pieces.push(rest);
			break;
		}

		const window = rest.slice(0, Math.min(budget, CHUNK_LIMIT));
		// In order of how much a listener would notice the seam. `lastIndexOf` answers
		// -1 rather than nothing, so it is compared rather than coalesced.
		const sentence = lastOf(window, /[.!?…](?=\s|$)/g);
		const line = window.lastIndexOf('\n');
		const space = window.lastIndexOf(' ');
		const at = sentence ?? (line >= 0 ? line : space);
		// Too early a cut is worse than a long piece: it turns one sentence into two
		// requests and puts a gap in the middle of a clause.
		const cut = at > budget / 3 ? at + 1 : window.length;

		pieces.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
		budget = CHUNK;
	}

	return pieces.filter(Boolean);
}

/** Where the last match of a pattern ends, or nothing when there is none. */
function lastOf(text: string, pattern: RegExp): number | null {
	let found: number | null = null;
	for (const match of text.matchAll(pattern)) found = match.index;
	return found;
}

/**
 * A written answer, turned into things a voice can say.
 *
 * Lifted out of `speech.svelte.ts` when the server started needing it too: the
 * browser used to be the only place that cut an answer into pieces, and the
 * voice pipeline cuts it exactly the same way, for exactly the same reason. Two
 * copies of a splitter is two answers to "where does a sentence end", and the
 * seams would be in different places depending on who was reading.
 *
 * No runtime of its own, no imports. It is string work, and it runs on both
 * sides.
 */

/**
 * The ceiling the server enforces, repeated here so a sentence is cut before it
 * is sent rather than refused after.
 */
const CHUNK_LIMIT = 2_000;

/**
 * Small enough to start fast, large enough not to chop a thought in half.
 *
 * The first piece is deliberately shorter than the rest: it is the only one whose
 * wait anybody experiences, since every other piece is made while the one before
 * it is still playing.
 */
const FIRST_CHUNK = 240;
const CHUNK = 700;

/**
 * What a reply sounds like once the typography is taken out of it.
 *
 * Markdown is written to be looked at. Read literally, a heading becomes "hash
 * hash Results", a bold word becomes "star star important star star", and a code
 * block becomes a minute of punctuation. None of that is what was said, so it
 * goes before anything is sent, which also means it is not paid for.
 *
 * Fenced code goes entirely rather than being flattened. Nobody wants a shell
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

/**
 * The text in pieces, cut where a reader would pause.
 *
 * Sentence ends first, then any line break, then a space, and only if none of
 * those turns up within the budget does it cut mid-word. That last case is a
 * wall of text with no punctuation in it, where any cut is arbitrary and the
 * alternative is not reading it at all.
 */
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
		// -1 rather than nothing, so it is compared rather than coalesced: a `??`
		// chain here would take -1 for a perfectly good position.
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

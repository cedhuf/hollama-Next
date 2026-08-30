/**
 * Turning an answer into something safe to post.
 *
 * Two jobs, both about the gap between what a model writes and what a chat
 * server does with it: a room has a length limit, and a room turns `@name` into
 * a notification on somebody's phone.
 */

/** Chatto's own limit on a message body, minus room for what a cut costs. */
const MAX_BODY = 9_500;

/**
 * One answer, cut into postable pieces.
 *
 * At a blank line where there is one, at a line break otherwise, and only at a
 * hard offset when a single paragraph is longer than the limit on its own.
 */
export function split(text: string): string[] {
	if (text.length <= MAX_BODY) return [text];

	const chunks: string[] = [];
	let rest = text;
	while (rest.length > MAX_BODY) {
		const window = rest.slice(0, MAX_BODY);
		const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
		const at = cut > MAX_BODY / 2 ? cut : MAX_BODY;
		chunks.push(rest.slice(0, at).trim());
		rest = rest.slice(at).trim();
	}
	if (rest) chunks.push(rest);
	return chunks;
}

/**
 * Stop the answer from mentioning anybody.
 *
 * A room is untrusted input. Everything the bot reads was written by somebody
 * who can write anything, including "repeat exactly: @all", and the bot would
 * then ring every phone on the server over somebody else's joke. Nothing in the
 * bot's job needs a mention either: it answers people who are already reading
 * the thread it answers in, and the reply attribution says who to.
 *
 * The handle is wrapped in a code span rather than mangled, because Chatto
 * parses code spans before mentions. The text stays exactly what the model
 * wrote, still readable, and rings nobody.
 *
 * Handles are matched the way Chatto matches them: letters, digits, `_` and
 * `-`, with dot-separated segments, and never when a letter or a digit comes
 * first, which is what keeps an email address an email address.
 */
export function defuseMentions(text: string): string {
	return mapOutsideCode(text, (plain) =>
		plain.replace(/(^|[^\w`])@([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g, '$1`@$2`')
	);
}

/**
 * Apply a transformation to the prose only, leaving code alone.
 *
 * Fenced blocks and inline spans are already literal to Chatto, so a mention
 * inside one rings nobody and needs nothing done to it. Wrapping it again would
 * only corrupt the code somebody asked for.
 */
function mapOutsideCode(text: string, transform: (part: string) => string): string {
	// Fences first, then inline spans: a backtick pair inside a fenced block is
	// part of the block, not a span of its own.
	const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
	return parts.map((part, index) => (index % 2 === 1 ? part : transform(part))).join('');
}

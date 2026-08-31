/**
 * MCP servers this instance may call out to, and what one is made of.
 *
 * An MCP server is a catalogue of tools living somewhere else. Llooma is a
 * client only: it lists what a server offers, hands those definitions to the
 * model beside its own tools, and forwards the calls that come back. It never
 * serves tools to anybody.
 *
 * One transport, HTTP streamable, and that is a decision rather than a first
 * step. The other transport in the protocol, stdio, spawns a process: on an
 * instance with accounts on it that is arbitrary code execution on the host,
 * triggered by whatever address a user typed into a form. There is no careful
 * version of that without a sandbox. HTTP is also where the protocol itself is
 * heading, so nothing is being given up.
 */

/** A server as its owner configured it, without the credential. */
export interface McpServerView {
	id: string;
	label: string;
	/** What its tools are named after in front of the model. Derived from the label, kept unique. */
	slug: string;
	url: string;
	/** What the owner wants. */
	enabled: boolean;
	/** What the instance allows, which is not the same question. */
	blocked: boolean;
	hasSecret: boolean;
	createdAt: string;
}

/**
 * The bounds a turn holds an MCP server to.
 *
 * All of them are about a server that is slow, enormous or hostile, which is the
 * only kind worth writing limits for. A well-behaved one never meets any of
 * these numbers.
 */
export const MCP_LIMITS = {
	/** Servers one account may configure. */
	perUser: 10,
	/** Tools taken from one server's catalogue. The rest are dropped, and said so. */
	toolsPerServer: 40,
	/** How much of one result reaches the model, in characters. */
	resultChars: 20_000,
	/** Listing a catalogue, which happens once per turn per server. */
	listTimeoutMs: 10_000,
	/** One call. Generous: an MCP tool may be doing real work at the other end. */
	callTimeoutMs: 30_000,
	/**
	 * How long a call waits for a person to allow or refuse it.
	 *
	 * It has to end somewhere: a turn parked on a question nobody is there to
	 * answer would hold its connections, its run and its place in the conversation
	 * until the process restarts. Running out counts as a refusal, never as
	 * consent, and the model is told which of the two happened.
	 */
	approvalTimeoutMs: 120_000
} as const;

/**
 * One call, put to the person before it is made.
 *
 * Every MCP call is asked for. Not the risky-looking ones, not the first one of a
 * turn: every one. The alternative is a rule about which tools are dangerous,
 * written by us, about tools we have never seen, on servers we do not run. The
 * description comes from the server too, so it cannot be the basis of the
 * decision either.
 *
 * What it carries is what a person needs to answer: which machine, which tool,
 * what that tool says it does, and the exact arguments it would be called with.
 */
export interface McpApprovalRequest {
	/** The provider's id for the call, and what the answer is addressed to. */
	id: string;
	/** The server's label, as its owner named it. */
	server: string;
	/** The tool's own name, without the prefix the model sees. */
	tool: string;
	/** What the server says the tool does. Empty when it says nothing. */
	purpose: string;
	/** The arguments, formatted for reading. */
	arguments: string;
}

/** The prefix every MCP tool name carries, so nothing can collide with our own. */
export const MCP_TOOL_PREFIX = 'mcp';

/**
 * A label turned into something that can live in a tool name.
 *
 * Providers accept `[a-zA-Z0-9_-]{1,64}` there, so the slug is reduced to that
 * alphabet. Empty input, or a label made entirely of characters that do not
 * survive, falls back to `server`: the caller makes it unique afterwards, so a
 * dull name is never a broken one.
 */
export function slugify(label: string): string {
	const slug = label
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 24);
	return slug || 'server';
}

/**
 * What the model sees this tool called.
 *
 * Prefixed twice over: once with `mcp` so an external tool can never be mistaken
 * for `web_search` or `memory_write`, and once with the server's slug so two
 * servers offering `search` are two different tools. Truncated to the 64
 * characters providers allow, from the tool's end, because the prefix is the
 * part that has to survive intact for the dispatch to work.
 */
export function mcpToolName(slug: string, tool: string): string {
	const head = `${MCP_TOOL_PREFIX}_${slug}_`;
	const tail = tool.replace(/[^a-zA-Z0-9_-]/g, '_');
	return `${head}${tail}`.slice(0, 64);
}

/** Whether a name the model called belongs to an MCP server at all. */
export function isMcpToolName(name: string): boolean {
	return name.startsWith(`${MCP_TOOL_PREFIX}_`);
}

/**
 * Which server and which tool a call names.
 *
 * Resolved against the slugs actually configured rather than by splitting on
 * underscores, because both halves may contain them. The longest matching slug
 * wins, so `mail` and `mail_archive` can both exist.
 */
export function parseMcpToolName(
	name: string,
	slugs: string[]
): { slug: string; tool: string } | null {
	if (!isMcpToolName(name)) return null;

	let best: { slug: string; tool: string } | null = null;
	for (const slug of slugs) {
		const head = `${MCP_TOOL_PREFIX}_${slug}_`;
		if (!name.startsWith(head)) continue;
		if (best && best.slug.length >= slug.length) continue;
		best = { slug, tool: name.slice(head.length) };
	}
	return best;
}

/**
 * An address a server may be reached at, or null.
 *
 * Only the shape is checked here, since this runs in the browser too. Whether
 * the address is one this instance is willing to open is a server-side question,
 * asked where every other outbound request asks it.
 */
export function normaliseMcpUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	return url.toString();
}

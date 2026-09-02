/**
 * MCP servers this instance may call out to.
 *
 * Llooma is a client only: it lists what a server offers, hands the definitions
 * to the model beside its own tools, and forwards the calls back.
 *
 * One transport, HTTP streamable. The other, stdio, spawns a process, which on
 * an instance with accounts on it is arbitrary code execution triggered by an
 * address somebody typed into a form.
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
	/**
	 * The catalogue this server last answered with, by name. Stored rather than
	 * fetched on sight, so the settings can say what a server gives without opening
	 * a connection. What a turn sends is read from the server when the turn starts,
	 * so a stale copy here is an out-of-date list, never a call made against one.
	 */
	tools: string[];
	/** When it said so, ISO. Null for a server nobody has asked yet. */
	toolsAt: string | null;
	/**
	 * Groups this account switched off. Behind a gateway a group is a server, so
	 * this is how "all of the house, none of the mail" is said. The refused ones
	 * rather than the kept ones, so a tool appearing later follows its group.
	 */
	disabledGroups: string[];
}

/** The bounds a turn holds an MCP server to. All of them are about a server that is slow, enormous or hostile. */
export const MCP_LIMITS = {
	/** Servers one account may configure. */
	perUser: 10,
	/**
	 * How many tools reach the model, across every server switched on. A ceiling on
	 * the total, since what costs is the size of a request and a request carries the
	 * lot. A gateway standing in front of a mail server, a calendar and a house
	 * presents the sum of their catalogues, so this is only a default and the number
	 * is the account's own.
	 */
	defaultTools: 200,
	/** What a person may set that number to, whatever the browser sends. */
	minTools: 1,
	maxTools: 500,
	/** Not a limit: a catalogue this size is legitimate and is also paid for on every round. The number is where a bill starts to show it. */
	warnAboveTools: 100,
	/** How much of one result reaches the model, in characters. */
	resultChars: 20_000,
	/** Listing a catalogue, which happens once per turn per server. */
	listTimeoutMs: 10_000,
	/** One call. Generous: an MCP tool may be doing real work at the other end. */
	callTimeoutMs: 30_000,
	/**
	 * How long a call waits for an answer. It has to end somewhere: a turn parked on
	 * a question nobody will answer holds its connections and its run until the
	 * process restarts. Running out counts as a refusal, and the model is told which.
	 */
	approvalTimeoutMs: 120_000
} as const;

/**
 * One call, put to the person before it is made. Every one, not the
 * risky-looking ones: the alternative is us ruling on tools we have never seen,
 * on servers we do not run, from descriptions those servers wrote.
 *
 * It carries what a person needs: which machine, which tool, what it says it
 * does, and the exact arguments.
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
 * A label reduced to `[a-zA-Z0-9_-]{1,64}`, which is what providers accept in a
 * tool name. Falls back to `server`; the caller makes it unique, so a dull name
 * is never a broken one.
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
 * Prefixed twice: `mcp`, so an external tool is never mistaken for `web_search`,
 * and the server's slug, so two servers offering `search` are two tools.
 * Truncated to 64 characters from the tool's end, since the prefix has to
 * survive for the dispatch to work.
 */
export function mcpToolName(slug: string, tool: string): string {
	const head = `${MCP_TOOL_PREFIX}_${slug}_`;
	const tail = tool.replace(/[^a-zA-Z0-9_-]/g, '_');
	return `${head}${tail}`.slice(0, 64);
}

/**
 * The one tool a turn declares when it is discovering rather than announcing.
 *
 * A gateway in front of a mail server, a calendar and a house is sixty-five
 * definitions in every request of every round. This is one, plus the section
 * names, and a section's definitions arrive once the model asks.
 *
 * It costs a round trip and a missed prompt cache, since tools are part of a
 * request's prefix. Worth it for a large catalogue rarely used, not for a small
 * one used constantly, which is why it is a switch.
 */
export const MCP_DISCOVERY_TOOL_NAME = 'mcp_tools';

/** Whether a name the model called belongs to an MCP server at all. */
export function isMcpToolName(name: string): boolean {
	return name.startsWith(`${MCP_TOOL_PREFIX}_`);
}

/** Resolved against the configured slugs rather than by splitting on underscores, which both halves may contain. Longest match wins, so `mail` and `mail_archive` can both exist. */
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
 * The tools of one catalogue, gathered into the servers they came from.
 *
 * A gateway's catalogue arrives flat, but carries a naming habit
 * (`Chatto-post_message`, `home-assistant-HassTurnOn`), so the grouping is the
 * longest prefix ending in `-` that another tool shares. Hyphen only, or
 * `mail_list_emails` would become a group of its own.
 *
 * A reading habit, not a fact: no call or limit is ever decided from it.
 */
export function groupMcpTools(names: string[]): { group: string; tools: string[] }[] {
	const candidates = new Map<string, number>();
	for (const name of names) {
		// Every prefix ending in a hyphen, counted across the catalogue.
		for (let i = 0; i < name.length; i++) {
			if (name[i] === '-')
				candidates.set(name.slice(0, i + 1), (candidates.get(name.slice(0, i + 1)) ?? 0) + 1);
		}
	}

	const groups = new Map<string, string[]>();
	for (const name of names) {
		let best = '';
		for (const [prefix, count] of candidates) {
			if (count < 2 || !name.startsWith(prefix)) continue;
			if (prefix.length > best.length) best = prefix;
		}
		const group = best.slice(0, -1);
		const bucket = groups.get(group);
		if (bucket) bucket.push(name);
		else groups.set(group, [name]);
	}

	// Named groups first, alphabetically; the ungrouped remainder last.
	return [...groups.entries()]
		.map(([group, tools]) => ({ group, tools }))
		.sort((a, b) => {
			if (!a.group !== !b.group) return a.group ? -1 : 1;
			return a.group.localeCompare(b.group);
		});
}

/** Only the shape, since this runs in the browser too. Whether the instance will open the address is asked server-side, with every other outbound request. */
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

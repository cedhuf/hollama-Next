import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { env } from '$env/dynamic/private';
import { APP_SLUG } from '$lib/brand';
import { MCP_LIMITS } from '$lib/mcp';
import { assertReachable, FetchPageError } from '$lib/server/fetchPage';

/**
 * One connection to one MCP server, over HTTP streamable.
 *
 * The transport question is settled in `$lib/mcp` and this file is where it
 * shows: the package's stdio entry point is never imported, so no code path in
 * this process can spawn anything on behalf of a configured server.
 */

/** What went wrong, in a sentence a model can be told. */
export class McpError extends Error {}

/** A tool as its server describes it, reduced to what a `ToolSpec` needs. */
export interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * The addresses this instance will open an MCP connection to.
 *
 * Named separately from `FETCH_ALLOWED_ORIGINS` because it answers a different
 * question, and because of what it unlocks: an MCP server is very often on the
 * same machine or the same LAN as the instance, which the page reader's rule
 * (public addresses only) forbids outright and rightly so. Naming an origin here
 * is an administrator saying "that one, deliberately", which is the only basis on
 * which a private address should ever be reachable.
 *
 * Unset, the public-only rule applies and a homelab server simply cannot be
 * added. That is the safe default for an instance with accounts on it.
 */
function allowedOrigins(): string[] {
	return (env.MCP_ALLOWED_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}

/** Throws unless this instance is willing to open a connection to `url`. */
export async function assertMcpReachable(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new McpError(`Not a valid address: ${raw}`);
	}

	const allowed = allowedOrigins();
	if (allowed.length) {
		// An explicit list is the administrator answering for every address on it,
		// private ones included. Nothing else is reachable while it is set.
		if (!allowed.includes(url.origin)) {
			throw new McpError(`${url.origin} is not in MCP_ALLOWED_ORIGINS`);
		}
		return url;
	}

	try {
		await assertReachable(url, []);
	} catch (cause) {
		const why = cause instanceof FetchPageError ? cause.message : 'Address is not reachable';
		throw new McpError(
			`${why}. A server on a private address has to be named in MCP_ALLOWED_ORIGINS.`
		);
	}
	return url;
}

/**
 * Open a connection, or fail saying why.
 *
 * The token, when there is one, rides as a bearer header on every request the
 * transport makes. No OAuth: the flows in the package need a browser round trip
 * and somewhere to keep the tokens, which is a feature of its own rather than a
 * corner of this one.
 */
export async function connectMcp(url: string, secret: string | null): Promise<Client> {
	const target = await assertMcpReachable(url);

	const transport = new StreamableHTTPClientTransport(target, {
		requestInit: secret ? { headers: { authorization: `Bearer ${secret}` } } : undefined
	});

	const client = new Client({ name: APP_SLUG, version: '1.0.0' });

	try {
		await client.connect(transport, { timeout: MCP_LIMITS.listTimeoutMs });
	} catch (cause) {
		await client.close().catch(() => {});
		throw new McpError(reason(cause));
	}
	return client;
}

/**
 * What the server offers, capped.
 *
 * A catalogue is sent to the model on every round of every turn it is enabled
 * for, so its size is a cost paid repeatedly rather than once. Past the cap the
 * rest is dropped, and the caller says so in the settings tab rather than the
 * model silently never seeing the tail of somebody's server.
 */
export async function listMcpTools(client: Client): Promise<{ tools: McpTool[]; total: number }> {
	let listed: { tools?: unknown[] };
	try {
		listed = await client.listTools(undefined, { timeout: MCP_LIMITS.listTimeoutMs });
	} catch (cause) {
		throw new McpError(reason(cause));
	}

	const all = (listed.tools ?? []) as {
		name?: unknown;
		description?: unknown;
		inputSchema?: unknown;
	}[];

	const tools = all
		.filter((tool): tool is { name: string } & typeof tool => typeof tool.name === 'string')
		.map((tool) => ({
			name: tool.name,
			description: typeof tool.description === 'string' ? tool.description : '',
			// A tool with no usable schema still gets offered, taking no arguments.
			// Refusing it would hide a tool over a detail the model never sees.
			inputSchema:
				tool.inputSchema && typeof tool.inputSchema === 'object'
					? (tool.inputSchema as Record<string, unknown>)
					: { type: 'object', properties: {} }
		}));

	return { tools: tools.slice(0, MCP_LIMITS.toolsPerServer), total: tools.length };
}

/** One call, and what the model should read back from it. */
export async function callMcpTool(
	client: Client,
	tool: string,
	args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
	let result: { content?: unknown; isError?: unknown; structuredContent?: unknown };
	try {
		result = await client.callTool(
			{ name: tool, arguments: args },
			{ timeout: MCP_LIMITS.callTimeoutMs }
		);
	} catch (cause) {
		throw new McpError(reason(cause));
	}

	return { text: renderContent(result), isError: result.isError === true };
}

/**
 * A result turned into text.
 *
 * Text blocks are the common case and pass through. The others are named rather
 * than dropped, because "there was an image here" is something the model has to
 * know in order to say it could not look at it.
 */
function renderContent(result: { content?: unknown; structuredContent?: unknown }): string {
	const blocks = Array.isArray(result.content) ? result.content : [];

	const parts = blocks.map((raw) => {
		const block = raw as {
			type?: string;
			text?: string;
			resource?: { text?: string; uri?: string };
		};
		if (block.type === 'text' && typeof block.text === 'string') return block.text;
		if (block.type === 'image') return '[an image, which cannot be read here]';
		if (block.type === 'audio') return '[audio, which cannot be listened to here]';
		if (block.type === 'resource') {
			const embedded = block.resource;
			if (typeof embedded?.text === 'string') return embedded.text;
			return `[a resource at ${embedded?.uri ?? 'an unnamed address'}]`;
		}
		if (block.type === 'resource_link') {
			const link = raw as { uri?: string; name?: string };
			return `[a link to ${link.name ?? link.uri ?? 'a resource'}]`;
		}
		return '';
	});

	let text = parts.filter(Boolean).join('\n\n').trim();

	// Some servers answer only in `structuredContent`. Falling back to it beats
	// handing the model an empty string and letting it guess what happened.
	if (!text && result.structuredContent) {
		try {
			text = JSON.stringify(result.structuredContent, null, 2);
		} catch {
			text = '';
		}
	}

	if (!text) return 'The tool answered with nothing.';
	if (text.length <= MCP_LIMITS.resultChars) return text;
	return `${text.slice(0, MCP_LIMITS.resultChars)}\n\n[cut here: the answer was longer than this conversation will carry]`;
}

/** The readable half of whatever the package threw. */
function reason(cause: unknown): string {
	if (cause instanceof Error && cause.message) return cause.message;
	return 'The server could not be reached';
}

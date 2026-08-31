import type { Client } from '@modelcontextprotocol/client';

import type { ToolSpec } from '$lib/chat';
import type { McpAccess, McpCallOutcome } from '$lib/chat/run/orchestrator';
import { MCP_LIMITS, mcpToolName, parseMcpToolName } from '$lib/mcp';
import { getSettings } from '$lib/server/db/collections';
import { allowUserMcp } from '$lib/server/db/config';
import { getMcpServerSecret, listMcpServers } from '$lib/server/db/mcpServers';

import { callMcpTool, connectMcp, listMcpTools, McpError } from './client';

/**
 * Every MCP server one account has switched on, for the length of one turn.
 *
 * Opened at the start of the turn rather than at the first call, because the
 * catalogue has to be in the request before the model can want anything from it.
 * A server that cannot be listed does not end the turn: it is left out, named in
 * the trace, and the model answers with the tools that did come back.
 *
 * Nothing here is cached between turns. A connection held open across turns is a
 * connection held open for as long as somebody has a tab open, and the saving is
 * one round trip against a request already measured in seconds.
 */

interface Connected {
	slug: string;
	label: string;
	client: Client;
	specs: ToolSpec[];
	/** What each tool says it does, by its own name, for the question put to the person. */
	purposes: Map<string, string>;
}

/**
 * Whether this account has anything to open, without opening it.
 *
 * A database read and nothing more, asked before the turn decides to find out
 * whether its endpoint can carry tools at all. That question costs a request on
 * Ollama, and asking it for an account with no MCP servers would be a request
 * per turn spent on a feature nobody here uses.
 */
export function hasMcpServers(userId: string, isAdmin: boolean): boolean {
	if (!isAdmin && !allowUserMcp()) return false;
	return listMcpServers(userId).some((server) => server.enabled && !server.blocked);
}

/**
 * Open what this account has, or nothing at all.
 *
 * Null rather than an empty session when there is nothing to offer, so the rest
 * of the turn reads "no MCP" as one condition instead of three.
 */
export async function openMcpSession(userId: string, isAdmin: boolean): Promise<McpAccess | null> {
	if (!isAdmin && !allowUserMcp()) return null;

	// The two switches, and both have to agree: the owner's, and the instance's
	// suspension of that particular server.
	const records = listMcpServers(userId).filter((server) => server.enabled && !server.blocked);
	if (!records.length) return null;

	const connected: Connected[] = [];
	const unavailable: { server: string; error: string }[] = [];

	// In parallel: one unreachable server should cost this turn its own timeout,
	// not that timeout multiplied by however many servers precede it.
	await Promise.all(
		records.map(async (record) => {
			let client: Client | null = null;
			try {
				client = await connectMcp(record.url, getMcpServerSecret(record.id));
				const tools = await listMcpTools(client);
				connected.push({
					slug: record.slug,
					label: record.label,
					client,
					purposes: new Map(tools.map((tool) => [tool.name, tool.description])),
					specs: tools.map((tool) => ({
						name: mcpToolName(record.slug, tool.name),
						description: tool.description || `A tool offered by ${record.label}.`,
						parameters: asObjectSchema(tool.inputSchema)
					}))
				});
			} catch (cause) {
				await client?.close().catch(() => {});
				unavailable.push({
					server: record.label,
					error: cause instanceof McpError ? cause.message : 'Could not be reached'
				});
			}
		})
	);

	if (!connected.length && !unavailable.length) return null;

	const slugs = connected.map((server) => server.slug);

	/**
	 * How many tools this account allows in one request, across every server.
	 *
	 * Clamped rather than trusted: it reaches here from a browser, and a request
	 * carrying ten thousand tool definitions is a request nobody meant to make.
	 */
	const ceiling = Math.min(
		Math.max(
			Math.trunc(getSettings(userId)?.mcpMaxTools ?? MCP_LIMITS.defaultTools) || 0,
			MCP_LIMITS.minTools
		),
		MCP_LIMITS.maxTools
	);

	return {
		/**
		 * Every tool on offer, up to what the account allows.
		 *
		 * Server by server in the order they were configured, so what is left out
		 * when the ceiling bites is the tail of the list rather than an arbitrary
		 * slice of each: a person who has to lose tools can at least see which by
		 * looking at the order of their servers.
		 */
		tools: () => connected.flatMap((server) => server.specs).slice(0, ceiling),
		unavailable: () => unavailable,

		describe(name: string) {
			const parsed = parseMcpToolName(name, slugs);
			const server = parsed && connected.find((entry) => entry.slug === parsed.slug);
			if (!parsed || !server) return null;
			return {
				server: server.label,
				tool: parsed.tool,
				purpose: server.purposes.get(parsed.tool) ?? ''
			};
		},

		close: async () => {
			await Promise.all(connected.map((server) => server.client.close().catch(() => {})));
		},

		async call(name: string, args: Record<string, unknown>): Promise<McpCallOutcome> {
			const parsed = parseMcpToolName(name, slugs);
			const server = parsed && connected.find((entry) => entry.slug === parsed.slug);
			if (!parsed || !server) {
				return {
					server: '',
					tool: name,
					failed: true,
					text: `There is no tool called "${name}".`
				};
			}

			// The catalogue is capped, so a name the model composed from a pattern
			// rather than from the list is a real possibility.
			if (!server.specs.some((spec) => spec.name === name)) {
				return {
					server: server.label,
					tool: parsed.tool,
					failed: true,
					text: `${server.label} does not offer a tool called "${parsed.tool}". Use one of the tools you were given.`
				};
			}

			try {
				const { text, isError } = await callMcpTool(server.client, parsed.tool, args);
				return { server: server.label, tool: parsed.tool, failed: isError, text };
			} catch (cause) {
				const why = cause instanceof McpError ? cause.message : 'The call failed';
				return {
					server: server.label,
					tool: parsed.tool,
					failed: true,
					text: `${server.label} could not run ${parsed.tool}: ${why}. Say so rather than inventing what it would have answered.`
				};
			}
		}
	};
}

/**
 * An MCP input schema, coerced into the object schema a `ToolSpec` promises.
 *
 * MCP says a tool's input schema is an object schema, and providers say the same
 * about a function's parameters, so in practice this passes things through. It
 * exists for the server that says something else: a schema the provider then
 * rejects would fail the whole request, taking every other tool with it, which
 * is a poor way to learn that one server is unusual.
 */
function asObjectSchema(schema: Record<string, unknown>): ToolSpec['parameters'] {
	const properties =
		schema.properties && typeof schema.properties === 'object'
			? (schema.properties as Record<string, unknown>)
			: {};
	const required = Array.isArray(schema.required)
		? schema.required.filter((name): name is string => typeof name === 'string')
		: undefined;

	return { ...schema, type: 'object', properties, ...(required ? { required } : {}) };
}

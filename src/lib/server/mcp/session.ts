import type { Client } from '@modelcontextprotocol/client';

import type { ToolSpec } from '$lib/chat';
import type { McpAccess, McpCallOutcome } from '$lib/chat/run/orchestrator';
import {
	groupMcpTools,
	MCP_DISCOVERY_TOOL_NAME,
	MCP_LIMITS,
	mcpToolName,
	parseMcpToolName
} from '$lib/mcp';
import { getSettings } from '$lib/server/db/collections';
import { allowUserMcp } from '$lib/server/db/config';
import {
	getMcpServerSecret,
	listMcpServers,
	setMcpServerTools,
	type McpServerRecord
} from '$lib/server/db/mcpServers';

import { callMcpTool, connectMcp, listMcpTools, McpError } from './client';

/**
 * Every MCP server one account has switched on, for the length of one turn.
 *
 * Opened at the start, because the catalogue has to be in the request before the
 * model can want anything from it. A server that cannot be listed is left out,
 * named in the trace, and the turn goes on.
 *
 * Nothing is cached between turns: a connection held across turns is one held
 * for as long as somebody has a tab open, against a saving of one round trip.
 */

interface Connected {
	slug: string;
	label: string;
	client: Client;
	specs: ToolSpec[];
	/** One entry per group a gateway's names describe, or a single unnamed one for a server that is only itself. What the model asks for by name. */
	sections: { id: string; label: string; specs: ToolSpec[] }[];
	/** What each tool says it does, by its own name, for the question put to the person. */
	purposes: Map<string, string>;
}

/** A database read and nothing more, asked before the turn finds out whether its endpoint can carry tools, which costs a request on Ollama. */
export function hasMcpServers(userId: string, isAdmin: boolean): boolean {
	if (!isAdmin && !allowUserMcp()) return false;
	return listMcpServers(userId).some((server) => server.enabled && !server.blocked);
}

/**
 * Ask one server what it offers, and write the answer down. The one place a
 * stored catalogue is refreshed. Throws `McpError` with a sentence when it
 * cannot be reached, rather than presenting a stale list as current.
 */
export async function refreshMcpTools(record: McpServerRecord): Promise<string[]> {
	let client: Client | null = null;
	try {
		client = await connectMcp(record.url, getMcpServerSecret(record.id));
		const names = (await listMcpTools(client)).map((tool) => tool.name);
		setMcpServerTools(record.id, names);
		return names;
	} finally {
		await client?.close().catch(() => {});
	}
}

/** Null rather than an empty session when there is nothing to offer, so the rest of the turn reads "no MCP" as one condition instead of three. */
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
				const all = await listMcpTools(client);
				// Groups switched off never reach a request, so they cannot be called either.
				// The grouping is recomputed from what the server answers now, so a tool added
				// to a group that is off stays off without anybody pressing refresh.
				const refused = new Set(record.disabledGroups);
				const groups = groupMcpTools(all.map((tool) => tool.name));
				const dropped = new Set(
					groups.filter(({ group }) => refused.has(group)).flatMap(({ tools }) => tools)
				);
				const tools = all.filter((tool) => !dropped.has(tool.name));
				const specs = tools.map((tool) => ({
					name: mcpToolName(record.slug, tool.name),
					description: tool.description || `A tool offered by ${record.label}.`,
					parameters: asObjectSchema(tool.inputSchema)
				}));

				const byName = new Map(specs.map((spec, index) => [tools[index].name, spec]));
				const sections = groupMcpTools(tools.map((tool) => tool.name)).map(
					({ group, tools: names }) => ({
						// Qualified by the server, since two gateways may both present a group called
						// `mail` and the model has to be able to name one.
						id: group ? `${record.slug}/${group}` : record.slug,
						label: group ? `${record.label} · ${group}` : record.label,
						specs: names.map((name) => byName.get(name)!).filter(Boolean)
					})
				);

				connected.push({
					slug: record.slug,
					label: record.label,
					client,
					purposes: new Map(tools.map((tool) => [tool.name, tool.description])),
					specs,
					sections
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

	/** Clamped rather than trusted: it reaches here from a browser, and a request carrying ten thousand tool definitions is one nobody meant to make. */
	const ceiling = Math.min(
		Math.max(
			Math.trunc(getSettings(userId)?.mcpMaxTools ?? MCP_LIMITS.defaultTools) || 0,
			MCP_LIMITS.minTools
		),
		MCP_LIMITS.maxTools
	);

	/** Experimental and off by default: see the setting for what it trades away. */
	const progressive = getSettings(userId)?.mcpProgressive === true;

	/** The sections of every server, in the order they were configured. */
	const sections = connected.flatMap((server) => server.sections);

	/** What the model has asked to see, by section id. Empty until it asks. */
	const revealed = new Set<string>();

	/** The sections are an enum rather than a free string, so the model picks from what exists, and the description carries how many tools each holds: enough to choose with, at a fraction of the definitions' cost. */
	const discoveryTool = (): ToolSpec => ({
		name: MCP_DISCOVERY_TOOL_NAME,
		description: `Tools you can use, grouped by where they come from, listed only when you ask. Call this with the name of the group you need before trying to use anything from it. Available: ${sections
			.map((section) => `${section.id} (${section.label}, ${section.specs.length} tools)`)
			.join('; ')}.`,
		parameters: {
			type: 'object',
			properties: {
				server: {
					type: 'string',
					description: 'Which group to list.',
					enum: sections.map((section) => section.id)
				}
			},
			required: ['server']
		}
	});

	return {
		/** Server by server in the configured order, so what the ceiling cuts is the tail of the list rather than an arbitrary slice of each. */
		tools: () => {
			if (!progressive) return connected.flatMap((server) => server.specs).slice(0, ceiling);
			if (!sections.length) return [];
			// The one tool, plus whatever has been asked for. What was revealed stays
			// revealed for the turn: a model that had to ask once should not ask again.
			const shown = sections
				.filter((section) => revealed.has(section.id))
				.flatMap((section) => section.specs);
			return [discoveryTool(), ...shown].slice(0, ceiling);
		},
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
			if (name === MCP_DISCOVERY_TOOL_NAME) {
				const wanted = typeof args.server === 'string' ? args.server : '';
				const section = sections.find((entry) => entry.id === wanted);
				if (!section) {
					return {
						server: '',
						tool: MCP_DISCOVERY_TOOL_NAME,
						failed: true,
						text: `There is no group called "${wanted}". The groups are: ${sections.map((entry) => entry.id).join(', ')}.`
					};
				}

				// Revealing is not calling: nothing leaves this process. The calls that follow
				// are each put to the person as usual.
				revealed.add(section.id);
				const listing = section.specs.map((spec) => `${spec.name}: ${spec.description}`).join('\n');
				return {
					server: section.label,
					tool: MCP_DISCOVERY_TOOL_NAME,
					failed: false,
					text: `These tools are now available to you:\n\n${listing}`
				};
			}

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

			// The catalogue is capped, so a name the model composed from a pattern rather
			// than from the list is a real possibility.
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

/** MCP and the providers agree that this is an object schema, so in practice it passes through. It exists for the server that says something else: a schema the provider rejects would fail the whole request, taking every other tool with it. */
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

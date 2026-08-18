/**
 * Whether this turn is driven by native tool calling.
 *
 * The app has two ways to give a model the web: text protocols it answers with
 * (`<read>` blocks, plus a router pre-pass that decides on searching for it), and
 * native tool calls the provider transports as structured fields. The text path
 * is the one that works on every endpoint, so it stays the default and the
 * fallback; native is opted into.
 *
 * Deciding is deliberately conservative. Offering tools to a model that cannot
 * call them is not a clean failure: it improvises, and the user reads a reply with
 * a JSON blob in it, or a claim that it searched when nothing was called.
 */
import { ConnectionType, supportsNativeTools, type Server } from '$lib/connections';
import { resolvePrompt, type PromptKey } from '$lib/defaultPrompts';

import type { ToolSpec } from './index';
import { OllamaStrategy } from './ollama';

export type NativeToolsSetting = 'off' | 'auto' | 'force';

/**
 * The two tools, saying the same things the text prompts say.
 *
 * Built per turn rather than declared once, because the wording is the user's:
 * `toolSearch`, `toolSearchQuery`, `toolReadPage` and `toolReadUrl` sit in
 * Settings beside `searchRouter`, `searchContext` and `searchRead`. The two
 * paths have to produce the same behaviour or a bug becomes a bug on some
 * providers only, which is the kind nobody can reproduce, and that is far easier
 * to keep true when both are edited in the same screen than when one of them is
 * a constant in this file.
 *
 * The names are not editable. They are the wire protocol: the provider echoes
 * one back to say which tool it called, and a renamed tool is a call nobody
 * answers.
 */
export const WEB_SEARCH_TOOL_NAME = 'web_search';
export const READ_PAGE_TOOL_NAME = 'read_page';

type PromptOverrides = Partial<Record<PromptKey, string>> | undefined;

export function webSearchTool(overrides?: PromptOverrides): ToolSpec {
	return {
		name: WEB_SEARCH_TOOL_NAME,
		description: resolvePrompt('toolSearch', overrides),
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: resolvePrompt('toolSearchQuery', overrides) }
			},
			required: ['query']
		}
	};
}

export function readPageTool(overrides?: PromptOverrides): ToolSpec {
	return {
		name: READ_PAGE_TOOL_NAME,
		description: resolvePrompt('toolReadPage', overrides),
		parameters: {
			type: 'object',
			properties: {
				url: { type: 'string', description: resolvePrompt('toolReadUrl', overrides) }
			},
			required: ['url']
		}
	};
}

/**
 * The memory tools, offered only when a persona is speaking and the instance
 * allows it.
 *
 * Native tool calling only, and that is a real limit worth stating rather than
 * hiding: an endpoint that cannot call tools still gets the memory injected and
 * still answers from it, but cannot write to it or open a note by itself. The
 * text protocols carry a read (`<read>`) and a question (`<ask>`); carrying a
 * structured write in prose is where models start inventing fields, and a
 * malformed write to somebody's memory is worse than no write.
 */
export const MEMORY_PROFILE_TOOL_NAME = 'memory_profile';
export const MEMORY_WRITE_TOOL_NAME = 'memory_write';
export const MEMORY_FORGET_TOOL_NAME = 'memory_forget';
export const MEMORY_READ_TOOL_NAME = 'memory_read';

export function memoryTools(overrides?: PromptOverrides): ToolSpec[] {
	return [
		{
			name: MEMORY_PROFILE_TOOL_NAME,
			description: resolvePrompt('toolMemoryProfile', overrides),
			parameters: {
				type: 'object',
				properties: {
					text: {
						type: 'string',
						description: 'The whole block, as it should read from now on.'
					}
				},
				required: ['text']
			}
		},
		{
			name: MEMORY_WRITE_TOOL_NAME,
			description: resolvePrompt('toolMemoryWrite', overrides),
			parameters: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'The note to replace. Leave it out to create a new one.'
					},
					title: { type: 'string', description: 'What the note is about, in a few words.' },
					when: {
						type: 'string',
						description:
							'One line saying when this note matters. This is what you will read later to decide whether to open it, so write it for your future self rather than as a second title.'
					},
					body: { type: 'string', description: 'The note itself.' }
				},
				required: ['title', 'when', 'body']
			}
		},
		{
			name: MEMORY_FORGET_TOOL_NAME,
			description: resolvePrompt('toolMemoryForget', overrides),
			parameters: {
				type: 'object',
				properties: { id: { type: 'string', description: 'The note to forget.' } },
				required: ['id']
			}
		},
		{
			name: MEMORY_READ_TOOL_NAME,
			description: resolvePrompt('toolMemoryRead', overrides),
			parameters: {
				type: 'object',
				properties: { id: { type: 'string', description: 'The note to read, by its id.' } },
				required: ['id']
			}
		}
	];
}

/** Whether this endpoint can carry tool calls at all, asked of the endpoint. */
async function providerSupportsTools(server: Server, model: string): Promise<boolean> {
	// Ollama answers per model, which is the finest-grained answer available
	// anywhere and the reason no per-model setting is needed for it.
	if (server.connectionType === ConnectionType.Ollama) {
		return new OllamaStrategy(server).supportsTools(model);
	}

	return supportsNativeTools(server.connectionType);
}

export async function useNativeTools(
	server: Server,
	model: string,
	setting: NativeToolsSetting
): Promise<boolean> {
	if (setting === 'off') return false;
	// The user asserting support for an endpoint that has no way to advertise it.
	// Taken at their word, including for Ollama: they may know a model handles
	// tools despite an older daemon not listing the capability.
	if (setting === 'force') return true;

	return providerSupportsTools(server, model);
}

/**
 * Whether tools can be sent at all, for the things that have no other way.
 *
 * Not the same question as `useNativeTools`, and conflating them cost memory its
 * whole feature. That setting decides which of two protocols carries the *web*
 * tools, and its default is `off` because the text protocol works everywhere and
 * this one does not. Memory has no text protocol: read through that setting, it
 * was switched off for everybody who had never opened Tools, which is everybody.
 *
 * So this asks the endpoint instead. `force` is still honoured, because someone
 * asserting support for an endpoint that cannot advertise it is answering
 * exactly this question. `off` is not, because it answers a different one, and
 * an endpoint that would choke on tools says so here anyway.
 */
export async function canCarryTools(
	server: Server,
	model: string,
	setting: NativeToolsSetting
): Promise<boolean> {
	if (setting === 'force') return true;
	return providerSupportsTools(server, model);
}

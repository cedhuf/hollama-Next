/**
 * Whether this turn is driven by native tool calling.
 *
 * Two ways to give a model the web: text protocols it answers with, and native
 * tool calls the provider transports as structured fields. The text path works
 * on every endpoint, so it stays the default and the fallback.
 *
 * Deciding is conservative: a model offered tools it cannot call does not fail
 * cleanly, it improvises, and the user reads a JSON blob or a claim that it
 * searched when nothing was called.
 */
import { ConnectionType, supportsNativeTools, type Server } from '$lib/connections';
import { resolvePrompt, type PromptKey } from '$lib/defaultPrompts';

import type { ToolSpec } from './index';
import { OllamaStrategy } from './ollama';

export type NativeToolsSetting = 'off' | 'auto' | 'force';

/**
 * The two tools, saying what the text prompts say. Built per turn because the
 * wording is the user's and sits in Settings beside the text-path prompts: the
 * two paths have to behave the same, which is easier to keep true when both are
 * edited on one screen.
 *
 * The names are not editable. They are the wire protocol: the provider echoes
 * one back to say which tool it called.
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
 * Native tool calling only, which is a real limit: an endpoint that cannot call
 * tools still gets the memory injected and answers from it, but cannot write.
 * Carrying a structured write in prose is where models start inventing fields.
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
	// Ollama answers per model, the finest-grained answer available anywhere.
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
	// The user asserting support for an endpoint with no way to advertise it, taken
	// at their word: they may know a model handles tools despite an older daemon.
	if (setting === 'force') return true;

	return providerSupportsTools(server, model);
}

/**
 * Whether tools can be sent at all, for the things that have no other way.
 *
 * Not the same question as `useNativeTools`, and conflating them cost memory its
 * whole feature: that setting decides which protocol carries the *web* tools and
 * defaults to `off`, so memory was switched off for everybody who had never
 * opened Tools.
 *
 * So this asks the endpoint. `force` is honoured, since asserting support
 * answers exactly this question; `off` is not, since it answers another.
 */
export async function canCarryTools(
	server: Server,
	model: string,
	setting: NativeToolsSetting
): Promise<boolean> {
	if (setting === 'force') return true;
	return providerSupportsTools(server, model);
}
